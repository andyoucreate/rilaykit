import {
  type ConditionConfig,
  type ConditionalBehavior,
  type FieldConfigFor,
  type FieldConfigOf,
  type FieldEffect,
  type FieldValidationConfig,
  type FormValidationConfig,
  InvalidSchemaError,
  NotFoundError,
  type RilayInstance,
  type StandardSchema,
  email as emailValidator,
  maxLength as maxLengthValidator,
  max as maxValidator,
  minLength as minLengthValidator,
  min as minValidator,
  number as numberValidator,
  onChange,
  pattern as patternValidator,
  required as requiredValidator,
  url as urlValidator,
} from '@rilaykit/core';
import { form } from '../builders/form';
import type {
  Bindings,
  CompileFormOptions,
  FieldSchemaEffect,
  FieldSchemaValidation,
  FormSchema,
  FormSchemaField,
  FormSchemaFieldRow,
  FormSchemaRepeatableRow,
  FormSchemaResult,
  FormSchemaRow,
  FormSchemaValidationConfig,
  SchemaIssue,
  ValidationDescriptor,
  ValidationDescriptorObject,
} from './types';
import { SchemaValidationError } from './types';
import { isSchemaEnvelope, validateSchemaEnvelope } from './validate-envelope';

// =================================================================
// BUILT-IN VALIDATOR NAMES
// =================================================================

const ZERO_PARAM_BUILTINS = new Set(['required', 'email', 'url', 'number']);

const PARAMETERIZED_BUILTINS: Record<string, string[]> = {
  minLength: ['min'],
  maxLength: ['max'],
  min: ['min'],
  max: ['max'],
  pattern: ['pattern'],
};

const ALL_BUILTIN_NAMES = new Set([...ZERO_PARAM_BUILTINS, ...Object.keys(PARAMETERIZED_BUILTINS)]);

// =================================================================
// CONDITION OPERATORS (for validation)
// =================================================================

const VALID_CONDITION_OPERATORS = new Set([
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
  'greaterThanOrEqual',
  'lessThanOrEqual',
  'contains',
  'notContains',
  'in',
  'notIn',
  'matches',
  'exists',
  'notExists',
]);

// =================================================================
// PUBLIC API
// =================================================================

/**
 * Compiles a JSON schema into a fully functional FormConfiguration.
 *
 * Uses the existing form builder internally — zero logic duplication.
 * Resolves validation descriptors and effect references via the optional bindings.
 *
 * @param schema - The JSON form schema (from backend or local JSON)
 * @param config - The ril instance containing registered components
 * @param options - Optional compile options ({ bindings } for custom validators/effects,
 *                  { validateProps: true } to check field props against propsSchema)
 * @returns A FormSchemaResult with formConfig and optional defaultValues
 * @throws SchemaValidationError if the schema is invalid, or — with
 *         `validateProps: true` — if any field's props violate its propsSchema
 *
 * @example
 * ```typescript
 * const { formConfig, defaultValues } = compileForm(schema, rilConfig, { bindings });
 * <Form of={formConfig} defaults={defaultValues} onSubmit={handleSubmit} />
 * ```
 */
