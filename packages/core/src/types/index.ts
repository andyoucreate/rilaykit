import type { StandardSchemaV1 } from '@standard-schema/spec';
import type React from 'react';
import type { ConditionConfig } from '../conditions';
import type { RilayInstance } from '../config/ril';

// =================================================================
// 1. CORE
// =================================================================

export interface RilayLicenseConfig {
  readonly licenseKey?: string;
  readonly environment?: 'development' | 'production';
  readonly allowTrial?: boolean;
}

// =================================================================
// 2. VALIDATION SYSTEM
// =================================================================

// 2.1. Core Validation Types
export interface FieldError {
  readonly message: string;
  readonly code?: string;
  readonly path?: string;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: FieldError[];
  readonly value?: any;
}

export interface ValidationContext {
  readonly fieldId?: string;
  readonly formId?: string;
  readonly stepId?: string;
  readonly workflowId?: string;
  readonly allFormData?: Record<string, any>;
  readonly stepData?: Record<string, any>;
  readonly workflowData?: Record<string, any>;
}

// 2.2. Legacy Validator Function Types (kept for internal use only)
/** @internal - Use Standard Schema instead */
export type FieldValidator<T = any> = (
  value: T,
  context: ValidationContext
) => ValidationResult | Promise<ValidationResult>;

/** @internal - Use Standard Schema instead */
export type FormValidator<T = Record<string, any>> = (
  formData: T,
  context: ValidationContext
) => ValidationResult | Promise<ValidationResult>;

// 2.3. Standard Schema Support
export type StandardSchema<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>;

// Helper types for Standard Schema
export type InferInput<T> = T extends StandardSchema<infer I, any> ? I : unknown;
export type InferOutput<T> = T extends StandardSchema<any, infer O> ? O : unknown;

// 2.6. Unified Validation Configuration (Standard Schema only)
export interface FieldValidationConfig<T = any> {
  /**
   * Validation rules using Standard Schema interface
   * Accepts: single schema, array of schemas, or any Standard Schema compatible validation
   *
   * @example Single schema
   * validate: z.string().email()
   *
   * @example Built-in validators
   * validate: required()
   *
   * @example Multiple validations
   * validate: [required(), email()]
   *
   * @example Mixed schemas + validators
   * validate: [z.string(), required(), customValidator()]
   */
  readonly validate?: StandardSchema<T> | StandardSchema<T>[];
  /**
   * Per-field async cost control: defer change-triggered validation until the
   * user stops typing for `debounceMs`. Orthogonal to the form-level validation
   * timing model (`FormValidationConfig.mode` / `reValidateMode`) — blur and
   * submit always validate immediately, unaffected by this.
   */
  readonly debounceMs?: number;
}

/**
 * When a field FIRST validates, mirroring React Hook Form's `mode`:
 * - `onSubmit`: only on submit.
 * - `onBlur`: on the field's first blur.
 * - `onChange`: from the first keystroke.
 * - `onTouched` (RilayKit default): on the first blur, then live.
 * - `all`: on both change and blur.
 *
 * NOTE: RilayKit defaults to `onTouched` (its established behavior), whereas
 * React Hook Form's own default is `onSubmit`. The value names are identical.
 */
export type FormValidationMode = 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all';

/**
 * How a field RE-validates once it has errored at least once, mirroring React
 * Hook Form's `reValidateMode` exactly. Default `onChange`, so an error clears
 * live as the user types the fix.
 */
export type FormReValidateMode = 'onChange' | 'onBlur' | 'onSubmit';

export interface FormValidationConfig<T extends Record<string, any> = Record<string, any>> {
  /**
   * Form-level validation using Standard Schema interface
   *
   * @example Object schema
   * validate: z.object({ email: z.string().email(), name: z.string() })
   *
   * @example Custom form validator
   * validate: customFormValidator()
   */
  readonly validate?: StandardSchema<T> | StandardSchema<T>[];
  /**
   * When each field FIRST validates. Defaults to `'onTouched'` (RilayKit's
   * established behavior). Mirrors React Hook Form's `mode` value names.
   */
  readonly mode?: FormValidationMode;
  /**
   * When a field RE-validates after it has errored once. Defaults to
   * `'onChange'`. Mirrors React Hook Form's `reValidateMode`.
   */
  readonly reValidateMode?: FormReValidateMode;
  readonly validateOnStepChange?: boolean;
}

// Legacy types completely removed - use unified Standard Schema API

