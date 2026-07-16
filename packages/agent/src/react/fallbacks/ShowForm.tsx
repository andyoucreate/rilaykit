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
  /** The agent-emitted FormSchema, untrusted JSON. */
  readonly schema: unknown;
  readonly resolve: (output: unknown) => void;
}

type Compiled =
  | { readonly result: FormSchemaResult<Record<string, unknown>>; readonly error: null }
  | { readonly result: null; readonly error: EmissionResult };

/**
 * Built-in HITL renderer for the `show_form` tool: compiles the emitted schema
 * against the catalog and mounts the real form chrome (FormProvider + FormBody +
 * FormSubmit). Bare but functional out of the box — apps override via
 * `.renderers({ tools: { show_form: ... } })`.
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
export function ShowForm({ schema, resolve }: ShowFormProps) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo((): Compiled => {
    try {
      return { result: compileForm(schema as FormSchema, catalog), error: null };
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        return { result: null, error: toEmissionResult(error, ['id', 'fields']) };
      }
      throw error;
    }
  }, [schema, catalog]);

  if (compiled.error) return <EmissionErrorView result={compiled.error} />;

  // The agent gets exactly one answer per tool call: a double submit (or a
  // cancel racing a submit) must not resolve twice.
  const settle = (output: unknown) => {
    if (settled.current) return;
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
      <FormSubmit />
      <button type="button" onClick={() => settle({ status: 'cancelled' })} data-agent-cancel>
        Cancel
      </button>
    </FormProvider>
  );
}