export function compileForm<C extends Record<string, any>>(
  schema: FormSchema,
  config: RilayInstance<C>,
  options?: CompileFormOptions
): FormSchemaResult<C> {
  const registry = options?.bindings;

  // 1. Validate schema structure
  validateSchema(schema, config, registry);

  // 2. Normalize: flat fields → rows
  const rows = normalizeToRows(schema);

  // 2b. Opt-in: check every field's props against its component's propsSchema
  if (options?.validateProps) {
    validateFieldProps(rows, config);
  }

  // 3. Build via form builder
  const builder = form.create(config, schema.id);

  for (const row of rows) {
    if (isRepeatableRow(row)) {
      const rep = row.repeatable;
      builder.addRepeatable(rep.id, (r) => {
        for (const fieldRow of rep.rows) {
          const resolved = resolveFields<C>(fieldRow.fields, registry);
          r.add(...resolved);
        }
        if (rep.min !== undefined) r.min(rep.min);
        if (rep.max !== undefined) r.max(rep.max);
        if (rep.defaultValue) r.defaultValue(rep.defaultValue);
        if (rep.validation) r.validation(resolveFieldValidation(rep.validation, registry));
        return r;
      });
    } else {
      const fieldRow = row as FormSchemaFieldRow;
      const resolved = resolveFields<C>(fieldRow.fields, registry);
      builder.add(...resolved);
    }
  }

  if (schema.validation) {
    builder.setValidation(resolveFormValidation(schema.validation, registry));
  }

  if (schema.submitOptions) {
    builder.setSubmitOptions(schema.submitOptions);
  }

  // 4. Build
  const formConfig = builder.build();

  // 5. Return separated result — per-field inline defaults merged under the
  //    schema-level defaultValues block (the explicit override wins).
  return {
    formConfig,
    defaultValues: mergeDefaultValues(schema, rows),
  };
}

/**
 * Type guard — checks if a value conforms to the FormSchema structure.
 */
export function isFormSchema(value: unknown): value is FormSchema {
  if (!isSchemaEnvelope(value)) return false;
  const obj = value as Record<string, unknown>;
  const hasFields = Array.isArray(obj.fields);
  const hasRows = Array.isArray(obj.rows);
  // Exactly one of "fields" / "rows" — the form-specific half of the guard.
  return hasFields !== hasRows;
}

// =================================================================
// SCHEMA VALIDATION
// =================================================================

/**
 * Validates a form schema structure before processing.
 * Throws SchemaValidationError with detailed issues if invalid.
 *
 * Only checks what the builder does NOT check:
 * - Schema structure (id, fields/rows presence)
 * - Component existence in ril config
 * - Validator type existence (built-in or registry)
 * - Parameterized validator required params
 * - Effect handler existence in registry
 * - Condition operator validity
 *
 * The builder handles: ID uniqueness, row constraints, bracket validation.
 */
export function validateSchema<C extends Record<string, any>>(
  schema: FormSchema,
  config: RilayInstance<C>,
  registry?: Bindings
): void {
  const issues: SchemaIssue[] = [];

  // Top-level structure
  validateSchemaEnvelope(schema, 'Form schema', issues);

  const hasFields = Array.isArray(schema.fields);
  const hasRows = Array.isArray(schema.rows);

  if (!hasFields && !hasRows) {
    issues.push({
      path: '',
      message: 'Form schema must have either "fields" or "rows"',
      severity: 'error',
    });
  }

  if (hasFields && hasRows) {
    issues.push({
      path: '',
      message: 'Form schema cannot have both "fields" and "rows". Use one or the other.',
      severity: 'error',
    });
  }

  // Validate fields or rows
  if (hasFields && schema.fields) {
    if (schema.fields.length === 0) {
      issues.push({ path: 'fields', message: 'Fields array must not be empty', severity: 'error' });
    }
    for (let i = 0; i < schema.fields.length; i++) {
      validateField(schema.fields[i], `fields[${i}]`, config, registry, issues);
    }
  }

  if (hasRows && schema.rows) {
    if (schema.rows.length === 0) {
      issues.push({ path: 'rows', message: 'Rows array must not be empty', severity: 'error' });
    }
    for (let i = 0; i < schema.rows.length; i++) {
      validateRow(schema.rows[i], `rows[${i}]`, config, registry, issues);
    }
  }

  // Validate form-level validation
  if (schema.validation?.rules) {
    validateValidationDescriptors(schema.validation.rules, 'validation.rules', registry, issues);
  }

  // Throw if any errors
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new SchemaValidationError(issues);
  }
}

// =================================================================
// INTERNAL VALIDATION HELPERS
// =================================================================

