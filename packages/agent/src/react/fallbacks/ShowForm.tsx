import { useMemo, useRef } from 'react';
import type { FormConfiguration } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import {
  FormBody,
  FormProvider,
  FormSubmit,
  type FormSchema,
  type FormSchemaResult,
  SchemaValidationError,
  compileForm,
} from '@rilaykit/forms';
import { type EmissionResult, toEmissionResult } from '../../errors/emission-error';
import { EmissionErrorView } from './EmissionErrorView';

export interface ShowFormProps {
  /** The agent-emitted FormSchema, untrusted JSON — possibly deep-partial. */
  readonly schema: unknown;
  readonly resolve: (output: unknown) => void;
  /**
   * True while the emission may still grow (a `streaming` part whose raw input
   * is not yet complete JSON). The schema is compiled LENIENTLY — fields mount
   * progressively as their definitions complete — and both answers (submit AND
   * cancel) stay locked: the agent gets exactly one answer per tool call, and
   * never to a question it has not finished asking. No emission error is ever
   * shown while pending; a half-arrived schema is not wrong yet.
   */
  readonly pending?: boolean;
}

type Compiled =
  | { readonly result: FormSchemaResult<Record<string, unknown>>; readonly error: null }
  | { readonly result: null; readonly error: EmissionResult }
  /** Nothing mountable yet (pending only) — render nothing, the next chunk may change that. */
  | { readonly result: null; readonly error: null };

/**
 * A schema only mounts once it can be told apart from every other form: the
 * store-reset seam keys on the form id, so mounting under a builder-generated
 * placeholder id would hand the NEXT chunk (which carries the real id) a form
 * swap — and a reset — instead of growth. The id is emitted first in practice,
 * so this gates at most the opening chunks.
 */
function hasStableIdentity(schema: unknown): boolean {
  if (schema === null || typeof schema !== 'object') return false;
  const id = (schema as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0;
}

/**
 * Built-in HITL renderer for the `show_form` tool: compiles the emitted schema
 * against the catalog and mounts the real form chrome (FormProvider + FormBody +
 * FormSubmit). Bare but functional out of the box — apps override via
 * `.renderers({ tools: { show_form: ... } })`.
 *
 * While the emission is `pending`, the schema is compiled with
 * `{ lenient: true }`: fields whose definitions are complete mount immediately
 * (and stay mounted — `FormProvider` registers appended fields as GROWTH, never
 * resetting what the user already typed), incomplete ones are skipped until a
 * later chunk completes them. `validateProps` rides along in both modes, but in
 * lenient mode a props violation SKIPS the field for the render instead of
 * raising — a field's props mid-stream are temporarily invalid by construction.
 * Only the complete schema is strict-validated, and only then can submit fire.
 *
 * The agent only ever receives ENGINE-VALIDATED values: FormSubmit drives
 * `FormProvider`'s `submit()`, which runs `validateForm` before `onSubmit`
 * fires, so `resolve` cannot carry invalid input.
 *
 * `compileForm` is built for untrusted JSON — it guards the schema root itself
 * and reports every defect as a `SchemaValidationError` — so the `as FormSchema`
 * below is the honest boundary cast, not a blind one. Only that error class is
 * caught: it is `compileForm`'s single documented error contract, and anything
 * else is a bug that must surface.
 */
export function ShowForm({ schema, resolve, pending = false }: ShowFormProps) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo((): Compiled => {
    if (pending && !hasStableIdentity(schema)) return { result: null, error: null };
    try {
      const { formConfig, defaultValues } = compileForm(schema as FormSchema, catalog, {
        validateProps: true,
        lenient: pending,
      });
      return {
        result: {
          formConfig: {
            ...formConfig,
            // Untrusted JSON never chooses to skip validation: an emitted
            // `submitOptions.force` / `skipInvalid` is neutralized at this HITL
            // boundary so `resolve` only ever carries engine-validated values.
            submitOptions: { ...formConfig.submitOptions, force: false, skipInvalid: false },
          },
          defaultValues,
        },
        error: null,
      };
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        // A pending schema is not wrong yet — lenient compilation never raises,
        // so this arm is unreachable while pending; kept as the belt to that
        // braces so a defect degrades to "render nothing" rather than flashing
        // an error view over a half-arrived schema.
        if (pending) return { result: null, error: null };
        return { result: null, error: toEmissionResult(error, ['id', 'fields']) };
      }
      throw error;
    }
  }, [schema, catalog, pending]);

  if (compiled.error) return <EmissionErrorView result={compiled.error} />;
  if (!compiled.result) return null;

  // The agent gets exactly one answer per tool call: a double submit (or a
  // cancel racing a submit) must not resolve twice — and NO answer may leave
  // while the question is still streaming.
  const settle = (output: unknown) => {
    if (pending || settled.current) return;
    settled.current = true;
    resolve(output);
  };

  return (
    <FormProvider
      // FormProvider's prop erases the catalog generic to its default; the
      // provider is catalog-agnostic at runtime (FormField re-widens every
      // entry it renders), so this narrowing at the schema→chrome seam is the
      // same erasure flow.ts performs for `StepDefinition.formConfig`.
      formConfig={compiled.result.formConfig as FormConfiguration}
      defaultValues={compiled.result.defaultValues}
      onSubmit={(values) => settle({ status: 'submitted', values })}
    >
      <FormBody />
      {/* FormSubmit's render-prop is the chrome's own extension point for the
          disabled state: the default button renders `disabled={submitting}`,
          and the streaming lock composes with it rather than replacing it. */}
      <FormSubmit>
        {({ submitting }) => (
          <button type="submit" disabled={pending || submitting} data-form-submit>
            Submit
          </button>
        )}
      </FormSubmit>
      <button
        type="button"
        onClick={() => settle({ status: 'cancelled' })}
        disabled={pending}
        data-agent-cancel
      >
        Cancel
      </button>
    </FormProvider>
  );
}