// =================================================================
// 3. FIELD & FORM STATE
// =================================================================

export type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

/**
 * Field state without actions - used for selectors
 */
export interface FieldState {
  readonly value: unknown;
  readonly errors: FieldError[];
  readonly validationState: ValidationState;
  readonly touched: boolean;
  readonly dirty: boolean;
}

/**
 * Field conditions - visibility, disabled, required, readonly
 */
export interface FieldConditions {
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly readonly: boolean;
}

/**
 * Form state without actions - used for selectors
 */
export interface FormState {
  readonly values: Record<string, unknown>;
  readonly errors: Record<string, FieldError[]>;
  readonly validationStates: Record<string, ValidationState>;
  readonly touched: Record<string, boolean>;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  readonly isValid: boolean;
}

// =================================================================
// 4. CONDITION SYSTEM
// =================================================================

export interface ConditionalBehavior {
  readonly visible?: ConditionConfig;
  readonly disabled?: ConditionConfig;
  readonly required?: ConditionConfig;
  readonly readonly?: ConditionConfig;
}

export interface StepConditionalBehavior {
  readonly visible?: ConditionConfig;
  readonly skippable?: ConditionConfig;
}

// =================================================================
// 5. FORM SYSTEM
// =================================================================

// 5.1. Form Structure
export interface FormFieldConfig {
  readonly id: string;
  readonly componentId: string;
  readonly props: Record<string, any>;
  readonly validation?: FieldValidationConfig;
  readonly conditions?: ConditionalBehavior;
  readonly effects?: FieldEffects;
}

export interface FormFieldRow {
  readonly kind: 'fields';
  readonly id: string;
  readonly fields: FormFieldConfig[];
  readonly maxColumns?: number;
}

// 5.2. Repeatable Fields
export interface RepeatableFieldConfig {
  readonly id: string;
  readonly rows: FormFieldRow[];
  readonly allFields: FormFieldConfig[];
  readonly min?: number;
  readonly max?: number;
  readonly defaultValue?: Record<string, unknown>;
  readonly validation?: FieldValidationConfig;
}

export interface RepeatableFieldItem {
  readonly key: string;
  readonly index: number;
  readonly rows: FormFieldRow[];
  readonly allFields: FormFieldConfig[];
}

export interface FormRepeatableRow {
  readonly kind: 'repeatable';
  readonly id: string;
  readonly repeatable: RepeatableFieldConfig;
}

export type FormRowEntry = FormFieldRow | FormRepeatableRow;

// 5.3. Submit Options
export interface SubmitOptions {
  /** Skip validation entirely and force submit with current values */
  readonly force?: boolean;
  /** Run validation but exclude invalid fields from the submitted data */
  readonly skipInvalid?: boolean;
}

// 5.4. Form Configuration
export interface FormConfiguration<C extends Record<string, any> = Record<string, never>> {
  readonly id: string;
  readonly config: RilayInstance<C>;
  readonly rows: FormRowEntry[];
  readonly allFields: FormFieldConfig[];
  readonly repeatableFields?: Record<string, RepeatableFieldConfig>;
  readonly validation?: FormValidationConfig;
  readonly submitOptions?: SubmitOptions;
  readonly effectsMap?: Record<string, FieldEffect[]>;
}

// =================================================================
// 6. WORKFLOW SYSTEM
// =================================================================

// 6.1. Workflow Structure
export interface WorkflowContext {
  readonly workflowId: string;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly allData: Record<string, any>;
  readonly stepData: Record<string, any>;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly visitedSteps: Set<string>;
  readonly visibleVisitedSteps: Set<string>;
  readonly passedSteps: Set<string>;
}

export interface StepDataHelper {
  /**
   * Set data for a specific step by step ID
   */
  setStepData: (stepId: string, data: Record<string, any>) => void;

  /**
   * Set specific field values for a step
   */
  setStepFields: (stepId: string, fields: Record<string, any>) => void;

  /**
   * Get current data for a specific step
   */
  getStepData: (stepId: string) => Record<string, any>;

  /**
   * Set field value for the next step
   */
  setNextStepField: (fieldId: string, value: any) => void;

  /**
   * Set multiple fields for the next step
   */
  setNextStepFields: (fields: Record<string, any>) => void;

  /**
   * Get all workflow data
   */
  getAllData: () => Record<string, any>;

  /**
   * Get all step configurations for reference
   */
  getSteps: () => StepConfig[];
}