function validateRow<C extends Record<string, any>>(
  row: FormSchemaRow,
  path: string,
  config: RilayInstance<C>,
  registry: Bindings | undefined,
  issues: SchemaIssue[]
): void {
  // A null/undefined/non-object entry must funnel into the typed
  // SchemaValidationError rather than throwing a raw TypeError from `row.kind`.
  const rowEntry: unknown = row;
  if (rowEntry === null || typeof rowEntry !== 'object') {
    issues.push({
      path,
      message: 'Row entry must be an object',
      severity: 'error',
    });
    return;
  }

  if (isRepeatableRow(row)) {
    validateRepeatable(row, path, config, registry, issues);
  } else {
    const fieldRow = row as FormSchemaFieldRow;
    if (!Array.isArray(fieldRow.fields) || fieldRow.fields.length === 0) {
      issues.push({
        path: `${path}.fields`,
        message: 'Row must have at least one field',
        severity: 'error',
      });
      return;
    }
    for (let i = 0; i < fieldRow.fields.length; i++) {
      validateField(fieldRow.fields[i], `${path}.fields[${i}]`, config, registry, issues);
    }
  }
}

function validateRepeatable<C extends Record<string, any>>(
  row: FormSchemaRepeatableRow,
  path: string,
  config: RilayInstance<C>,
  registry: Bindings | undefined,
  issues: SchemaIssue[]
): void {
  const rep = row.repeatable;
  const repPath = `${path}.repeatable`;

  if (!rep || typeof rep !== 'object') {
    issues.push({
      path: repPath,
      message: 'Repeatable row must have a "repeatable" object',
      severity: 'error',
    });
    return;
  }

  if (!rep.id || typeof rep.id !== 'string') {
    issues.push({
      path: `${repPath}.id`,
      message: 'Repeatable must have a non-empty "id"',
      severity: 'error',
    });
  }

  if (rep.min !== undefined && rep.min < 0) {
    issues.push({
      path: `${repPath}.min`,
      message: `Repeatable "${rep.id}": min cannot be negative (${rep.min})`,
      severity: 'error',
    });
  }

  if (rep.max !== undefined && rep.max < 0) {
    issues.push({
      path: `${repPath}.max`,
      message: `Repeatable "${rep.id}": max cannot be negative (${rep.max})`,
      severity: 'error',
    });
  }

  if (rep.min !== undefined && rep.max !== undefined && rep.min > rep.max) {
    issues.push({
      path: repPath,
      message: `Repeatable "${rep.id}": min (${rep.min}) cannot be greater than max (${rep.max})`,
      severity: 'error',
    });
  }

  if (!Array.isArray(rep.rows) || rep.rows.length === 0) {
    issues.push({
      path: `${repPath}.rows`,
      message: 'Repeatable must have at least one row',
      severity: 'error',
    });
    return;
  }

  for (let i = 0; i < rep.rows.length; i++) {
    const fieldRow = rep.rows[i];
    if (!Array.isArray(fieldRow.fields) || fieldRow.fields.length === 0) {
      issues.push({
        path: `${repPath}.rows[${i}].fields`,
        message: 'Repeatable row must have at least one field',
        severity: 'error',
      });
      continue;
    }
    for (let j = 0; j < fieldRow.fields.length; j++) {
      validateField(
        fieldRow.fields[j],
        `${repPath}.rows[${i}].fields[${j}]`,
        config,
        registry,
        issues
      );
    }
  }

  if (rep.validation?.rules) {
    validateValidationDescriptors(
      rep.validation.rules,
      `${repPath}.validation.rules`,
      registry,
      issues
    );
  }
}

