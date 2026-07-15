import type {
  ConditionalBehavior,
  FieldEffectContext,
  FieldValidationConfig,
  FormConfiguration,
  FormValidationConfig,
  StandardSchema,
  SubmitOptions,
} from '@rilaykit/core';

// =================================================================
// SCHEMA TYPES — JSON-serializable form definitions
// =================================================================

/**
 * JSON schema that backends send to describe a form.
 * Fully JSON-serializable — no functions, no class instances.
 *
 * Supports two layout formats:
 * - `fields` (flat): each field gets its own row — simple and covers most cases
 * - `rows` (advanced): explicit row layout with multi-field rows and repeatables
 *
 * Must have exactly one of `fields` or `rows`.
 */
export interface FormSchema {
  /** Schema version for future compatibility (defaults to 1) */
  readonly version?: 1;
  /** Unique form identifier */
  readonly id: string;
  /** Initial field values for pre-filling the form */
  readonly defaultValues?: Record<string, unknown>;
  /** Flat field list — each field on its own row (simple format) */
  readonly fields?: FormSchemaField[];
  /** Explicit row layout with multi-field rows and repeatables (advanced format) */
  readonly rows?: FormSchemaRow[];
  /** Form-level validation descriptors */
  readonly validation?: FormSchemaValidationConfig;
  /** Default submit options */
  readonly submitOptions?: SubmitOptions;
}

// =================================================================
// ROW TYPES
// =================================================================

export type FormSchemaRow = FormSchemaFieldRow | FormSchemaRepeatableRow;

export interface FormSchemaFieldRow {
  /** Discriminant — defaults to 'fields' if absent */
  readonly kind?: 'fields';
  /** Row ID (auto-generated if omitted) */
  readonly id?: string;
  /** Fields in this row (at least one) */
  readonly fields: FormSchemaField[];
  /** Maximum columns for this row */
  readonly maxColumns?: number;
}

export interface FormSchemaRepeatableRow {
  readonly kind: 'repeatable';
  /** Row ID (auto-generated if omitted) */
  readonly id?: string;
  readonly repeatable: FormSchemaRepeatable;
}

// =================================================================
// FIELD TYPES
// =================================================================

export interface FormSchemaField {
  /** Unique field identifier (required — backend must know IDs) */
  readonly id: string;
  /** Component type — must match a registered component in ril config */
  readonly type: string;
  /** Component props (JSON-serializable) */
  readonly props?: Record<string, unknown>;
  /**
   * Initial value for this field, declared inline (streaming-friendly: a field
   * carries its own default, so a schema can be consumed field-by-field without
   * waiting for a trailing `defaultValues` block).
   *
   * Merged into the compiled `defaultValues`. The schema-level
   * `FormSchema.defaultValues[id]` is the explicit override and WINS when both
   * are present. Ignored for fields inside a repeatable template — those use
   * `FormSchemaRepeatable.defaultValue`.
   */
  readonly default?: unknown;
  /** Validation descriptors */
  readonly validation?: FieldSchemaValidation;
  /** Conditions — pass-through (already JSON-serializable ConditionConfig) */
  readonly conditions?: ConditionalBehavior;
  /** Effect descriptors — references to registered effect handlers */
  readonly effects?: FieldSchemaEffect[];
}

// =================================================================
// REPEATABLE TYPES
// =================================================================

export interface FormSchemaRepeatable {
  /** Unique repeatable group identifier */
  readonly id: string;
  /** Template rows for each repeatable item */
  readonly rows: FormSchemaFieldRow[];
  /** Minimum number of items */
  readonly min?: number;
  /** Maximum number of items */
  readonly max?: number;
  /** Default values for new items */
  readonly defaultValue?: Record<string, unknown>;
  /** Group-level validation */
  readonly validation?: FieldSchemaValidation;
}

// =================================================================
// VALIDATION DESCRIPTORS
// =================================================================

export interface FieldSchemaValidation {
  /** One or more validation descriptors */
  readonly rules?: ValidationDescriptor | ValidationDescriptor[];
  readonly validateOnChange?: boolean;
  readonly validateOnBlur?: boolean;
  readonly debounceMs?: number;
}

/**
 * A validation descriptor — string shortcut or parameterized object.
 *
 * String shortcuts: "required", "email", "url", "number"
 * Object descriptors: { type: "minLength", params: { min: 3 }, message?: "..." }
 */
export type ValidationDescriptor = ValidationShortcut | ValidationDescriptorObject;

/** Zero-parameter built-in validator shortcuts */
export type ValidationShortcut = 'required' | 'email' | 'url' | 'number';

