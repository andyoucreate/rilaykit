import {
  type ConditionConfig,
  type ConditionalBehavior,
  ConfigurationError,
  type FieldConfigFor,
  type FieldConfigOf,
  type FieldEffect,
  type FieldValidationConfig,
  type FormConfiguration,
  type FormValidationConfig,
  InvalidSchemaError,
  MaxDepthExceededError,
  NotFoundError,
  type PropsValidationResult,
  type RilayInstance,
  type StandardSchema,
  type SubmitOptions,
  ValidationError,
  clonePlainData,
  email as emailValidator,
  getOwn,
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
  FormSchemaRepeatable,
  FormSchemaRepeatableRow,
  FormSchemaResult,
  FormSchemaRow,
  FormSchemaValidationConfig,
  SchemaIssue,
  ValidationDescriptor,
  ValidationDescriptorObject,
} from './types';
import { SchemaValidationError } from './types';
import { isSchemaEnvelope, validateObjectEntry, validateSchemaEnvelope } from './validate-envelope';

// =================================================================
// BUILT-IN VALIDATOR NAMES
// =================================================================

const ZERO_PARAM_BUILTINS = new Set(['required', 'email', 'url', 'number']);

/**
 * A Map, not a plain object: this table is indexed by an untrusted schema's
 * `type`, and a plain object would answer `toString` / `constructor` /
 * `__proto__` with an inherited method instead of `undefined`.
 */
const PARAMETERIZED_BUILTINS = new Map<string, string[]>([
  ['minLength', ['min']],
  ['maxLength', ['max']],
  ['min', ['min']],
  ['max', ['max']],
  ['pattern', ['pattern']],
]);

const ALL_BUILTIN_NAMES = new Set([...ZERO_PARAM_BUILTINS, ...PARAMETERIZED_BUILTINS.keys()]);

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

/**
 * The composite half of the operator whitelist.
 *
 * The evaluator reads `logicalOperator === 'or'` and treats EVERYTHING else as
 * AND, so an unlisted value (a miscased `"OR"`, a typo) is not a no-op: it
 * silently inverts the author's intent. It has to be rejected, not defaulted.
 */
const VALID_LOGICAL_OPERATORS = new Set(['and', 'or']);

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

  // 1. Validate schema structure. Lenient mode inverts the contract: instead of
  //    validating the whole schema and raising, the SAME per-field validators
  //    (validateField, validateRepeatable, validateValidationDescriptors —
  //    never a second compile path) decide which declarations are complete, and
  //    everything else is filtered out of a compilable subset. The subset then
  //    rides the ONE assembly path below, so lenient cannot drift from strict.
  let compilable: FormSchema;
  if (options?.lenient) {
    compilable = toCompilableSubset(schema, config, registry, options?.validateProps === true);
  } else {
    validateSchema(schema, config, registry);
    compilable = schema;
  }

  // 2. Normalize: flat fields → rows
  const rows = normalizeToRows(compilable);

  // 2b. Opt-in: check every field's props against its component's propsSchema.
  //     Walks the ORIGINAL schema, not the normalized rows, so issue paths point
  //     at the caller's own declaration. Validation ONLY — the schema's output is
  //     deliberately discarded; see validateFieldProps.
  //
  //     In lenient mode this pass never runs: a field whose props are still
  //     streaming is temporarily invalid, and raising would fail the WHOLE
  //     partial schema for a defect the next chunk may fix. toCompilableSubset
  //     already applied the same propsSchema check PER FIELD and skipped the
  //     violators, so the subset reaching this point is props-clean. Only a
  //     complete schema (strict mode, at `ready`) gets the raising variant.
  if (options?.validateProps && !options.lenient) validateFieldProps(compilable, config);

  // 3-4. Assemble and build via the form builder.
  //
  //  The builder owns checks the schema walker cannot do alone (id uniqueness
  //  across rows and repeatables, characters reserved for composite keys).
  //  Direct builder users keep its own error classes; the SCHEMA path
  //  re-surfaces them as SchemaValidationError so a schema consumer only ever
  //  handles ONE error contract.
  //
  //  The wrap spans ASSEMBLY, not just `build()`: `addRepeatable` rejects a
  //  bracketed id at call time with a ConfigurationError, long before build()
  //  is reached.
  let formConfig: FormConfiguration<C>;
  try {
    formConfig = assembleForm<C>(compilable, rows, config, registry);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new SchemaValidationError(builderErrorToIssues(error, compilable));
    }
    if (error instanceof ConfigurationError) {
      throw new SchemaValidationError(configurationErrorToIssues(error, compilable));
    }
    throw error;
  }

  // 5. Return separated result — per-field inline defaults merged under the
  //    schema-level defaultValues block (the explicit override wins).
  return {
    formConfig,
    defaultValues: mergeDefaultValues(compilable, rows),
  };
}

