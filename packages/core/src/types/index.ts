import React from "react";
import { StreamlineConfig } from "../config/StreamlineConfig";

// Component types
export type ComponentType = "input" | "layout";
export type InputType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "select"
  | "checkbox"
  | "textarea"
  | "file"
  | "date";
export type LayoutType =
  | "heading"
  | "paragraph"
  | "container"
  | "divider"
  | "spacer"
  | "alert";

// Validation types
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
  readonly warnings?: ValidationWarning[];
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly path?: string[];
}

export interface ValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly path?: string[];
}

// Validation context
export interface ValidationContext {
  readonly fieldId: string;
  readonly formData: Record<string, any>;
  readonly fieldProps: Record<string, any>;
  readonly touched: boolean;
  readonly dirty: boolean;
}

// Validator function - can be sync or async
export type ValidatorFunction<TProps = any> = (
  value: any,
  context: ValidationContext,
  props: TProps
) => ValidationResult | Promise<ValidationResult>;

// Validation configuration
export interface ValidationConfig<TProps = any> {
  readonly validator?: ValidatorFunction<TProps>;
  readonly debounceMs?: number;
  readonly validateOnChange?: boolean;
  readonly validateOnBlur?: boolean;
  readonly validateOnSubmit?: boolean;
  readonly dependencies?: string[]; // Fields this validation depends on
}

// Component renderer
export interface ComponentRenderer<TProps = any> {
  (props: ComponentRenderProps<TProps>): React.ReactElement;
}

export interface ComponentRenderProps<TProps = any> {
  id: string;
  props: TProps;
  value?: any;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  error?: ValidationError[];
  warnings?: ValidationWarning[];
  touched?: boolean;
  disabled?: boolean;
  isValidating?: boolean;
  [key: string]: any;
}

// Configuration options
export interface ComponentOptions<TProps = any> {
  readonly configurable?: Array<{
    key: keyof TProps;
    type: "string" | "number" | "boolean" | "select" | "array";
    label: string;
    options?: any[];
    default?: any;
  }>;
  readonly previewProps?: Partial<TProps>;
  readonly icon?: string;
  readonly tags?: string[];
}

// Base component configuration
export interface ComponentConfig<TProps = any> {
  readonly id: string;
  readonly type: ComponentType;
  readonly subType: InputType | LayoutType;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly renderer: ComponentRenderer<TProps>;
  readonly options?: ComponentOptions<TProps>;
  readonly validation?: ValidationConfig<TProps>;
  readonly defaultProps?: Partial<TProps>;
}

// Form field configuration
export interface FormFieldConfig {
  readonly id: string;
  readonly componentId: string;
  readonly props: Record<string, any>;
  readonly validation?: ValidationConfig;
  readonly conditional?: ConditionalConfig;
}

export interface FormFieldRow {
  readonly id: string;
  readonly fields: FormFieldConfig[];
  readonly maxColumns?: number; // Max 3 per default
  readonly spacing?: "tight" | "normal" | "loose";
  readonly alignment?: "start" | "center" | "end" | "stretch";
}

// Conditional configuration
export interface ConditionalConfig {
  readonly condition: (formData: Record<string, any>) => boolean;
  readonly action: "show" | "hide" | "disable" | "require";
}

// ===== WORKFLOW SYSTEM TYPES =====

// Async Lifecycle Hooks
export interface StepLifecycleHooks {
  readonly onBeforeEnter?: (stepData: any, allData: any, context: WorkflowContext) => Promise<void>;
  readonly onAfterLeave?: (stepData: any, allData: any, context: WorkflowContext) => Promise<boolean>;
  readonly onValidate?: (stepData: any, context: WorkflowContext) => Promise<ValidationResult>;
  readonly onTransform?: (stepData: any, context: WorkflowContext) => Promise<any>;
  readonly onError?: (error: Error, context: WorkflowContext) => Promise<void>;
}

// Workflow Context
export interface WorkflowContext {
  readonly workflowId: string;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly allData: Record<string, any>;
  readonly stepData: Record<string, any>;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly visitedSteps: Set<string>;
  readonly user?: any;
}

