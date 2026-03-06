import {
  type ConditionConfig,
  type ConditionalBehavior,
  type FieldEffect,
  type FieldValidationConfig,
  type FormValidationConfig,
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
  type ril,
  url as urlValidator,
} from '@rilaykit/core';
import type { FieldConfig } from '../builders/form';
import { form } from '../builders/form';
import type {
  FieldSchemaEffect,
  FieldSchemaValidation,
  FormSchema,
  FormSchemaFieldRow,
  FormSchemaRepeatableRow,
  FormSchemaResult,
  FormSchemaRow,
  FormSchemaValidationConfig,
  SchemaIssue,
  SchemaRegistry,
  ValidationDescriptor,
  ValidationDescriptorObject,
} from './types';
import { SchemaValidationError } from './types';

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
 * Converts a JSON schema into a fully functional FormConfiguration.
 *
 * Uses the existing form builder internally — zero logic duplication.
 * Resolves validation descriptors and effect references via the optional registry.
 *
 * @param schema - The JSON form schema (from backend or local JSON)
 * @param config - The ril instance containing registered components
 * @param registry - Optional registry for custom validators and effects
 * @returns A FormSchemaResult with formConfig and optional defaultValues
 * @throws SchemaValidationError if the schema is invalid
 *
 * @example
 * ```typescript
 * const { formConfig, defaultValues } = fromSchema(schema, rilConfig, registry);
 * <Form formConfig={formConfig} defaultValues={defaultValues} onSubmit={handleSubmit} />
 * ```
 */
export function fromSchema<C extends Record<string, any>>(
  schema: FormSchema,
  config: ril<C>,
  registry?: SchemaRegistry
): FormSchemaResult<C> {
  // 1. Validate schema structure
  validateSchema(schema, config, registry);

  // 2. Normalize: flat fields → rows
  const rows = normalizeToRows(schema);

  // 3. Build via form builder
  const builder = form.create(config, schema.id);

  for (const row of rows) {
    if (isRepeatableRow(row)) {
      const rep = row.repeatable;
      builder.addRepeatable(rep.id, (r) => {
        for (const fieldRow of rep.rows) {
          const resolved = resolveFields(fieldRow.fields, registry);
          r.add(...(resolved as FieldConfig<C, string & keyof C>[]));
        }
        if (rep.min !== undefined) r.min(rep.min);
        if (rep.max !== undefined) r.max(rep.max);
        if (rep.defaultValue) r.defaultValue(rep.defaultValue);
        if (rep.validation) r.validation(resolveFieldValidation(rep.validation, registry));
        return r;
      });
    } else {
      const fieldRow = row as FormSchemaFieldRow;
      const resolved = resolveFields(fieldRow.fields, registry);
      builder.add(...(resolved as FieldConfig<C, string & keyof C>[]));
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

  // 5. Return separated result
  return {
    formConfig,
    defaultValues: schema.defaultValues,
  };
}

/**
 * Type guard — checks if a value conforms to the FormSchema structure.
 */
export function isFormSchema(value: unknown): value is FormSchema {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return false;
  const hasFields = Array.isArray(obj.fields);
  const hasRows = Array.isArray(obj.rows);
  if (!hasFields && !hasRows) return false;
  if (hasFields && hasRows) return false;
  if (obj.version !== undefined && obj.version !== 1) return false;
  return true;
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
  config: ril<C>,
  registry?: SchemaRegistry
): void {
  const issues: SchemaIssue[] = [];

  // Top-level structure
  if (!schema.id || typeof schema.id !== 'string') {
    issues.push({
      path: 'id',
      message: 'Form schema must have a non-empty "id"',
      severity: 'error',
    });
  }

  if (schema.version !== undefined && schema.version !== 1) {
    issues.push({
      path: 'version',
      message: `Unsupported schema version "${schema.version}". Only version 1 is supported.`,
      severity: 'error',
    });
  }

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
  config: ril<C>,
  registry: SchemaRegistry | undefined,
  issues: SchemaIssue[]
): void {
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
  config: ril<C>,
  registry: SchemaRegistry | undefined,
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
  config: ril<C>,
  registry: SchemaRegistry | undefined,
  issues: SchemaIssue[]
): void {
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
  registry: SchemaRegistry | undefined,
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
  registry: SchemaRegistry | undefined,
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

function validateConditionConfig(
  condition: ConditionConfig,
  path: string,
  issues: SchemaIssue[]
): void {
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
 * Converts schema fields to FieldConfig objects.
 * Resolves validation descriptors and effect references.
 */
function resolveFields(
  fields: {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    validation?: FieldSchemaValidation;
    conditions?: ConditionalBehavior;
    effects?: FieldSchemaEffect[];
  }[],
  registry?: SchemaRegistry
): FieldConfig<Record<string, any>, string>[] {
  return fields.map((field) => {
    const resolved: FieldConfig<Record<string, any>, string> = {
      id: field.id,
      type: field.type,
      props: field.props as Record<string, any>,
    };

    if (field.validation) {
      (resolved as any).validation = resolveFieldValidation(field.validation, registry);
    }

    if (field.conditions) {
      (resolved as any).conditions = field.conditions;
    }

    if (field.effects && field.effects.length > 0) {
      (resolved as any).effects = resolveEffects(field.effects, registry);
    }

    return resolved;
  });
}

/**
 * Resolves field-level validation descriptors into a FieldValidationConfig.
 */
export function resolveFieldValidation(
  validation: FieldSchemaValidation,
  registry?: SchemaRegistry
): FieldValidationConfig {
  const config: FieldValidationConfig = {
    validateOnChange: validation.validateOnChange,
    validateOnBlur: validation.validateOnBlur,
    debounceMs: validation.debounceMs,
  };

  if (validation.rules) {
    const descriptors = Array.isArray(validation.rules) ? validation.rules : [validation.rules];
    const schemas = descriptors.map((d) => resolveValidationDescriptor(d, registry));

    (config as any).validate = schemas.length === 1 ? schemas[0] : schemas;
  }

  return config;
}

/**
 * Resolves form-level validation descriptors into a FormValidationConfig.
 */
function resolveFormValidation(
  validation: FormSchemaValidationConfig,
  registry?: SchemaRegistry
): FormValidationConfig {
  const config: FormValidationConfig = {
    validateOnSubmit: validation.validateOnSubmit,
    validateOnStepChange: validation.validateOnStepChange,
  };

  if (validation.rules) {
    const descriptors = Array.isArray(validation.rules) ? validation.rules : [validation.rules];
    const schemas = descriptors.map((d) => resolveValidationDescriptor(d, registry));

    (config as any).validate = schemas.length === 1 ? schemas[0] : schemas;
  }

  return config;
}

/**
 * Resolves a single validation descriptor into a StandardSchema.
 */
export function resolveValidationDescriptor(
  descriptor: ValidationDescriptor,
  registry?: SchemaRegistry
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

  throw new Error(`Unknown validator type: "${type}"`);
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
      throw new Error(`Unknown built-in validator: "${type}"`);
  }
}

/**
 * Resolves effect descriptors into FieldEffect objects.
 * Curries params into the handler signature.
 */
function resolveEffects(effects: FieldSchemaEffect[], registry?: SchemaRegistry): FieldEffect[] {
  return effects.map((effect) => {
    const registryHandler = registry?.effects?.[effect.handler];
    if (!registryHandler) {
      throw new Error(`Effect handler "${effect.handler}" not found in registry`);
    }

    // Curry params into a standard FieldEffectHandler (2 args)
    const params = effect.params;
    return onChange(effect.watch, (newValue, context) =>
      registryHandler(newValue, context, params)
    );
  });
}