/**
 * Drives the form builder from a normalized schema.
 *
 * Extracted so ONE try/catch can span the whole builder interaction: the
 * builder raises some defects while being fed (`addRepeatable`) and others only
 * at `build()`, and both must reach the schema error contract.
 */
function assembleForm<C extends Record<string, any>>(
  schema: FormSchema,
  rows: FormSchemaRow[],
  config: RilayInstance<C>,
  registry: Bindings | undefined
): FormConfiguration<C> {
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

  return builder.build();
}

/**
 * Re-surfaces a builder `ConfigurationError` as schema `issues[]`.
 *
 * The builder's message is authoritative and is kept verbatim; only the PATH
 * has to be recovered, which the error's `meta` (`{ id }`, plus `{ fieldId }`
 * for a repeatable's template field) makes possible. An error that names no
 * locatable declaration degrades to a root-path issue rather than being lost.
 */
function configurationErrorToIssues(error: ConfigurationError, schema: FormSchema): SchemaIssue[] {
  const meta = error.meta ?? {};
  const id = typeof meta.id === 'string' ? meta.id : undefined;
  const fieldId = typeof meta.fieldId === 'string' ? meta.fieldId : undefined;

  return [
    {
      path: id === undefined ? '' : (locateRepeatablePath(schema, id, fieldId) ?? ''),
      message: error.message,
      severity: 'error',
    },
  ];
}

/**
 * Finds the schema path of a repeatable declaration, or of one of its template
 * fields when `fieldId` is given. Returns undefined when nothing matches.
 */
function locateRepeatablePath(
  schema: FormSchema,
  repeatableId: string,
  fieldId: string | undefined
): string | undefined {
  if (!Array.isArray(schema.rows)) return undefined;

  for (let i = 0; i < schema.rows.length; i++) {
    const row = schema.rows[i];
    if (row === null || typeof row !== 'object' || !isRepeatableRow(row)) continue;
    if (row.repeatable?.id !== repeatableId) continue;

    const repeatablePath = `rows[${i}].repeatable`;
    if (fieldId === undefined) return `${repeatablePath}.id`;

    const fieldRows = row.repeatable.rows;
    if (!Array.isArray(fieldRows)) return `${repeatablePath}.id`;
    for (let j = 0; j < fieldRows.length; j++) {
      const fields = fieldRows[j]?.fields;
      if (!Array.isArray(fields)) continue;
      for (let k = 0; k < fields.length; k++) {
        if (fields[k]?.id === fieldId) {
          return `${repeatablePath}.rows[${j}].fields[${k}].id`;
        }
      }
    }
    return `${repeatablePath}.id`;
  }

  return undefined;
}

/**
 * Re-surfaces a builder `ValidationError` as schema `issues[]`.
 *
 * The builder owns the id-uniqueness checks the schema walker cannot do alone,
 * but it reports them as a core ValidationError with a flat message — escaping
 * the `issues[]` contract that schema consumers (and P3 self-correction) rely
 * on. This walks the ORIGINAL schema so every duplicate id gets a path pointing
 * at the offending declaration; anything not attributable to a specific field
 * degrades to a root-path issue rather than being lost.
 */
