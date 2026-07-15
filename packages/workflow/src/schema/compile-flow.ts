import type { RilayInstance, StepAllowSkip, StepConfig, WorkflowConfig } from '@rilaykit/core';
import { NotFoundError } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import { flow } from '../builders/flow';
import type { CompileFlowOptions, FlowSchema, FlowSchemaStep } from './flow-schema-types';
import { validateFlowSchema } from './validate-flow-schema';

/**
 * Resolves a step's `allowSkip`: a static boolean passes through, a
 * `{ binding }` reference is looked up in `bindings.allowSkip`.
 */
function resolveAllowSkip(
  step: FlowSchemaStep,
  options?: CompileFlowOptions
): StepAllowSkip | undefined {
  if (step.allowSkip === undefined || typeof step.allowSkip === 'boolean') {
    return step.allowSkip;
  }

  const { binding } = step.allowSkip;
  const predicate = options?.bindings?.allowSkip?.[binding];
  if (!predicate) {
    throw new NotFoundError(`allowSkip binding "${binding}" not found for step "${step.id}"`, {
      binding,
      stepId: step.id,
    });
  }
  return predicate;
}

/**
 * Resolves a step's `onAfterValidation` string key from `bindings.after`.
 */
function resolveAfter(
  step: FlowSchemaStep,
  options?: CompileFlowOptions
): StepConfig['onAfterValidation'] {
  if (step.onAfterValidation === undefined) return undefined;

  const key = step.onAfterValidation;
  const handler = options?.bindings?.after?.[key];
  if (!handler) {
    throw new NotFoundError(`onAfterValidation binding "${key}" not found for step "${step.id}"`, {
      binding: key,
      stepId: step.id,
    });
  }
  return handler;
}

/**
 * Compiles a JSON `FlowSchema` into a runtime `WorkflowConfig`.
 *
 * Each step's `form` is compiled through `compileForm`, and every
 * non-serializable reference (`allowSkip` predicates, `onAfterValidation`
 * handlers) is resolved from the supplied `FlowBindings`. All workflow
 * assembly is delegated to the `flow` builder — no builder logic is
 * duplicated here.
 *
 * @throws {SchemaValidationError} when the schema is structurally invalid.
 * @throws {NotFoundError} when a binding reference cannot be resolved.
 */
export function compileFlow<C extends Record<string, unknown>>(
  schema: FlowSchema,
  catalog: RilayInstance<C>,
  options?: CompileFlowOptions
): WorkflowConfig {
  validateFlowSchema(schema, catalog, options?.bindings);

  const builder = flow.create(catalog as never, schema.id, schema.name, schema.description);

  for (const step of schema.steps) {
    const { formConfig } = compileForm(step.form, catalog, { bindings: options?.bindings });

    builder.addStep({
      id: step.id,
      title: step.title,
      description: step.description,
      formConfig,
      conditions: step.conditions,
      allowSkip: resolveAllowSkip(step, options),
      metadata: step.metadata,
      onAfterValidation: resolveAfter(step, options),
    });
  }

  return builder.build();
}
