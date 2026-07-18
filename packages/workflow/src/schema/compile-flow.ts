import type { RilayInstance } from '@rilaykit/core';
import { NotFoundError, getOwn } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import { flow } from '../builders/flow';
import type {
  CompileFlowOptions,
  FlowBindings,
  FlowSchema,
  FlowSchemaResult,
  FlowSchemaStep,
} from './flow-schema-types';
import { validateFlowSchema } from './validate-flow-schema';

/**
 * Looks a step-level binding up by key, or throws.
 *
 * The single lookup-or-throw for every `FlowBindings` table, so the
 * unresolved-binding error contract (message + metadata) is defined once.
 *
 * Own-property only: the table is a plain object supplied by the consumer and
 * `key` comes from untrusted schema JSON, so a `toString` reference must read
 * as absent rather than resolve to an inherited method.
 */
function resolveBinding<T>(
  table: Record<string, T> | undefined,
  key: string,
  kind: 'allowSkip' | 'onAfterValidation',
  stepId: string
): T {
  const value = getOwn(table, key);
  if (!value) {
    throw new NotFoundError(`${kind} binding "${key}" not found for step "${stepId}"`, {
      binding: key,
      stepId,
    });
  }
  return value;
}

/**
 * Compiles one step's form, tagging any failure with that step's identity.
 *
 * A form failure raised from inside the per-step `compileForm` otherwise escapes
 * naming only the field it tripped over — on a flow of any size that leaves the
 * caller no way to tell WHICH step carried the bad form. The original error is
 * re-thrown as-is (same class, same `issues`/`meta`), gaining only the step
 * context on its message.
 */
function compileStepForm<C extends Record<string, unknown>>(
  step: FlowSchemaStep,
  index: number,
  catalog: RilayInstance<C>,
  bindings: FlowBindings | undefined
): ReturnType<typeof compileForm<C>> {
  try {
    return compileForm(step.form, catalog, { bindings });
  } catch (error) {
    if (error instanceof Error) {
      error.message = `steps[${index}] (step "${step.id}"): ${error.message}`;
    }
    throw error;
  }
}

/**
 * Compiles a JSON `FlowSchema` into a runtime `WorkflowConfig` plus its
 * step-namespaced default values.
 *
 * Each step's `form` is compiled through `compileForm`, and every
 * non-serializable reference (`allowSkip` predicates, `after` handlers) is
 * resolved from the supplied `FlowBindings`. All workflow assembly is delegated
 * to the `flow` builder — no builder logic is duplicated here.
 *
 * Symmetric with `compileForm`: `WorkflowConfig` has no defaults slot, so each
 * step's compiled `defaultValues` are returned out of band under that step's id
 * — the shape `<Flow defaults>` consumes directly. A step declaring no defaults
 * contributes no key; a flow whose steps declare none yields `undefined`.
 *
 * @example
 * const { workflowConfig, defaultValues } = compileFlow(schema, catalog, { bindings });
 * <Flow of={workflowConfig} defaults={defaultValues} onComplete={handleComplete} />
 *
 * @throws {SchemaValidationError} for every defect in the schema as handed in —
 *   structural errors, unresolved AND non-callable `allowSkip` /
 *   `onAfterValidation` / validator / effect bindings alike, whether or not any
 *   bindings were supplied. `validateFlowSchema` runs first and accumulates all
 *   of them, so this is the ONLY error contract a `compileFlow` caller sees. Its
 *   `documentKind` is `'flow'`.
 * @throws {NotFoundError} never through this function — the resolvers keep their
 *   own guard, reachable only by calling them directly.
 */
export function compileFlow<C extends Record<string, unknown>>(
  schema: FlowSchema,
  catalog: RilayInstance<C>,
  options?: CompileFlowOptions
): FlowSchemaResult {
  const bindings: FlowBindings | undefined = options?.bindings;

  // `?? {}` is load-bearing. `validateFlowSchema` skips binding checks when NO
  // bindings are supplied, because validating a schema's structure before its
  // bindings exist is legitimate — but a COMPILE has no such excuse: the resolve
  // below would then throw an untyped NotFoundError with no `issues[]`, the one
  // escape from this function's error contract. Handing the validator an empty
  // table says "these are the bindings", so every reference is reported at its
  // own path like any other schema defect.
  validateFlowSchema(schema, catalog, bindings ?? {}, { validateProps: options?.validateProps });

  const builder = flow.create(catalog, schema.id, schema.name, schema.description);
  // A Map accumulator, not a plain object: `step.id` is untrusted, and
  // `defaultValues['__proto__'] = x` on a plain object reassigns the prototype
  // instead of recording a key — silently discarding that step's defaults.
  const defaultValues = new Map<string, unknown>();

  for (const [index, step] of schema.steps.entries()) {
    const { formConfig, defaultValues: stepDefaults } = compileStepForm(
      step,
      index,
      catalog,
      bindings
    );

    if (stepDefaults !== undefined) {
      defaultValues.set(step.id, stepDefaults);
    }

    builder.addStep({
      id: step.id,
      title: step.title,
      description: step.description,
      formConfig,
      conditions: step.conditions,
      allowSkip:
        typeof step.allowSkip === 'object'
          ? resolveBinding(bindings?.allowSkip, step.allowSkip.binding, 'allowSkip', step.id)
          : step.allowSkip,
      metadata: step.metadata,
      after:
        step.onAfterValidation === undefined
          ? undefined
          : resolveBinding(bindings?.after, step.onAfterValidation, 'onAfterValidation', step.id),
    });
  }

  return {
    workflowConfig: builder.build(),
    // Mirror compileForm: omit the channel entirely when nothing contributed.
    // `Object.fromEntries` defines every key as an own data property.
    defaultValues: defaultValues.size > 0 ? Object.fromEntries(defaultValues) : undefined,
  };
}
