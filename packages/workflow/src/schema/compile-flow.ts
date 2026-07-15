import type { RilayInstance } from '@rilaykit/core';
import { NotFoundError, getOwn } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import { flow } from '../builders/flow';
import type {
  CompileFlowOptions,
  FlowBindings,
  FlowSchema,
  FlowSchemaResult,
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
 * @throws {SchemaValidationError} when the schema is structurally invalid.
 * @throws {NotFoundError} when a binding reference cannot be resolved.
 */
export function compileFlow<C extends Record<string, unknown>>(
  schema: FlowSchema,
  catalog: RilayInstance<C>,
  options?: CompileFlowOptions
): FlowSchemaResult {
  const bindings: FlowBindings | undefined = options?.bindings;

  validateFlowSchema(schema, catalog, bindings);

  const builder = flow.create(catalog, schema.id, schema.name, schema.description);
  // A Map accumulator, not a plain object: `step.id` is untrusted, and
  // `defaultValues['__proto__'] = x` on a plain object reassigns the prototype
  // instead of recording a key — silently discarding that step's defaults.
  const defaultValues = new Map<string, unknown>();

  for (const step of schema.steps) {
    const { formConfig, defaultValues: stepDefaults } = compileForm(step.form, catalog, {
      bindings,
    });

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