export interface ValidationDescriptorObject {
  /** Built-in validator name or registry key */
  readonly type: string;
  /** Custom error message */
  readonly message?: string;
  /** Validator-specific parameters */
  readonly params?: Record<string, unknown>;
}

/**
 * Form-level validation descriptors.
 * Note: string shortcuts (required, email, etc.) are meaningless at form level
 * since they validate individual values. Use registry validators for cross-field logic.
 */
export interface FormSchemaValidationConfig {
  readonly rules?: ValidationDescriptor | ValidationDescriptor[];
  readonly validateOnSubmit?: boolean;
  readonly validateOnStepChange?: boolean;
}

// =================================================================
// EFFECT DESCRIPTORS
// =================================================================

export interface FieldSchemaEffect {
  readonly trigger: 'change';
  /** Field ID to watch for changes */
  readonly watch: string;
  /** Registry key for the handler function */
  readonly handler: string;
  /** Parameters passed to the handler (enables handler reuse) */
  readonly params?: Record<string, unknown>;
}

// =================================================================
// BINDINGS — resolves non-serializable logic
// =================================================================

/**
 * Consumer-supplied resolution for non-serializable schema references
 * (custom validators, effect handlers).
 * Provided by the consumer alongside the ril config.
 */
export interface Bindings {
  /** Custom validators indexed by key */
  readonly validators?: Record<string, CustomValidatorFactory>;
  /** Effect handlers indexed by key */
  readonly effects?: Record<string, SchemaEffectHandler>;
}

/** @deprecated Renamed to `Bindings`. */
export type SchemaRegistry = Bindings;

/** Options accepted by `compileForm`. */
export interface CompileFormOptions {
  /** Resolution for the schema's validator/effect string references. */
  readonly bindings?: Bindings;
  /**
   * When true, each field's `props` are checked against its component's
   * `propsSchema` and every violation is reported as a `SchemaValidationError`
   * issue pathed to the offending PROP within the field's declaration
   * (`fields[0].props.label`, `rows[1].fields[0].props.options[2]`), so the
   * message names the exact key to fix. Fields whose component declares no
   * `propsSchema` are skipped.
   *
   * Checks only — the compiled field keeps the props as authored. A passing
   * `propsSchema`'s output is discarded, so its transforms and defaults do NOT
   * apply (see `validateFieldProps` in compile-form.ts for why).
   *
   * Off by default — prop validation is the opt-in self-correction hook for
   * agent-authored schemas, not a cost paid by hand-written ones.
   */
  readonly validateProps?: boolean;
}

/**
 * Factory that creates a StandardSchema validator from descriptor params.
 * Allows parameterized custom validators.
 */
export type CustomValidatorFactory = (
  params?: Record<string, unknown>,
  message?: string
) => StandardSchema;

/**
 * Effect handler with optional params (3rd argument).
 * The compileForm resolver curries params into a standard FieldEffectHandler.
 */
export type SchemaEffectHandler = (
  newValue: unknown,
  context: FieldEffectContext,
  params?: Record<string, unknown>
) => void | Promise<void>;

// =================================================================
// RESULT TYPE
// =================================================================

/**
 * Result of compileForm() — separates formConfig from defaultValues
 * because FormConfiguration does not have a defaultValues field.
 * defaultValues is a separate prop on FormProvider / Form.
 */
export interface FormSchemaResult<C extends Record<string, any>> {
  readonly formConfig: FormConfiguration<C>;
  readonly defaultValues?: Record<string, unknown>;
}

// =================================================================
// ERROR TYPES
// =================================================================

export interface SchemaIssue {
  /** JSON path to the invalid element (e.g. "rows[0].fields[1].validation") */
  readonly path: string;
  /** Human-readable error message */
  readonly message: string;
  /** Error severity */
  readonly severity: 'error' | 'warning';
  /**
   * Every key the target accepts, when the target has a declared shape.
   *
   * Populated for `validateProps` issues from the component's `propsSchema`, so
   * a self-correcting producer can see the accepted prop names alongside the
   * one it got wrong (spec §7). Optional and purely additive: issues from paths
   * with no declared shape omit it, and existing consumers are unaffected.
   */
  readonly expectedKeys?: readonly string[];
}

/**
 * Thrown when a form schema has structural errors.
 * Contains a detailed list of issues with JSON paths.
 */
export class SchemaValidationError extends Error {
  readonly code = 'SCHEMA_VALIDATION_ERROR' as const;
  readonly issues: SchemaIssue[];

  constructor(issues: SchemaIssue[]) {
    const errors = issues.filter((i) => i.severity === 'error');
    const summary = errors.map((i) => `[${i.path}] ${i.message}`).join('; ');
    super(`Invalid form schema: ${summary}`);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}