function builderErrorToIssues(error: ValidationError, schema: FormSchema): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const seen = new Set<string>();

  const visitField = (field: { id?: string } | undefined, path: string): void => {
    const id = field?.id;
    if (typeof id !== 'string' || id.length === 0) return;
    if (seen.has(id)) {
      issues.push({
        path: `${path}.id`,
        message: `Duplicate field ID "${id}"`,
        severity: 'error',
      });
      return;
    }
    seen.add(id);
  };

  if (Array.isArray(schema.fields)) {
    for (let i = 0; i < schema.fields.length; i++) {
      visitField(schema.fields[i], `fields[${i}]`);
    }
  }

  if (Array.isArray(schema.rows)) {
    for (let i = 0; i < schema.rows.length; i++) {
      const row = schema.rows[i];
      if (row === null || typeof row !== 'object') continue;

      if (isRepeatableRow(row)) {
        const rep = row.repeatable;
        // A repeatable id shares the payload namespace with top-level field ids.
        if (typeof rep?.id === 'string' && rep.id.length > 0) {
          if (seen.has(rep.id)) {
            issues.push({
              path: `rows[${i}].repeatable.id`,
              message: `Duplicate field ID "${rep.id}"`,
              severity: 'error',
            });
          } else {
            seen.add(rep.id);
          }
        }
        continue;
      }

      const fieldRow = row as FormSchemaFieldRow;
      if (!Array.isArray(fieldRow.fields)) continue;
      for (let j = 0; j < fieldRow.fields.length; j++) {
        visitField(fieldRow.fields[j], `rows[${i}].fields[${j}]`);
      }
    }
  }

  if (issues.length === 0) {
    // Not attributable to a specific declaration — surface the builder's own
    // message rather than throwing an empty issue list.
    issues.push({ path: '', message: error.message, severity: 'error' });
  }

  return issues;
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

  // Top-level structure. A non-object root cannot be walked any further: report
  // and stop, rather than throwing a raw TypeError off the first property read.
  if (!validateSchemaEnvelope(schema, 'Form schema', issues)) {
    throw new SchemaValidationError(issues);
  }

  const hasFields = Array.isArray(schema.fields);
  const hasRows = Array.isArray(schema.rows);

  // A PRESENT-but-not-an-array `fields`/`rows` is a defect in its own right. It
  // must be named as one: the Array.isArray checks above read it as absent, so
  // a truthy non-array `rows` alongside a valid `fields` satisfies the one-of
  // guard below and then reaches normalizeToRows, which returns it untouched
  // for a for..of to explode on as a raw TypeError.
  if (schema.fields !== undefined && !hasFields) {
    issues.push({
      path: 'fields',
      message: 'Form schema "fields" must be an array',
      severity: 'error',
    });
  }

  if (schema.rows !== undefined && !hasRows) {
    issues.push({
      path: 'rows',
      message: 'Form schema "rows" must be an array',
      severity: 'error',
    });
  }

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
  if (!validateObjectEntry(row, path, 'Row', issues)) return;

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
    if (!validateObjectEntry(fieldRow, `${repPath}.rows[${i}]`, 'Row', issues)) continue;

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
  if (!validateObjectEntry(field, path, 'Field', issues)) return;

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

  if (field.validation !== undefined) {
    // A non-object `validation` used to fall through `?.rules` as undefined and
    // was SILENTLY DROPPED — an invalid schema compiled with no validation at
    // all. Report the structural mismatch instead.
    if (field.validation === null || typeof field.validation !== 'object') {
      issues.push({
        path: `${path}.validation`,
        message: 'Field "validation" must be an object',
        severity: 'error',
      });
    } else if (field.validation.rules) {
      validateValidationDescriptors(
        field.validation.rules,
        `${path}.validation.rules`,
        registry,
        issues
      );
    }
  }

  if (field.effects !== undefined) {
    // A non-array `effects` used to be walked as if it were one and silently
    // contributed nothing: the declared effects never wired up and NOTHING was
    // reported. A structural mismatch must be an issue.
    if (!Array.isArray(field.effects)) {
      issues.push({
        path: `${path}.effects`,
        message: 'Field "effects" must be an array',
        severity: 'error',
      });
    } else {
      for (let i = 0; i < field.effects.length; i++) {
        validateEffect(field.effects[i], `${path}.effects[${i}]`, registry, issues);
      }
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
      const requiredParams = PARAMETERIZED_BUILTINS.get(type);
      if (requiredParams) {
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
        // Check registry — own-property only: the bindings table is a plain
        // object supplied by the consumer, and `type` is untrusted.
        const factory = getOwn(registry?.validators, type);
        if (factory === undefined) {
          issues.push({
            path: descPath,
            message: `Unknown validator type "${type}". Not a built-in and not found in registry.`,
            severity: 'error',
          });
        } else if (typeof factory !== 'function') {
          // Present but not callable: resolveValidationDescriptor invokes it as
          // a factory, so a mere existence check lets it escape as a raw
          // TypeError. Mirrors the effect-handler check in validateEffect.
          issues.push({
            path: descPath,
            message: `Validator "${type}" in bindings is not a function`,
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
  if (!validateObjectEntry(effect, path, 'Effect', issues)) return;

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
  } else {
    // Own-property only: the bindings table is a plain object supplied by the
    // consumer, and `handler` is untrusted — a `toString` handler must read as
    // absent, not resolve to Object.prototype.toString and compile a no-op.
    const bound = getOwn(registry?.effects, effect.handler);
    if (bound === undefined) {
      issues.push({
        path: `${path}.handler`,
        message: `Effect handler "${effect.handler}" not found in registry`,
        severity: 'error',
      });
    } else if (typeof bound !== 'function') {
      // A binding that EXISTS but is not callable is a schema/bindings mismatch:
      // report it here rather than deferring to a raw TypeError at effect time.
      issues.push({
        path: `${path}.handler`,
        message: `Effect handler "${effect.handler}" in bindings is not a function`,
        severity: 'error',
      });
    }
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
 * The deepest composite `conditions` nesting a serialized condition tree may
 * carry. The tree comes from untrusted (model-authored or corrupted) JSON, and
 * this walker recurses per level; without a bound a pathologically deep tree
 * throws a raw `RangeError` off the stack, escaping the SchemaValidationError
 * contract and crashing the ShowForm/ShowFlow render. Mirrors the agent
 * renderer's own `MAX_NODE_DEPTH`; real and/or trees are a handful deep.
 */
const MAX_CONDITION_DEPTH = 64;

/**
 * Recursively validates a serialized condition tree.
 *
 * The single walker for every `ConditionConfig` in a schema — field-level
 * (forms) and step-level (workflow) alike — so both surfaces enforce the same
 * rules: operator whitelist, leaf `field`, and the `matches`-string
 * serialization constraint.
 *
 * `depth` is internal — the recursion threads it to enforce `MAX_CONDITION_DEPTH`.
 * The optional default keeps the public 3-arg call signature intact.
 */
export function validateConditionConfig(
  condition: ConditionConfig,
  path: string,
  issues: SchemaIssue[],
  depth = 0
): void {
  // Untrusted input recurses here per composite level: stop before the stack
  // does, reporting it as a normal schema error rather than a raw RangeError.
  if (depth >= MAX_CONDITION_DEPTH) {
    issues.push({
      path,
      message: `Condition tree is too deeply nested (maximum depth is ${MAX_CONDITION_DEPTH})`,
      severity: 'error',
    });
    return;
  }

  // Guard every node, not just the root: the recursion walks untrusted children,
  // so a null child in a composite tree must be reported here rather than
  // escaping as a raw TypeError off the first property read below.
  if (!validateObjectEntry(condition, path, 'Condition', issues)) return;

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

  // Checked at EVERY node, before the composite early-return: `logicalOperator`
  // is the composite node's operator, and the leaf-only whitelist below never
  // sees it.
  if (
    condition.logicalOperator !== undefined &&
    !VALID_LOGICAL_OPERATORS.has(condition.logicalOperator)
  ) {
    issues.push({
      path: `${path}.logicalOperator`,
      message: `Invalid condition logicalOperator "${condition.logicalOperator}"`,
      severity: 'error',
    });
  }

  // Composite condition (has sub-conditions)
  if (condition.conditions && condition.conditions.length > 0) {
    for (let i = 0; i < condition.conditions.length; i++) {
      validateConditionConfig(
        condition.conditions[i],
        `${path}.conditions[${i}]`,
        issues,
        depth + 1
      );
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
// LENIENT SUBSET (streaming)
// =================================================================

/** True for a plain (non-array) object — the only shape schema blocks accept. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Runs the SHARED per-field validator over a candidate declaration and answers
 * whether any error-severity issue was reported. This is the single rule set
 * both modes use: strict collects the issues and raises, lenient asks this and
 * skips or strips — never a second opinion on what a valid field is.
 */
function hasFieldErrors<C extends Record<string, any>>(
  field: {
    id?: string;
    type?: string;
    validation?: FieldSchemaValidation;
    effects?: FieldSchemaEffect[];
    conditions?: ConditionalBehavior;
  },
  config: RilayInstance<C>,
  registry: Bindings | undefined
): boolean {
  const issues: SchemaIssue[] = [];
  validateField(field, 'field', config, registry, issues);
  return issues.some((issue) => issue.severity === 'error');
}

/**
 * The lenient verdict for ONE field declaration: the field to compile, or
 * `null` to skip it this render.
 *
 * The CORE definition (id, type, props) gates mounting: while any of it is
 * incomplete or invalid the field is skipped — the next chunk may complete it.
 * Once the core is complete the field MOUNTS, and an invalid or half-arrived
 * `validation` / `effects` / `conditions` block is STRIPPED instead of failing
 * the field: dropping an already-mounted field would shrink the form's shape,
 * read as a form swap downstream, and reset what the user already typed — the
 * exact bug class progressive mounting exists to prevent.
 */
function lenientField<C extends Record<string, any>>(
  entry: unknown,
  config: RilayInstance<C>,
  registry: Bindings | undefined,
  checkProps: boolean
): FormSchemaField | null {
  if (!isPlainRecord(entry)) return null;
  const candidate = entry as Partial<FormSchemaField>;

  const { id, type } = candidate;
  if (typeof id !== 'string' || typeof type !== 'string') return null;
  if (hasFieldErrors({ id, type }, config, registry)) return null;
  if (candidate.props !== undefined && !isPlainRecord(candidate.props)) return null;
  if (checkProps && !config.validateProps(type, candidate.props ?? {}).success) return null;

  const kept: {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    default?: unknown;
    validation?: FieldSchemaValidation;
    conditions?: ConditionalBehavior;
    effects?: FieldSchemaEffect[];
  } = { id, type };

  if (candidate.props !== undefined) kept.props = candidate.props;
  if (candidate.default !== undefined) kept.default = candidate.default;
  if (
    candidate.validation !== undefined &&
    !hasFieldErrors({ id, type, validation: candidate.validation }, config, registry)
  ) {
    kept.validation = candidate.validation;
  }
  if (
    candidate.effects !== undefined &&
    !hasFieldErrors({ id, type, effects: candidate.effects }, config, registry)
  ) {
    kept.effects = candidate.effects;
  }
  if (
    candidate.conditions !== undefined &&
    isPlainRecord(candidate.conditions) &&
    !hasFieldErrors({ id, type, conditions: candidate.conditions }, config, registry)
  ) {
    kept.conditions = candidate.conditions;
  }

  return kept;
}

/**
 * The lenient verdict for one repeatable row: the row to compile, or `null` to
 * skip it this render.
 *
 * Template fields are filtered with the SAME per-field rule as top-level fields
 * (an incomplete template field is skipped, not fatal), and the survivors are
 * gated by the shared `validateRepeatable` — min/max sanity and the rest —
 * before the row is admitted. A repeatable with no complete template field yet
 * is skipped whole: it has nothing to mount.
 *
 * The id-namespace bookkeeping mirrors the builder's `validate()` rules, which
 * lenient must satisfy UP FRONT because the builder raises and lenient never
 * does: template ids are unique within their repeatable, may not shadow a
 * top-level id — except the template may reuse its OWN repeatable's id — and
 * bracketed ids are rejected (`addRepeatable` throws on them at call time).
 */
function lenientRepeatable<C extends Record<string, any>>(
  row: Record<string, unknown>,
  config: RilayInstance<C>,
  registry: Bindings | undefined,
  checkProps: boolean,
  seenTopLevel: Set<string>,
  seenTemplates: Set<string>
): FormSchemaRepeatableRow | null {
  const rep = row.repeatable;
  if (!isPlainRecord(rep)) return null;
  const candidate = rep as Partial<FormSchemaRepeatable>;

  const id = candidate.id;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (id.includes('[') || id.includes(']')) return null;
  if (seenTopLevel.has(id)) return null;

  const templateIds = new Set<string>();
  const templateRows: FormSchemaFieldRow[] = [];
  if (Array.isArray(candidate.rows)) {
    for (const rowEntry of candidate.rows) {
      if (!isPlainRecord(rowEntry)) continue;
      const rawFields = rowEntry.fields;
      if (!Array.isArray(rawFields)) continue;
      const fields: FormSchemaField[] = [];
      for (const entry of rawFields) {
        const field = lenientField(entry, config, registry, checkProps);
        if (!field) continue;
        if (templateIds.has(field.id)) continue;
        if (seenTopLevel.has(field.id) && field.id !== id) continue;
        templateIds.add(field.id);
        fields.push(field);
      }
      if (fields.length > 0) templateRows.push({ kind: 'fields', fields });
    }
  }
  if (templateRows.length === 0) return null;

  const filtered: {
    id: string;
    rows: FormSchemaFieldRow[];
    min?: number;
    max?: number;
    defaultValue?: Record<string, unknown>;
    validation?: FieldSchemaValidation;
  } = { id, rows: templateRows };

  if (typeof candidate.min === 'number') filtered.min = candidate.min;
  if (typeof candidate.max === 'number') filtered.max = candidate.max;
  if (isPlainRecord(candidate.defaultValue)) filtered.defaultValue = candidate.defaultValue;

  const validation = candidate.validation;
  if (isPlainRecord(validation)) {
    const rules = (validation as FieldSchemaValidation).rules;
    const issues: SchemaIssue[] = [];
    if (rules !== undefined) validateValidationDescriptors(rules, 'rules', registry, issues);
    if (!issues.some((issue) => issue.severity === 'error')) {
      filtered.validation = validation as FieldSchemaValidation;
    }
  }

  const gate: FormSchemaRepeatableRow = { kind: 'repeatable', repeatable: filtered };
  const issues: SchemaIssue[] = [];
  validateRepeatable(gate, 'row', config, registry, issues);
  if (issues.some((issue) => issue.severity === 'error')) return null;

  seenTopLevel.add(id);
  for (const templateId of templateIds) seenTemplates.add(templateId);
  return gate;
}

/**
 * Reduces a PARTIAL schema — mid-stream, deep-partial, possibly not even an
 * object yet — to the subset the strict pipeline can compile without raising.
 *
 * Every judgement is delegated to the shared validators (`validateField`,
 * `validateRepeatable`, `validateValidationDescriptors`); this walker only
 * decides what to do with a verdict: skip an incomplete field, strip a
 * half-arrived block, drop a duplicate. Structure-level tolerances that strict
 * mode reports as errors are resolved here instead: a missing or empty `fields`
 * compiles to an empty form, a schema carrying both `fields` and `rows` keeps
 * `fields`, a missing `id` is left for the builder to auto-generate, an invalid
 * `version` is dropped.
 *
 * Duplicate ids are resolved FIRST-WINS: the builder raises on them, lenient
 * never does, and the first complete declaration is the one already mounted.
 */
function toCompilableSubset<C extends Record<string, any>>(
  schema: FormSchema,
  config: RilayInstance<C>,
  registry: Bindings | undefined,
  checkProps: boolean
): FormSchema {
  const root: Record<string, unknown> = isPlainRecord(schema) ? schema : {};

  const subset: {
    id?: string;
    version?: 1;
    defaultValues?: Record<string, unknown>;
    fields?: FormSchemaField[];
    rows?: FormSchemaRow[];
    validation?: FormSchemaValidationConfig;
    submitOptions?: SubmitOptions;
  } = {};

  if (typeof root.id === 'string' && root.id.length > 0) subset.id = root.id;
  if (root.version === 1) subset.version = 1;
  if (isPlainRecord(root.defaultValues)) subset.defaultValues = root.defaultValues;
  if (isPlainRecord(root.submitOptions)) subset.submitOptions = root.submitOptions as SubmitOptions;

  if (isPlainRecord(root.validation)) {
    const validation = root.validation as FormSchemaValidationConfig;
    const issues: SchemaIssue[] = [];
    if (validation.rules !== undefined) {
      validateValidationDescriptors(validation.rules, 'validation.rules', registry, issues);
    }
    if (!issues.some((issue) => issue.severity === 'error')) subset.validation = validation;
  }

  // One namespace for top-level field ids and repeatable ids; template ids may
  // not shadow it (see lenientRepeatable).
  const seenTopLevel = new Set<string>();
  const seenTemplates = new Set<string>();

  const keepField = (entry: unknown): FormSchemaField | null => {
    const field = lenientField(entry, config, registry, checkProps);
    if (!field || seenTopLevel.has(field.id) || seenTemplates.has(field.id)) return null;
    seenTopLevel.add(field.id);
    return field;
  };

  if (Array.isArray(root.fields)) {
    subset.fields = root.fields
      .map(keepField)
      .filter((field): field is FormSchemaField => field !== null);
  } else if (Array.isArray(root.rows)) {
    const rows: FormSchemaRow[] = [];
    for (const entry of root.rows) {
      if (!isPlainRecord(entry)) continue;
      if (entry.kind === 'repeatable') {
        const repeatable = lenientRepeatable(
          entry,
          config,
          registry,
          checkProps,
          seenTopLevel,
          seenTemplates
        );
        if (repeatable) rows.push(repeatable);
        continue;
      }
      if (!Array.isArray(entry.fields)) continue;
      const fields = entry.fields
        .map(keepField)
        .filter((field): field is FormSchemaField => field !== null);
      if (fields.length === 0) continue;
      rows.push({
        kind: 'fields',
        fields,
        ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
        ...(typeof entry.maxColumns === 'number' ? { maxColumns: entry.maxColumns } : {}),
      });
    }
    subset.rows = rows;
  }

  // The builder auto-generates a missing id; this is the same honest boundary
  // cast the untrusted-JSON caller performs to enter compileForm at all.
  return subset as FormSchema;
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
 * Checks every field's `props` against its component's `propsSchema`.
 *
 * Accumulates across all fields so an agent gets the complete correction list in
 * one pass instead of one violation per round-trip.
 *
 * VALIDATION ONLY — a passing schema's output value is discarded and the field
 * is built from the author's own props. A propsSchema may transform, and those
 * transforms do NOT apply; that is the deliberate trade. The alternative was
 * tried and reverted: `z.object()` strips undeclared keys silently and without
 * an issue, so feeding the coerced value back deleted author-written props with
 * no diagnostic at all.
 *
 * @throws SchemaValidationError if any field's props violate its propsSchema
 * @throws ConfigurationError if a component's propsSchema validates asynchronously
 *   — a catalog defect, not a schema defect, so it is never collected as an issue
 */
export function validateFieldProps<C>(schema: FormSchema, config: RilayInstance<C>): void {
  const issues: SchemaIssue[] = [];

  for (const { field, path } of collectFieldsWithPaths(schema)) {
    // Unknown component types are already reported by validateSchema (see
    // validateField, same hasComponent check) — don't duplicate the issue.
    if (!config.hasComponent(field.type)) continue;

    const result = config.validateProps(field.type, field.props ?? {});
    // Validation only: `result.value` is deliberately dropped. A propsSchema may
    // transform, but a `z.object()` — the shape ril's own example documents —
    // also STRIPS every key it does not declare, and reports no issue while
    // doing it. Feeding its output back therefore deleted author-written props
    // with no diagnostic. An unapplied transform is recoverable in the component
    // or in `defaultProps`; silently vanished props are not.
    if (result.success) continue;

    for (const issue of result.issues) {
      // The issue's own path locates the offending prop WITHIN the props object
      // (zod reports e.g. `['label']`). Append it so the schema path names the
      // exact key to fix rather than just the field that owns it. expectedKeys
      // rides along so a producer can see what the component actually accepts.
      issues.push({
        path: `${path}.props${propIssuePathSuffix(issue.path)}`,
        message: issue.message,
        severity: 'error',
        ...(result.expectedKeys ? { expectedKeys: result.expectedKeys } : {}),
      });
    }
  }

  if (issues.length > 0) {
    throw new SchemaValidationError(issues);
  }
}

/**
 * The `path` of a props-validation issue, as reported by a component's
 * propsSchema. Derived from core's own result type rather than importing the
 * Standard Schema spec package directly — `@rilaykit/core` owns that dependency
 * and re-exports the shape, so forms stays free of it.
 */
type PropIssuePath = NonNullable<
  Extract<PropsValidationResult, { success: false }>['issues'][number]['path']
>;

/**
 * Renders a Standard Schema issue path as a JSON-path suffix.
 *
 * Segments may be plain keys or `{ key }` wrappers, and numeric keys index an
 * array. An issue with no path targets the props object as a whole, which
 * renders as an empty suffix.
 */
function propIssuePathSuffix(path: PropIssuePath | undefined): string {
  if (!path || path.length === 0) return '';

  let suffix = '';
  for (const segment of path) {
    const key = typeof segment === 'object' && segment !== null ? segment.key : segment;
    suffix += typeof key === 'number' ? `[${key}]` : `.${String(key)}`;
  }
  return suffix;
}

/**
 * Collects every field of a schema together with the JSON path of its
 * declaration, mirroring validateSchema's traversal so prop issues and
 * structural issues address the same element the same way.
 *
 * Repeatable templates are included: their props are as compilable — and as
 * wrong-able — as any other field's.
 */
function collectFieldsWithPaths(schema: FormSchema): { field: FormSchemaField; path: string }[] {
  const collected: { field: FormSchemaField; path: string }[] = [];

  if (Array.isArray(schema.fields)) {
    for (let i = 0; i < schema.fields.length; i++) {
      collected.push({ field: schema.fields[i], path: `fields[${i}]` });
    }
    return collected;
  }

  if (!Array.isArray(schema.rows)) return collected;

  for (let i = 0; i < schema.rows.length; i++) {
    const row = schema.rows[i];

    if (isRepeatableRow(row)) {
      const repRows = row.repeatable.rows;
      for (let k = 0; k < repRows.length; k++) {
        const fields = repRows[k].fields;
        for (let j = 0; j < fields.length; j++) {
          collected.push({
            field: fields[j],
            path: `rows[${i}].repeatable.rows[${k}].fields[${j}]`,
          });
        }
      }
      continue;
    }

    const fields = row.fields;
    for (let j = 0; j < fields.length; j++) {
      collected.push({ field: fields[j], path: `rows[${i}].fields[${j}]` });
    }
  }

  return collected;
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
 *
 * ALWAYS returns a fresh object when it returns one. Handing back the input
 * schema's own `defaultValues` would make every compile of that schema share one
 * mutable object: mutating one compile's defaults would corrupt the others and
 * the caller's parsed JSON alike.
 */
function mergeDefaultValues(
  schema: FormSchema,
  rows: FormSchemaRow[]
): Record<string, unknown> | undefined {
  // A Map accumulator, not a plain object: `field.id` is untrusted, and
  // `inlineDefaults['__proto__'] = x` on a plain object reassigns the prototype
  // instead of recording a key — silently dropping that field's default.
  // `Object.fromEntries` then defines every key as an own data property.
  const inlineDefaults = new Map<string, unknown>();
  for (const field of collectTopLevelFields(rows)) {
    if (field.default !== undefined) {
      inlineDefaults.set(field.id, field.default);
    }
  }

  // Deep-clone, not spread: a shallow copy detaches only the TOP level, leaving
  // every nested object and array shared between two compiles of the same schema
  // AND with the caller's own parsed JSON — mutating one compile's nested
  // default corrupts the others and the input. clonePlainData is cycle-safe and
  // passes functions and Standard Schema objects through by identity.
  //
  // `defaultValues` is untrusted (model-authored, or a corrupted persisted
  // value): a pathologically deep payload makes clonePlainData throw a bounded
  // MaxDepthExceededError. Convert it here so compileForm keeps its contract of
  // only ever throwing SchemaValidationError — never a raw stack overflow.
  try {
    if (inlineDefaults.size === 0) {
      return schema.defaultValues === undefined ? undefined : clonePlainData(schema.defaultValues);
    }

    return clonePlainData({
      ...Object.fromEntries(inlineDefaults),
      ...(schema.defaultValues ?? {}),
    });
  } catch (error) {
    if (error instanceof MaxDepthExceededError) {
      throw new SchemaValidationError([
        { path: 'defaultValues', message: error.message, severity: 'error' },
      ]);
    }
    throw error;
  }
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
      props: field.props as Record<string, unknown>,
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
  const schemas = descriptors.map((descriptor) =>
    resolveValidationDescriptor(descriptor, registry)
  );
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
    ...(validation.mode === undefined ? {} : { mode: validation.mode }),
    ...(validation.reValidateMode === undefined
      ? {}
      : { reValidateMode: validation.reValidateMode }),
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

  // Registry lookup — own-property only (see validateValidationDescriptors).
  const factory = getOwn(registry?.validators, type);
  if (typeof factory === 'function') {
    return factory(params, message);
  }

  // Present but not callable. compileForm rejects this earlier with a
  // SchemaValidationError issue; this is the direct-call path, and it must name
  // the offending binding rather than let `factory(...)` raise a raw TypeError.
  if (factory !== undefined) {
    throw new InvalidSchemaError(`Validator "${type}" in bindings is not a function`, { type });
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
    // Own-property only (see validateEffect) — this is the last line of defence
    // for callers that reach the resolver without the structural pass.
    const registryHandler = getOwn(registry?.effects, effect.handler);
    if (typeof registryHandler !== 'function') {
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