function validateField<C extends Record<string, any>>(
  field: {
    id?: string;
    type?: string;
    validation?: FieldSchemaValidation;
    effects?: FieldSchemaEffect[];
    conditions?: ConditionalBehavior;
  },
  path: string,
  config: RilayInstance<C>,
  registry: Bindings | undefined,
  issues: SchemaIssue[]
): void {
  // A null/undefined/non-object entry must funnel into the typed
  // SchemaValidationError rather than throwing a raw TypeError from `field.id`.
  const fieldEntry: unknown = field;
  if (fieldEntry === null || typeof fieldEntry !== 'object') {
    issues.push({
      path,
      message: 'Field entry must be an object',
      severity: 'error',
    });
    return;
  }

  if (!field.id || typeof field.id !== 'string') {
    issues.push({
      path: `${path}.id`,
      message: 'Field must have a non-empty "id"',
      severity: 'error',
    });
  }

  if (!field.type || typeof field.type !== 'string') {
    issues.push({
      path: `${path}.type`,
      message: 'Field must have a non-empty "type"',
      severity: 'error',
    });
  } else if (!config.hasComponent(field.type)) {
    issues.push({
      path: `${path}.type`,
      message: `Unknown component type "${field.type}". Must be registered in ril config.`,
      severity: 'error',
    });
  }

  if (field.validation?.rules) {
    validateValidationDescriptors(
      field.validation.rules,
      `${path}.validation.rules`,
      registry,
      issues
    );
  }

  if (field.effects) {
    for (let i = 0; i < field.effects.length; i++) {
      validateEffect(field.effects[i], `${path}.effects[${i}]`, registry, issues);
    }
  }

  if (field.conditions) {
    validateConditions(field.conditions, path, issues);
  }
}

function validateValidationDescriptors(
  rules: ValidationDescriptor | ValidationDescriptor[],
  path: string,
  registry: Bindings | undefined,
  issues: SchemaIssue[]
): void {
  const descriptors = Array.isArray(rules) ? rules : [rules];

  for (let i = 0; i < descriptors.length; i++) {
    const descriptor = descriptors[i];
    const descPath = Array.isArray(rules) ? `${path}[${i}]` : path;

    if (typeof descriptor === 'string') {
      if (!ZERO_PARAM_BUILTINS.has(descriptor)) {
        issues.push({
          path: descPath,
          message: `Unknown validation shortcut "${descriptor}". Valid shortcuts: ${[...ZERO_PARAM_BUILTINS].join(', ')}`,
          severity: 'error',
        });
      }
    } else if (typeof descriptor === 'object' && descriptor !== null) {
      const { type, params } = descriptor;

      if (!type || typeof type !== 'string') {
        issues.push({
          path: `${descPath}.type`,
          message: 'Validation descriptor must have a "type"',
          severity: 'error',
        });
        continue;
      }

      // Check parameterized built-ins
      if (PARAMETERIZED_BUILTINS[type]) {
        const requiredParams = PARAMETERIZED_BUILTINS[type];
        for (const param of requiredParams) {
          if (!params || params[param] === undefined) {
            issues.push({
              path: `${descPath}.params.${param}`,
              message: `Validator "${type}" requires param "${param}"`,
              severity: 'error',
            });
          }
        }

        // Validate regex syntax for pattern validators
        if (type === 'pattern' && params?.pattern !== undefined) {
          try {
            new RegExp(params.pattern as string);
          } catch {
            issues.push({
              path: `${descPath}.params.pattern`,
              message: `Invalid regex pattern: "${params.pattern}"`,
              severity: 'error',
            });
          }
        }
      } else if (!ALL_BUILTIN_NAMES.has(type)) {
        // Check registry
        if (!registry?.validators?.[type]) {
          issues.push({
            path: descPath,
            message: `Unknown validator type "${type}". Not a built-in and not found in registry.`,
            severity: 'error',
          });
        }
      }
    } else {
      issues.push({
        path: descPath,
        message: 'Validation descriptor must be a string or object',
        severity: 'error',
      });
    }
  }
}

