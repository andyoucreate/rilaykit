import type { StandardSchemaV1 } from '@standard-schema/spec';
import type React from 'react';
import type { ConditionConfig } from '../conditions';
import type { ril } from '../config/ril';

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
export interface ValidationError {
  readonly message: string;
  readonly code?: string;
  readonly path?: string;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
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
  readonly validateOnChange?: boolean;
  readonly validateOnBlur?: boolean;
  readonly debounceMs?: number;
}

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
  readonly validateOnSubmit?: boolean;
  readonly validateOnStepChange?: boolean;
}

// Legacy types completely removed - use unified Standard Schema API

// =================================================================
// 3. COMPONENT SYSTEM
// =================================================================

export type ComponentRenderer<TProps = any> = (
  props: ComponentRenderProps<TProps>
) => React.ReactElement;

export type RendererChildrenFunction<TProps = any> = (props: TProps) => React.ReactNode;

export interface ComponentRendererBaseProps<TProps = any> {
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<TProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export interface ComponentRendererWrapperProps<TProps = any>
  extends Omit<ComponentRendererBaseProps<TProps>, 'className'> {
  name: string;
  props: TProps;
  renderer?: RendererChildrenFunction<TProps>;
}

export interface ComponentRenderProps<TProps = any> {
  id: string;
  props: TProps;
  value?: any;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  disabled?: boolean;
  error?: ValidationError[];
  isValidating?: boolean;
  [key: string]: any;
}

/**
 * Property editor definition for builder property panel
 * Generic and extensible to support any custom editor type
 */
export interface PropertyEditorDefinition<TValue = any> {
  /** Property key in component props */
  readonly key: string;
  /** Display label in property panel */
  readonly label: string;
  /**
   * Editor type - can be any string to support custom editors
   * Built-in types: 'text', 'number', 'boolean', 'select', 'multiselect', 'color', 'textarea', 'json'
   * Custom types: 'phone', 'currency', 'location', 'rating', 'file-upload', etc.
   */
  readonly editorType: string;
  /** Optional description/help text */
  readonly helpText?: string;
  /** Default value for this property */
  readonly defaultValue?: TValue;
  /** Options for select/multiselect editors */
  readonly options?: Array<{ label: string; value: any; [key: string]: any }>;
  /** Validation function for the property value */
  readonly validate?: (value: TValue) => boolean | string | Promise<boolean | string>;
  /** Group/section for organizing properties */
  readonly group?: string;
  /** Whether this property is required */
  readonly required?: boolean;
  /** Placeholder text for input fields */
  readonly placeholder?: string;
  /** Custom editor component for advanced use cases */
  readonly customEditor?: React.ComponentType<PropertyEditorProps<TValue>>;
  /** Additional configuration specific to the editor type */
  readonly editorConfig?: Record<string, any>;
  /** Dependencies - other properties that affect this one */
  readonly dependencies?: string[];
  /** Conditional rendering based on other property values */
  readonly visible?: (props: Record<string, any>) => boolean;
  /** Transform value before saving */
  readonly transform?: (value: TValue) => any;
  /** Parse value when loading */
  readonly parse?: (value: any) => TValue;
}

/**
 * Props passed to custom property editors
 */
export interface PropertyEditorProps<TValue = any> {
  /** Current property value */
  readonly value: TValue;
  /** Callback to update the value */
  readonly onChange: (value: TValue) => void;
  /** Property definition */
  readonly definition: PropertyEditorDefinition<TValue>;
  /** All current property values (for dependencies) */
  readonly allValues: Record<string, any>;
  /** Whether the field is disabled */
  readonly disabled?: boolean;
  /** Validation errors */
  readonly errors?: string[];
}

/**
 * Builder metadata for visual editing capabilities
 * This is optional and only used by @rilaykit/builder
 * Fully generic to support any component type and configuration
 */
export interface ComponentBuilderMetadata<TProps = any> {
  /** Category for grouping in component palette (e.g., 'Input', 'Layout', 'Advanced') */
  readonly category?: string;
  /** Icon identifier (e.g., 'text', 'email', 'calendar') */
  readonly icon?: string;
  /** Whether this component should be hidden from the builder palette */
  readonly hidden?: boolean;
  /** Preview component or description for the palette */
  readonly preview?: React.ReactNode;
  /** Editable properties configuration for property panel */
  readonly editableProps?: PropertyEditorDefinition[];
  /** Tags for search and filtering */
  readonly tags?: string[];
  /**
   * Custom field schema for advanced type systems
   * Allows defining complex field types with their own validation and structure
   */
  readonly fieldSchema?: FieldSchemaDefinition<TProps>;
}

/**
 * Field schema definition for complex field types
 * Supports defining custom field types with validation, defaults, and metadata
 */
export interface FieldSchemaDefinition<TProps = any> {
  /** Field type identifier (e.g., 'location', 'phone', 'currency') */
  readonly type: string;
  /** Schema validation (Zod, Yup, or any Standard Schema) */
  readonly schema?: any;
  /** Default configuration for this field type */
  readonly defaultConfig?: Partial<TProps>;
  /** Sub-fields for complex types (e.g., Location has address, city, country) */
  readonly subFields?: Array<{
    key: string;
    label: string;
    type: string;
    required?: boolean;
  }>;
  /** Custom serialization for complex data structures */
  readonly serialize?: (value: any) => any;
  /** Custom deserialization for complex data structures */
  readonly deserialize?: (value: any) => any;
}

export interface ComponentConfig<TProps = any> {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
  readonly renderer: ComponentRenderer<TProps>;
  readonly defaultProps?: Partial<TProps>;
  readonly useFieldRenderer?: boolean;
  readonly validation?: FieldValidationConfig;
  /** Optional builder metadata for visual editing (only used by @rilaykit/builder) */
  readonly builder?: ComponentBuilderMetadata;
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

// 5.3. Repeatable Renderers
export interface RepeatableFieldRendererProps {
  readonly repeatableId: string;
  readonly items: RepeatableFieldItem[];
  readonly canAdd: boolean;
  readonly canRemove: boolean;
  readonly onAdd: () => void;
  readonly min?: number;
  readonly max?: number;
  readonly children: React.ReactNode;
}

export interface RepeatableItemRendererProps {
  readonly item: RepeatableFieldItem;
  readonly index: number;
  readonly total: number;
  readonly canRemove: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onRemove: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly children: React.ReactNode;
}

export type RepeatableFieldRenderer = RendererChildrenFunction<RepeatableFieldRendererProps>;
export type RepeatableItemRenderer = RendererChildrenFunction<RepeatableItemRendererProps>;

// 5.4. Form Configuration
export interface FormConfiguration<C extends Record<string, any> = Record<string, never>> {
  readonly id: string;
  readonly config: ril<C>;
  readonly rows: FormRowEntry[];
  readonly allFields: FormFieldConfig[];
  readonly repeatableFields?: Record<string, RepeatableFieldConfig>;
  readonly renderConfig?: FormRenderConfig;
  readonly validation?: FormValidationConfig;
}

export interface FormRenderConfig {
  readonly rowRenderer?: FormRowRenderer;
  readonly bodyRenderer?: FormBodyRenderer;
  readonly submitButtonRenderer?: FormSubmitButtonRenderer;
  readonly fieldRenderer?: FieldRenderer;
  readonly repeatableRenderer?: RepeatableFieldRenderer;
  readonly repeatableItemRenderer?: RepeatableItemRenderer;
}

// 4.3. Form Renderers
export interface FormComponentRendererProps {
  children: React.ReactNode;
}

export interface FormRowRendererProps {
  row: FormFieldRow;
  children: React.ReactNode;
  className?: string;
}

export interface FormBodyRendererProps {
  formConfig: FormConfiguration;
  children: React.ReactNode;
  className?: string;
}

export interface FormSubmitButtonRendererProps {
  isSubmitting: boolean;
  onSubmit: () => void;
  className?: string;
  children?: React.ReactNode;
}

export interface FieldRendererProps {
  children: React.ReactNode;
  id: string;
  disabled?: boolean;
  error?: ValidationError[];
  isValidating?: boolean;
  touched?: boolean;
  [key: string]: any;
}

export type FormRowRenderer = RendererChildrenFunction<FormRowRendererProps>;
export type FormBodyRenderer = RendererChildrenFunction<FormBodyRendererProps>;
export type FormSubmitButtonRenderer = RendererChildrenFunction<FormSubmitButtonRendererProps>;
export type FieldRenderer = RendererChildrenFunction<FieldRendererProps>;

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

export interface StepConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly formConfig: FormConfiguration;
  readonly allowSkip?: boolean;
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
  readonly renderConfig?: WorkflowRenderConfig;
}

export interface WorkflowRenderConfig {
  readonly stepperRenderer?: WorkflowStepperRenderer;
  readonly nextButtonRenderer?: WorkflowNextButtonRenderer;
  readonly previousButtonRenderer?: WorkflowPreviousButtonRenderer;
  readonly skipButtonRenderer?: WorkflowSkipButtonRenderer;
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

// 6.4. Workflow Renderers
export interface WorkflowComponentRendererBaseProps {
  children?: React.ReactNode;
  className?: string;
  currentStep: StepConfig;
  stepData: Record<string, any>;
  allData: Record<string, any>;
  context: WorkflowContext;
}

export interface WorkflowStepperRendererProps {
  readonly steps: StepConfig[];
  readonly currentStepIndex: number;
  readonly visitedSteps: Set<string>;
  readonly onStepClick?: (stepIndex: number) => void;
  readonly className?: string;
}

export type WorkflowNextButtonRendererProps = WorkflowComponentRendererBaseProps & {
  isLastStep: boolean;
  canGoNext: boolean;
  isSubmitting: boolean;
  onSubmit: (event?: React.FormEvent) => void;
};

export type WorkflowPreviousButtonRendererProps = WorkflowComponentRendererBaseProps & {
  canGoPrevious: boolean;
  isSubmitting: boolean;
  onPrevious: (event?: React.FormEvent) => void;
};

export type WorkflowSkipButtonRendererProps = WorkflowComponentRendererBaseProps & {
  canSkip: boolean;
  isSubmitting: boolean;
  onSkip: (event?: React.FormEvent) => void;
};

export type WorkflowStepperRenderer = RendererChildrenFunction<WorkflowStepperRendererProps>;
export type WorkflowNextButtonRenderer = RendererChildrenFunction<WorkflowNextButtonRendererProps>;
export type WorkflowPreviousButtonRenderer =
  RendererChildrenFunction<WorkflowPreviousButtonRendererProps>;
export type WorkflowSkipButtonRenderer = RendererChildrenFunction<WorkflowSkipButtonRendererProps>;

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
// 8. UNIFIED CONTEXT TYPES (V2)
// =================================================================

export * from './context';