/**
 * Skip permission for a workflow step: a static boolean or a predicate
 * evaluated against the collected workflow data.
 */
export type StepAllowSkip = boolean | ((ctx: { allData: Record<string, unknown> }) => boolean);

export interface StepConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly formConfig: FormConfiguration;
  readonly allowSkip?: StepAllowSkip;
  readonly renderer?: CustomStepRenderer;
  readonly conditions?: StepConditionalBehavior;
  readonly metadata?: Record<string, any>;
  readonly onAfterValidation?: (
    stepData: Record<string, any>,
    helper: StepDataHelper,
    context: WorkflowContext
  ) => void | Promise<void>;
}

export type CustomStepRenderer = (props: StepConfig) => React.ReactElement;

// 6.2. Workflow Configuration
export interface WorkflowConfig {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: StepConfig[];
  readonly analytics?: WorkflowAnalytics;
  readonly persistence?: {
    adapter: any; // WorkflowPersistenceAdapter (generic to avoid circular deps)
    options?: any; // PersistenceOptions
    userId?: string;
  };
  readonly plugins?: WorkflowPlugin[];
}

// 6.3. Workflow Plugins & Analytics
export interface WorkflowAnalytics {
  readonly onWorkflowStart?: (workflowId: string, context: WorkflowContext) => void;
  readonly onWorkflowComplete?: (workflowId: string, duration: number, data: any) => void;
  readonly onWorkflowAbandon?: (workflowId: string, currentStep: string, data: any) => void;
  readonly onStepStart?: (stepId: string, timestamp: number, context: WorkflowContext) => void;
  readonly onStepComplete?: (
    stepId: string,
    duration: number,
    data: any,
    context: WorkflowContext
  ) => void;
  readonly onStepSkip?: (stepId: string, reason: string, context: WorkflowContext) => void;
  readonly onError?: (error: Error, context: WorkflowContext) => void;
}

export interface WorkflowPlugin {
  readonly name: string;
  readonly version?: string;
  readonly install: (workflow: any) => void;
  readonly dependencies?: string[];
}

// =================================================================
// 7. MONITORING & PERFORMANCE SYSTEM
// =================================================================

// 7.1. Performance Metrics
export interface PerformanceMetrics {
  readonly timestamp: number;
  readonly duration: number;
  readonly memoryUsage?: number;
  readonly renderCount?: number;
  readonly reRenderCount?: number;
}

export interface ComponentPerformanceMetrics extends PerformanceMetrics {
  readonly componentId: string;
  readonly componentType: string;
  readonly propsSize?: number;
  readonly childrenCount?: number;
}

export interface FormPerformanceMetrics extends PerformanceMetrics {
  readonly formId: string;
  readonly fieldCount: number;
  readonly validationDuration: number;
  readonly renderDuration: number;
  readonly validationErrors: number;
}

export interface WorkflowPerformanceMetrics extends PerformanceMetrics {
  readonly workflowId: string;
  readonly stepCount: number;
  readonly currentStepIndex: number;
  readonly navigationDuration: number;
  readonly persistenceDuration?: number;
  readonly conditionEvaluationDuration: number;
}

// 7.2. Monitoring Events
export type MonitoringEventType =
  | 'component_render'
  | 'component_update'
  | 'form_validation'
  | 'form_submission'
  | 'workflow_navigation'
  | 'workflow_persistence'
  | 'condition_evaluation'
  | 'error'
  | 'performance_warning';