function validateEffect(
  effect: FieldSchemaEffect,
  path: string,
  registry: Bindings | undefined,
  issues: SchemaIssue[]
): void {
  if (!effect.watch || typeof effect.watch !== 'string') {
    issues.push({
      path: `${path}.watch`,
      message: 'Effect must have a non-empty "watch" field ID',
      severity: 'error',
    });
  }

  if (!effect.handler || typeof effect.handler !== 'string') {
    issues.push({
      path: `${path}.handler`,
      message: 'Effect must have a non-empty "handler" registry key',
      severity: 'error',
    });
  } else if (!registry?.effects?.[effect.handler]) {
    issues.push({
      path: `${path}.handler`,
      message: `Effect handler "${effect.handler}" not found in registry`,
      severity: 'error',
    });
  }
}

function validateConditions(
  conditions: ConditionalBehavior,
  path: string,
  issues: SchemaIssue[]
): void {
  const behaviorKeys = ['visible', 'disabled', 'required', 'readonly'] as const;

  for (const key of behaviorKeys) {
    if (conditions[key]) {
      validateConditionConfig(conditions[key], `${path}.conditions.${key}`, issues);
    }
  }
}

/**
 * Recursively validates a serialized condition tree.
 *
 * The single walker for every `ConditionConfig` in a schema — field-level
 * (forms) and step-level (workflow) alike — so both surfaces enforce the same
 * rules: operator whitelist, leaf `field`, and the `matches`-string
 * serialization constraint.
 */
export function validateConditionConfig(
  condition: ConditionConfig,
  path: string,
  issues: SchemaIssue[]
): void {
  // A `RegExp` does not JSON round-trip, so a serialized `matches` condition
  // must carry a string pattern. Checked before the composite early-return so
  // the rule holds at every node of the tree.
  if (condition.operator === 'matches' && typeof condition.value !== 'string') {
    issues.push({
      path: `${path}.value`,
      message: 'matches must use a string pattern in a serialized schema',
      severity: 'error',
    });
  }

  // Composite condition (has sub-conditions)
  if (condition.conditions && condition.conditions.length > 0) {
    for (let i = 0; i < condition.conditions.length; i++) {
      validateConditionConfig(condition.conditions[i], `${path}.conditions[${i}]`, issues);
    }
    return;
  }

  // Leaf condition — must have field and valid operator
  if (!condition.field || typeof condition.field !== 'string') {
    issues.push({
      path: `${path}.field`,
      message: 'Leaf condition must have a non-empty "field"',
      severity: 'warning',
    });
  }

  if (condition.operator && !VALID_CONDITION_OPERATORS.has(condition.operator)) {
    issues.push({
      path: `${path}.operator`,
      message: `Invalid condition operator "${condition.operator}"`,
      severity: 'error',
    });
  }
}

// =================================================================
// RESOLVE HELPERS
// =================================================================

/**
 * Normalizes a schema to always use rows format.
 * Flat fields → one field per row.
 */
function normalizeToRows(schema: FormSchema): FormSchemaRow[] {
  if (schema.rows) return schema.rows;
  if (!schema.fields) return [];

  return schema.fields.map((field) => ({
    kind: 'fields' as const,
    fields: [field],
  }));
}

function isRepeatableRow(row: FormSchemaRow): row is FormSchemaRepeatableRow {
  return row.kind === 'repeatable';
}

/**
 * Collects every field of a normalized row list, repeatable templates included.
 * The props of a repeatable's template fields are as compilable — and as
 * wrong-able — as any other field's, so prop validation must see them too.
 */
function collectAllFields(rows: FormSchemaRow[]): FormSchemaField[] {
  return rows.flatMap((row) =>
    isRepeatableRow(row) ? row.repeatable.rows.flatMap((fieldRow) => fieldRow.fields) : row.fields
  );
}

/**
 * Checks every field's `props` against its component's `propsSchema`.
 *
 * Accumulates across all fields so an agent gets the complete correction list in
 * one pass instead of one violation per round-trip.
 *
 * @throws SchemaValidationError if any field's props violate its propsSchema
 * @throws ConfigurationError if a component's propsSchema validates asynchronously
 *   — a catalog defect, not a schema defect, so it is never collected as an issue
 */
