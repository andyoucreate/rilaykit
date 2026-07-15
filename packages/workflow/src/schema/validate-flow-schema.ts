import type { RilayInstance } from '@rilaykit/core';
import {
  type SchemaIssue,
  SchemaValidationError,
  validateConditionConfig,
  validateSchema,
  validateSchemaEnvelope,
} from '@rilaykit/forms';
import type { FlowSchema, FlowSchemaStep } from './flow-schema-types';

// =================================================================
// FLOW SCHEMA VALIDATION
// =================================================================

/**
 * Structurally validates a `FlowSchema` against a catalog.
 *
 * Delegates each step's `form` to the forms `validateSchema`, re-mapping its
 * issue paths under `steps[i].form.`, and each step's condition tree to the
 * shared `validateConditionConfig` walker — so step conditions and field
 * conditions enforce an identical rule set.
 *
 * @throws {SchemaValidationError} when any `error`-severity issue is found.
 */
export function validateFlowSchema<C extends Record<string, unknown>>(
  schema: FlowSchema,
  catalog: RilayInstance<C>
): void {
  const issues: SchemaIssue[] = [];

  validateSchemaEnvelope(
    schema,
    { schemaLabel: 'Flow schema', versionLabel: 'flow schema' },
    issues
  );

  if (!schema.name || typeof schema.name !== 'string') {
    issues.push({
      path: 'name',
      message: 'Flow schema must have a non-empty "name"',
      severity: 'error',
    });
  }

  if (!Array.isArray(schema.steps)) {
    issues.push({
      path: 'steps',
      message: 'Flow schema must have a "steps" array',
      severity: 'error',
    });
  } else if (schema.steps.length === 0) {
    issues.push({ path: 'steps', message: 'Steps array must not be empty', severity: 'error' });
  } else {
    const seen = new Set<string>();
    for (let i = 0; i < schema.steps.length; i++) {
      validateStep(schema.steps[i], `steps[${i}]`, catalog, seen, issues);
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    throw new SchemaValidationError(issues);
  }
}

/**
 * Structural type guard for a `FlowSchema`.
 *
 * Checks shape only (`id`/`name` strings, `steps` array) — use
 * `validateFlowSchema` for catalog-aware validation.
 */
export function isFlowSchema(value: unknown): value is FlowSchema {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<FlowSchema>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.steps)
  );
}

// =================================================================
// INTERNAL HELPERS
// =================================================================

function validateStep<C extends Record<string, unknown>>(
  step: FlowSchemaStep,
  path: string,
  catalog: RilayInstance<C>,
  seen: Set<string>,
  issues: SchemaIssue[]
): void {
  // A null/undefined/non-object entry must funnel into the typed
  // SchemaValidationError rather than throwing a raw TypeError from `step.id`.
  const entry: unknown = step;
  if (entry === null || typeof entry !== 'object') {
    issues.push({ path, message: 'Step entry must be an object', severity: 'error' });
    return;
  }

  if (!step.id || typeof step.id !== 'string') {
    issues.push({
      path: `${path}.id`,
      message: 'Step must have a non-empty "id"',
      severity: 'error',
    });
  } else if (seen.has(step.id)) {
    issues.push({
      path: `${path}.id`,
      message: `Duplicate step id "${step.id}"`,
      severity: 'error',
    });
  } else {
    seen.add(step.id);
  }

  const form: unknown = step.form;
  if (form === null || typeof form !== 'object') {
    issues.push({
      path: `${path}.form`,
      message: 'Step must have a "form" object',
      severity: 'error',
    });
  } else {
    collectFormIssues(step, path, catalog, issues);
  }

  if (step.conditions?.visible) {
    validateConditionConfig(step.conditions.visible, `${path}.conditions.visible`, issues);
  }
  if (step.conditions?.skippable) {
    validateConditionConfig(step.conditions.skippable, `${path}.conditions.skippable`, issues);
  }
}

function collectFormIssues<C extends Record<string, unknown>>(
  step: FlowSchemaStep,
  path: string,
  catalog: RilayInstance<C>,
  issues: SchemaIssue[]
): void {
  try {
    validateSchema(step.form, catalog);
  } catch (error) {
    if (!(error instanceof SchemaValidationError)) {
      throw error;
    }
    for (const issue of error.issues) {
      issues.push({
        ...issue,
        path: issue.path ? `${path}.form.${issue.path}` : `${path}.form`,
      });
    }
  }
}
