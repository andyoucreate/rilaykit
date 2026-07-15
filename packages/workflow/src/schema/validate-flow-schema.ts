import type { RilayInstance } from '@rilaykit/core';
import {
  type FormSchema,
  isSchemaEnvelope,
  type SchemaIssue,
  SchemaValidationError,
  validateConditionConfig,
  validateSchema,
  validateSchemaEnvelope,
} from '@rilaykit/forms';
import type { FlowBindings, FlowSchema, FlowSchemaStep } from './flow-schema-types';

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
 * `bindings` resolves the schema's string references (validators, effects) —
 * without it, every such reference is reported as unresolved.
 *
 * @throws {SchemaValidationError} when any `error`-severity issue is found.
 */
export function validateFlowSchema<C extends Record<string, unknown>>(
  schema: FlowSchema,
  catalog: RilayInstance<C>,
  bindings?: FlowBindings
): void {
  const issues: SchemaIssue[] = [];

  validateSchemaEnvelope(schema, 'Flow schema', issues);

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
      validateStep(schema.steps[i], `steps[${i}]`, catalog, bindings, seen, issues);
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
 * Checks shape only (envelope `id`/`version`, `name` string, `steps` array) —
 * use `validateFlowSchema` for catalog-aware validation.
 */
export function isFlowSchema(value: unknown): value is FlowSchema {
  if (!isSchemaEnvelope(value)) {
    return false;
  }
  const candidate = value as Partial<FlowSchema>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.steps);
}

// =================================================================
// INTERNAL HELPERS
// =================================================================

function validateStep<C extends Record<string, unknown>>(
  step: FlowSchemaStep,
  path: string,
  catalog: RilayInstance<C>,
  bindings: FlowBindings | undefined,
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
    collectFormIssues(step.form, path, catalog, bindings, issues);
  }

  validateAllowSkip(step.allowSkip, path, issues);

  if (step.conditions?.visible) {
    validateConditionConfig(step.conditions.visible, `${path}.conditions.visible`, issues);
  }
  if (step.conditions?.skippable) {
    validateConditionConfig(step.conditions.skippable, `${path}.conditions.skippable`, issues);
  }
}

/**
 * Guards the `allowSkip` union before `compileFlow` narrows it.
 *
 * `typeof null === 'object'`, so without this a `null` (or any non-`{ binding }`
 * object) payload would reach `step.allowSkip.binding` and throw a raw
 * TypeError instead of the typed SchemaValidationError. A well-formed but
 * unresolved binding key stays `compileFlow`'s NotFoundError to report.
 */
function validateAllowSkip(
  allowSkip: FlowSchemaStep['allowSkip'],
  path: string,
  issues: SchemaIssue[]
): void {
  if (allowSkip === undefined || typeof allowSkip === 'boolean') {
    return;
  }

  const binding: unknown =
    allowSkip !== null && typeof allowSkip === 'object'
      ? (allowSkip as { binding?: unknown }).binding
      : undefined;

  if (typeof binding !== 'string' || binding.length === 0) {
    issues.push({
      path: `${path}.allowSkip`,
      message: 'Step "allowSkip" must be a boolean or a { binding } reference',
      severity: 'error',
    });
  }
}

function collectFormIssues<C extends Record<string, unknown>>(
  form: FormSchema,
  path: string,
  catalog: RilayInstance<C>,
  bindings: FlowBindings | undefined,
  issues: SchemaIssue[]
): void {
  try {
    validateSchema(form, catalog, bindings);
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