function validateFieldProps<C>(rows: FormSchemaRow[], config: RilayInstance<C>): void {
  const issues: SchemaIssue[] = [];

  for (const field of collectAllFields(rows)) {
    // Unknown component types are already reported by validateSchema (see
    // validateField, same hasComponent check) — don't duplicate the issue.
    if (!config.hasComponent(field.type)) continue;

    const result = config.validateProps(field.type, field.props ?? {});
    if (result.success) continue;

    for (const issue of result.issues) {
      issues.push({ path: field.id, message: issue.message, severity: 'error' });
    }
  }

  if (issues.length > 0) {
    throw new SchemaValidationError(issues);
  }
}

/**
 * Collects every top-level field of a normalized row list.
 * Repeatable templates are excluded — their per-item defaults come from
 * `FormSchemaRepeatable.defaultValue`, not from the form's `defaultValues`.
 */
function collectTopLevelFields(rows: FormSchemaRow[]): FormSchemaField[] {
  return rows.flatMap((row) => (isRepeatableRow(row) ? [] : row.fields));
}

/**
 * Merges per-field inline `default` values with the schema-level
 * `defaultValues` block. The schema-level block is the explicit override, so it
 * is spread LAST and wins on key collisions.
 *
 * Returns `undefined` when neither source contributes anything, keeping the
 * result identical to the pre-inline-default behaviour for schemas that use no
 * defaults at all.
 */
function mergeDefaultValues(
  schema: FormSchema,
  rows: FormSchemaRow[]
): Record<string, unknown> | undefined {
  const inlineDefaults: Record<string, unknown> = {};
  for (const field of collectTopLevelFields(rows)) {
    if (field.default !== undefined) {
      inlineDefaults[field.id] = field.default;
    }
  }

  const hasInline = Object.keys(inlineDefaults).length > 0;
  if (!hasInline) return schema.defaultValues;

  return { ...inlineDefaults, ...(schema.defaultValues ?? {}) };
}

/**
 * Converts schema fields into catalog-typed field configs.
 * Resolves validation descriptors and effect references.
 *
 * The lone cast narrows the catalog key at the schema→catalog boundary, and
 * nothing else. A JSON schema carries an opaque `type: string`; only
 * `validateSchema` (via `config.hasComponent`) proves it is a key of `C`, and
 * that runtime proof cannot be expressed to the compiler. Every other slot of
 * the literal is checked against the catalog-agnostic instantiation of the very
 * same `FieldConfigOf` the builder consumes, so the shape cannot drift — every
 * consumer downstream, the builder's `.add(...)` included, then type-checks with
 * no cast of its own.
 */
function resolveFields<C>(fields: FormSchemaField[], registry?: Bindings): FieldConfigFor<C>[] {
  return fields.map((field) => {
    const resolved: FieldConfigOf<Record<string, Record<string, unknown>>, string> = {
      id: field.id,
      type: field.type,
      props: field.props,
      ...(field.validation
        ? { validation: resolveFieldValidation(field.validation, registry) }
        : {}),
      ...(field.conditions ? { conditions: field.conditions } : {}),
      ...(field.effects && field.effects.length > 0
        ? { effects: resolveEffects(field.effects, registry) }
        : {}),
    };

    return resolved as unknown as FieldConfigFor<C>;
  });
}

/**
 * Resolves one or more validation descriptors into the `validate` value shared
 * by field- and form-level validation configs: a single schema stays single, a
 * list stays a list, and absent rules resolve to `undefined`.
 */
function resolveRuleSchemas<T = unknown>(
  rules: ValidationDescriptor | ValidationDescriptor[] | undefined,
  registry?: Bindings
): StandardSchema<T> | StandardSchema<T>[] | undefined {
  if (!rules) return undefined;
  const descriptors = Array.isArray(rules) ? rules : [rules];
  const schemas = descriptors.map((descriptor) => resolveValidationDescriptor(descriptor, registry));
  // Descriptors are resolved from string keys at runtime, so the schema's input
  // type cannot be known statically — the caller's `T` is the contract. This is
  // the single, deliberate cast of the schema-resolution path.
  return (schemas.length === 1 ? schemas[0] : schemas) as StandardSchema<T> | StandardSchema<T>[];
}