// Step Permissions
export interface StepPermissions {
  readonly requiredRoles?: string[];
  readonly requiredPermissions?: string[];
  readonly customGuard?: (user: any, context: WorkflowContext) => boolean | Promise<boolean>;
}

// Dynamic Step Configuration
export interface DynamicStepConfig {
  readonly resolver: (previousData: any, context: WorkflowContext) => Promise<StepConfig[]>;
  readonly cacheKey?: string;
  readonly retryPolicy?: RetryPolicy;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly delayMs: number;
  readonly backoffMultiplier?: number;
}

// Conditional Branch
export interface ConditionalBranch {
  readonly condition: (data: any, context: WorkflowContext) => boolean | Promise<boolean>;
  readonly steps: StepConfig[];
  readonly fallback?: StepConfig[];
}

// Enhanced Step Configuration
export interface StepConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly formConfig: FormConfiguration; // Complete form configuration for this step
  readonly validation?: StepValidationConfig;
  readonly conditional?: StepConditionalConfig;
  readonly customRenderer?: StepRenderer;
  readonly allowSkip?: boolean;
  readonly requiredToComplete?: boolean;
  readonly hooks?: StepLifecycleHooks;
  readonly permissions?: StepPermissions;
  readonly isDynamic?: boolean;
  readonly dynamicConfig?: DynamicStepConfig;
}

export interface StepValidationConfig {
  readonly validator?: (
    stepData: Record<string, any>,
    allFormData: Record<string, any>,
    context: WorkflowContext
  ) => ValidationResult | Promise<ValidationResult>;
  readonly validateOnStepChange?: boolean;
  readonly blockNextIfInvalid?: boolean;
}

export interface StepConditionalConfig {
  readonly condition: (formData: Record<string, any>, context: WorkflowContext) => boolean;
  readonly action: "show" | "hide" | "skip";
}

export interface StepRenderer {
  (props: StepRenderProps): React.ReactElement;
}

export interface StepRenderProps {
  step: StepConfig;
  formConfig: FormConfiguration;
  formData: Record<string, any>;
  errors: Record<string, ValidationError[]>;
  onFieldChange: (fieldId: string, value: any) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip?: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  currentStepIndex: number;
  totalSteps: number;
  context: WorkflowContext;
}

// Persistence System
export interface PersistenceStrategy {
  readonly type: 'localStorage' | 'sessionStorage' | 'api' | 'indexedDB';
  readonly endpoint?: string;
  readonly debounceMs?: number;
  readonly encryptionKey?: string;
  readonly saveOnStepChange?: boolean;
  readonly recoverOnReload?: boolean;
  readonly onSave?: (draftData: any) => Promise<void> | void;
  readonly onRestore?: (draftData: any) => Promise<void> | void;
  readonly onError?: (error: Error) => Promise<void> | void;
}

// Analytics System
export interface WorkflowAnalytics {
  readonly onWorkflowStart?: (workflowId: string, context: WorkflowContext) => void;
  readonly onWorkflowComplete?: (workflowId: string, duration: number, data: any) => void;
  readonly onWorkflowAbandon?: (workflowId: string, currentStep: string, data: any) => void;
  readonly onStepStart?: (stepId: string, timestamp: number, context: WorkflowContext) => void;
  readonly onStepComplete?: (stepId: string, duration: number, data: any, context: WorkflowContext) => void;
  readonly onStepSkip?: (stepId: string, reason: string, context: WorkflowContext) => void;
  readonly onValidationError?: (stepId: string, errors: ValidationError[], context: WorkflowContext) => void;
  readonly onError?: (error: Error, context: WorkflowContext) => void;
}

// Performance Optimizations
export interface WorkflowOptimizations {
  readonly preloadNextStep?: boolean;
  readonly cacheValidation?: boolean;
  readonly virtualizeSteps?: boolean;
  readonly lazyLoadComponents?: boolean;
  readonly maxConcurrentRequests?: number;
}

// Workflow Versioning
export interface WorkflowVersion {
  readonly version: string;
  readonly migrationStrategy?: (oldData: any, newConfig: any) => any;
  readonly compatibilityMode?: boolean;
}

