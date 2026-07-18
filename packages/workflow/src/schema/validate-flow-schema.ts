import type { RilayInstance } from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import {
  type FormSchema,
  type SchemaIssue,
  SchemaValidationError,
  isSchemaEnvelope,
  validateConditionConfig,
  validateFieldProps,
  validateObjectEntry,
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
 * `options.validateProps` additionally checks every step's field props against
 * their component's `propsSchema`, exactly as `compileForm`'s option of the same
 * name does for a standalone form. Opt-in for the same reason: a catalog may
 * declare no propsSchema at all, and a host compiling its own hand-written
 * schema has already type-checked it.
 *
 * @throws {SchemaValidationError} when any `error`-severity issue is found.
 */
export function validateFlowSchema<C extends Record<string, unknown>>(
  schema: FlowSchema,
  catalog: RilayInstance<C>,
  bindings?: FlowBindings,
  options?: { readonly validateProps?: boolean }
): void {
  const issues: SchemaIssue[] = [];

  // A non-object root cannot be walked any further: report and stop, rather
  // than throwing a raw TypeError off the first property read.
  if (!validateSchemaEnvelope(schema, 'Flow schema', issues)) {
    throw new SchemaValidationError(issues, 'flow');
  }

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
      validateStep(
        schema.steps[i],
        `steps[${i}]`,
        catalog,
        bindings,
        seen,
        issues,
        options?.validateProps === true
      );
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    throw new SchemaValidationError(issues, 'flow');
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
  issues: SchemaIssue[],
  validateProps: boolean
): void {
  if (!validateObjectEntry(step, path, 'Step', issues)) return;

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

  // The public type declares `title: string`, but a backend-authored step is
  // untrusted JSON: without this guard a title-less step compiles straight into
  // a `StepConfig { title: undefined }`.
  if (!step.title || typeof step.title !== 'string') {
    issues.push({
      path: `${path}.title`,
      message: 'Step must have a non-empty "title"',
      severity: 'error',
    });
  }

  const form: unknown = step.form;
  if (form === null || typeof form !== 'object') {
    issues.push({
      path: `${path}.form`,
      message: 'Step must have a "form" object',
      severity: 'error',
    });
  } else {
    collectFormIssues(step.form, path, catalog, bindings, issues, validateProps);
  }

  validateAllowSkip(step.allowSkip, path, bindings, issues);
  validateAfterRef(step.onAfterValidation, path, bindings, issues);

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
 * TypeError instead of the typed SchemaValidationError.
 */
function validateAllowSkip(
  allowSkip: FlowSchemaStep['allowSkip'],
  path: string,
  bindings: FlowBindings | undefined,
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
    return;
  }

  validateBindingRef(
    bindings,
    bindings?.allowSkip,
    binding,
    `${path}.allowSkip`,
    'allowSkip',
    issues
  );
}

/**
 * Guards the `onAfterValidation` binding key and its resolvability.
 */
function validateAfterRef(
  onAfterValidation: FlowSchemaStep['onAfterValidation'],
  path: string,
  bindings: FlowBindings | undefined,
  issues: SchemaIssue[]
): void {
  if (onAfterValidation === undefined) {
    return;
  }

  if (typeof onAfterValidation !== 'string' || onAfterValidation.length === 0) {
    issues.push({
      path: `${path}.onAfterValidation`,
      message: 'Step "onAfterValidation" must be a non-empty binding key',
      severity: 'error',
    });
    return;
  }

  validateBindingRef(
    bindings,
    bindings?.after,
    onAfterValidation,
    `${path}.onAfterValidation`,
    'onAfterValidation',
    issues
  );
}

/**
 * Reports a step binding reference that no supplied binding resolves, or that
 * resolves to something that is not callable.
 *
 * Validation must catch what `compileFlow` would otherwise only discover at
 * resolution time (a NotFoundError from deep inside the compile), so a schema
 * gets one complete verdict up front rather than one failure per round-trip.
 *
 * No-op when the caller supplied NO bindings at all: validating a schema's
 * structure alone — before its bindings exist, or without ever intending to
 * compile it — is a legitimate use, and every reference would read unresolved.
 *
 * The lookup is own-property only: `key` is untrusted, so a `toString`
 * reference must read as absent rather than resolve an inherited method.
 */
function validateBindingRef(
  bindings: FlowBindings | undefined,
  table: Record<string, unknown> | undefined,
  key: string,
  path: string,
  kind: 'allowSkip' | 'onAfterValidation',
  issues: SchemaIssue[]
): void {
  if (bindings === undefined) return;

  const binding = getOwn(table, key);
  if (binding === undefined) {
    issues.push({
      path,
      message: `${kind} binding "${key}" not found in bindings`,
      severity: 'error',
    });
    return;
  }

  // A binding that EXISTS but is not callable is a schema/bindings mismatch.
  // Mirrors the validator/effect guards on the forms side: report it here rather
  // than compiling a step whose `allowSkip` / `after` blows up as a raw
  // TypeError the first time navigation invokes it.
  if (typeof binding !== 'function') {
    issues.push({
      path,
      message: `${kind} binding "${key}" in bindings is not a function`,
      severity: 'error',
    });
  }
}

function collectFormIssues<C extends Record<string, unknown>>(
  form: FormSchema,
  path: string,
  catalog: RilayInstance<C>,
  bindings: FlowBindings | undefined,
  issues: SchemaIssue[],
  validateProps: boolean
): void {
  collectRemapped(() => validateSchema(form, catalog, bindings), path, issues);

  // Opt-in props checking, the mirror of `compileForm`'s own `validateProps`.
  // Runs as part of THIS pass rather than at compile time so a flow reports
  // every step's props violations in one throw — the self-correction loop
  // reading `issues[]` fixes the whole schema per round trip, not one step per
  // round trip. Structural issues first: an unknown component type has no
  // propsSchema to check props against, and `validateFieldProps` skips it.
  if (validateProps) {
    collectRemapped(() => validateFieldProps(form, catalog), path, issues);
  }
}

/**
 * Runs a forms-level validation and re-maps every issue it raises under this
 * step's `steps[i].form.` prefix — a flow's caller authored a FlowSchema, so an
 * issue path has to locate the defect in THAT document.
 */
function collectRemapped(validate: () => void, path: string, issues: SchemaIssue[]): void {
  try {
    validate();
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