/**
 * Resolves field-level validation descriptors into a FieldValidationConfig.
 */
export function resolveFieldValidation(
  validation: FieldSchemaValidation,
  registry?: Bindings
): FieldValidationConfig {
  // `validate` is readonly on FieldValidationConfig, so it is resolved up-front
  // and spread in at construction rather than assigned through a cast.
  const validate = resolveRuleSchemas(validation.rules, registry);

  return {
    validateOnChange: validation.validateOnChange,
    validateOnBlur: validation.validateOnBlur,
    debounceMs: validation.debounceMs,
    ...(validate === undefined ? {} : { validate }),
  };
}

/**
 * Resolves form-level validation descriptors into a FormValidationConfig.
 */
function resolveFormValidation(
  validation: FormSchemaValidationConfig,
  registry?: Bindings
): FormValidationConfig {
  // Same readonly-`validate` construction as resolveFieldValidation.
  const validate = resolveRuleSchemas<Record<string, any>>(validation.rules, registry);

  return {
    validateOnSubmit: validation.validateOnSubmit,
    validateOnStepChange: validation.validateOnStepChange,
    ...(validate === undefined ? {} : { validate }),
  };
}

/**
 * Resolves a single validation descriptor into a StandardSchema.
 */
export function resolveValidationDescriptor(
  descriptor: ValidationDescriptor,
  registry?: Bindings
): StandardSchema {
  // String shortcut
  if (typeof descriptor === 'string') {
    return resolveBuiltinValidator(descriptor);
  }

  // Object descriptor
  const { type, params, message } = descriptor;

  // Built-in with params
  if (ALL_BUILTIN_NAMES.has(type)) {
    return resolveBuiltinValidator(type, params, message);
  }

  // Registry lookup
  if (registry?.validators?.[type]) {
    return registry.validators[type](params, message);
  }

  throw new InvalidSchemaError(`Unknown validator type: "${type}"`, { type });
}

/**
 * Maps a built-in validator name to its RilayKit function.
 */
function resolveBuiltinValidator(
  type: string,
  params?: Record<string, unknown>,
  message?: string
): StandardSchema {
  switch (type) {
    case 'required':
      return requiredValidator(message);
    case 'email':
      return emailValidator(message);
    case 'url':
      return urlValidator(message);
    case 'number':
      return numberValidator(message);
    case 'minLength':
      return minLengthValidator(params?.min as number, message);
    case 'maxLength':
      return maxLengthValidator(params?.max as number, message);
    case 'min':
      return minValidator(params?.min as number, message);
    case 'max':
      return maxValidator(params?.max as number, message);
    case 'pattern': {
      try {
        const regex = new RegExp(params?.pattern as string);
        return patternValidator(regex, message);
      } catch {
        throw new SchemaValidationError([
          {
            path: 'validation.rules',
            message: `Invalid regex pattern: "${params?.pattern}"`,
            severity: 'error',
          },
        ]);
      }
    }
    default:
      throw new InvalidSchemaError(`Unknown built-in validator: "${type}"`, { type });
  }
}

/**
 * Resolves effect descriptors into FieldEffect objects.
 * Curries params into the handler signature.
 */
function resolveEffects(effects: FieldSchemaEffect[], registry?: Bindings): FieldEffect[] {
  return effects.map((effect) => {
    const registryHandler = registry?.effects?.[effect.handler];
    if (!registryHandler) {
      throw new NotFoundError(`Effect handler "${effect.handler}" not found in registry`, {
        handler: effect.handler,
      });
    }

    // Curry params into a standard FieldEffectHandler (2 args)
    const params = effect.params;
    return onChange(effect.watch, (newValue, context) =>
      registryHandler(newValue, context, params)
    );
  });
}