// Plugin System
export interface WorkflowHooks {
  readonly onStepChange?: (from: string, to: string, context: WorkflowContext) => void;
  readonly onDataChange?: (data: any, context: WorkflowContext) => void;
  readonly onValidation?: (result: ValidationResult, context: WorkflowContext) => void;
}

export interface WorkflowPlugin {
  readonly name: string;
  readonly version?: string;
  readonly install: (workflow: any) => void; // Will be typed properly in WorkflowBuilder
  readonly hooks?: WorkflowHooks;
  readonly dependencies?: string[];
}

// Enhanced Workflow Configuration
export interface WorkflowConfig {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: StepConfig[];
  readonly branches?: ConditionalBranch[];
  readonly navigation?: NavigationConfig;
  readonly persistence?: PersistenceStrategy;
  readonly completion?: CompletionConfig;
  readonly analytics?: WorkflowAnalytics;
  readonly optimizations?: WorkflowOptimizations;
  readonly version?: WorkflowVersion;
  readonly plugins?: WorkflowPlugin[];
  readonly renderConfig?: WorkflowRenderConfig;
}

export interface NavigationConfig {
  readonly allowBackNavigation?: boolean;
  readonly allowStepSkipping?: boolean;
  readonly showProgress?: boolean;
  readonly customNavigation?: boolean;
}

export interface PersistenceConfig {
  readonly enabled?: boolean;
  readonly storageKey?: string;
  readonly debounceMs?: number;
  readonly excludeFields?: string[];
}

export interface CompletionConfig {
  readonly onComplete?: (formData: Record<string, any>) => void | Promise<void>;
  readonly confirmBeforeSubmit?: boolean;
  readonly customCompletionStep?: StepRenderer;
}

// Workflow Renderers
export interface WorkflowStepperRendererProps {
  readonly steps: StepConfig[];
  readonly currentStepIndex: number;
  readonly visitedSteps: Set<string>;
  readonly onStepClick?: (stepIndex: number) => void;
  readonly className?: string;
}

export interface WorkflowNavigationRendererProps {
  readonly currentStep: StepConfig;
  readonly context: WorkflowContext;
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly canSkip: boolean;
  readonly isSubmitting: boolean;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onSkip: () => void;
  readonly onSubmit: () => void;
  readonly className?: string;
}

export type WorkflowStepperRenderer = (props: WorkflowStepperRendererProps) => React.ReactElement;
export type WorkflowNavigationRenderer = (props: WorkflowNavigationRendererProps) => React.ReactElement;

// Workflow Render Configuration
export interface WorkflowRenderConfig {
  readonly stepRenderer?: StepRenderer;
  readonly stepperRenderer?: WorkflowStepperRenderer;
  readonly navigationRenderer?: WorkflowNavigationRenderer;
}

// Form structural renderers
export interface FormRowRendererProps {
  row: FormFieldRow;
  children: React.ReactNode;
  className?: string;
  spacing?: "tight" | "normal" | "loose";
  alignment?: "start" | "center" | "end" | "stretch";
}

export interface FormBodyRendererProps {
  formConfig: FormConfiguration;
  children: React.ReactNode;
  className?: string;
}

export interface FormSubmitButtonRendererProps {
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  onSubmit: () => void;
  className?: string;
  children?: React.ReactNode;
}

export type FormRowRenderer = (props: FormRowRendererProps) => React.ReactElement;
export type FormBodyRenderer = (props: FormBodyRendererProps) => React.ReactElement;
export type FormSubmitButtonRenderer = (props: FormSubmitButtonRendererProps) => React.ReactElement;

// Form renderer configuration
export interface FormRenderConfig {
  readonly rowRenderer?: FormRowRenderer;
  readonly bodyRenderer?: FormBodyRenderer;
  readonly submitButtonRenderer?: FormSubmitButtonRenderer;
}

export interface FormConfiguration {
  readonly id: string;
  readonly schema?: any; // Can be Zod, Yup, or custom schema
  readonly config: StreamlineConfig; // Reference to StreamlineConfig
  readonly rows: FormFieldRow[];
  readonly allFields: FormFieldConfig[]; // Liste plate pour compatibilité
  readonly renderConfig?: FormRenderConfig; // Configuration pour les renderers
}