export interface MonitoringEvent {
  readonly id: string;
  readonly type: MonitoringEventType;
  readonly timestamp: number;
  readonly source: string;
  readonly data: Record<string, any>;
  readonly metrics?: PerformanceMetrics;
  readonly severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorMonitoringEvent extends MonitoringEvent {
  readonly type: 'error';
  readonly error: Error;
  readonly stack?: string;
  readonly context?: ValidationContext | WorkflowContext;
}

export interface PerformanceWarningEvent extends MonitoringEvent {
  readonly type: 'performance_warning';
  readonly threshold: number;
  readonly actualValue: number;
  readonly recommendation?: string;
}

// 7.3. Monitoring Configuration
export interface MonitoringConfig {
  readonly enabled: boolean;
  readonly enablePerformanceTracking?: boolean;
  readonly enableErrorTracking?: boolean;
  readonly enableMemoryTracking?: boolean;
  readonly performanceThresholds?: PerformanceThresholds;
  readonly sampleRate?: number; // 0-1, percentage of events to track
  readonly bufferSize?: number;
  readonly flushInterval?: number; // milliseconds
  readonly onEvent?: (event: MonitoringEvent) => void;
  readonly onBatch?: (events: MonitoringEvent[]) => void;
  readonly onError?: (error: Error) => void;
}

export interface PerformanceThresholds {
  readonly componentRenderTime?: number; // milliseconds
  readonly formValidationTime?: number; // milliseconds
  readonly workflowNavigationTime?: number; // milliseconds
  readonly memoryUsage?: number; // bytes
  readonly reRenderCount?: number;
}

// 7.4. Monitoring Adapters
export interface MonitoringAdapter {
  readonly name: string;
  readonly version?: string;
  send: (events: MonitoringEvent[]) => Promise<void>;
  flush?: () => Promise<void>;
  configure?: (config: Record<string, any>) => void;
}

export interface ConsoleMonitoringAdapter extends MonitoringAdapter {
  readonly name: 'console';
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface RemoteMonitoringAdapter extends MonitoringAdapter {
  readonly name: 'remote';
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
  readonly batchSize?: number;
  readonly retryAttempts?: number;
}

// 7.5. Monitoring Context
export interface MonitoringContext {
  readonly sessionId: string;
  readonly userId?: string;
  readonly userAgent?: string;
  readonly url?: string;
  readonly environment: 'development' | 'production' | 'test';
  readonly version?: string;
  readonly metadata?: Record<string, any>;
}

// 7.6. Performance Profiler
export interface PerformanceProfiler {
  start: (label: string, metadata?: Record<string, any>) => void;
  end: (label: string) => PerformanceMetrics | null;
  mark: (name: string) => void;
  measure: (name: string, startMark: string, endMark?: string) => number;
  getMetrics: (label: string) => PerformanceMetrics | null;
  getAllMetrics: () => Record<string, PerformanceMetrics>;
  clear: (label?: string) => void;
}

// 7.7. Enhanced Analytics with Monitoring
export interface EnhancedWorkflowAnalytics extends WorkflowAnalytics {
  readonly monitoring?: MonitoringConfig;
  readonly onPerformanceWarning?: (event: PerformanceWarningEvent) => void;
  readonly onMemoryLeak?: (metrics: ComponentPerformanceMetrics) => void;
}

export interface EnhancedFormAnalytics {
  readonly onFormRender?: (metrics: FormPerformanceMetrics) => void;
  readonly onFormValidation?: (metrics: FormPerformanceMetrics) => void;
  readonly onFormSubmission?: (metrics: FormPerformanceMetrics) => void;
  readonly onFieldChange?: (fieldId: string, metrics: ComponentPerformanceMetrics) => void;
  readonly monitoring?: MonitoringConfig;
}

// =================================================================
// 9. FIELD EFFECTS SYSTEM
// =================================================================

/**
 * Context passed to effect handlers.
 * Provides access to store actions without coupling to React.
 */
export interface FieldEffectContext {
  /** Set a field value */
  readonly setValue: (fieldId: string, value: unknown) => void;
  /** Override dynamic props for a field */
  readonly setProps: (fieldId: string, props: Record<string, unknown>) => void;
  /** Get all current form values (snapshot) */
  readonly getValues: () => Record<string, unknown>;
  /** Get a single field value */
  readonly getFieldValue: (fieldId: string) => unknown;
}

/**
 * Handler function for a field effect.
 * Can be async (e.g. fetch remote options).
 */
export type FieldEffectHandler = (
  newValue: unknown,
  context: FieldEffectContext
) => void | Promise<void>;

/**
 * A single field effect declaration.
 * Created by the onChange() helper function.
 */
export interface FieldEffect {
  /** The type of trigger */
  readonly trigger: 'change';
  /** The field ID to watch for changes */
  readonly watchFieldId: string;
  /** The handler to execute when the watched field changes */
  readonly handler: FieldEffectHandler;
  /**
   * Set by the form builder's effect indexer (never by `onChange`): the id of
   * the repeatable this effect was declared IN, when it lives on a repeatable
   * template field. It lets the effect engine fan the effect out per live row
   * when its watched field is a GLOBAL field (a composite-key watch scopes
   * itself; a global watch would otherwise fire once, un-scoped).
   */
  readonly declaringRepeatableId?: string;
}

/** Array of field effect declarations */
export type FieldEffects = readonly FieldEffect[];

// =================================================================
// 10. UNIFIED CATALOG (components / tools / parts)
// =================================================================

export * from './catalog';
