import type React from 'react';
import type { ril } from '../config/ril';

// License types
export interface RilayLicenseConfig {
  readonly licenseKey?: string;
  readonly environment?: 'development' | 'production';
  readonly allowTrial?: boolean;
}

// Validation types
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
}

export interface ValidationError {
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
export type ComponentRenderer<TProps = any> = (
  props: ComponentRenderProps<TProps>
) => React.ReactElement;

export interface ComponentRenderProps<TProps = any> {
  id: string;
  props: TProps;
  value?: any;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  error?: ValidationError[];
  touched?: boolean;
  disabled?: boolean;
  isValidating?: boolean;
  [key: string]: any;
}

// Renderer children function type
export type RendererChildrenFunction<TProps = any> = (props: TProps) => React.ReactNode;

// Helper function to resolve children (either React.ReactNode or function)
export function resolveRendererChildren<TProps>(
  children: React.ReactNode | RendererChildrenFunction<TProps> | undefined,
  props: TProps
): React.ReactNode {
  if (typeof children === 'function') {
    return children(props);
  }
  return children;
}

// Base component configuration
export interface ComponentConfig<TProps = any> {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
  readonly renderer: ComponentRenderer<TProps>;
  readonly validation?: ValidationConfig<TProps>;
  readonly defaultProps?: Partial<TProps>;
  readonly useFieldRenderer?: boolean;
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
  readonly spacing?: 'tight' | 'normal' | 'loose';
  readonly alignment?: 'start' | 'center' | 'end' | 'stretch';
}

// Conditional configuration
export interface ConditionalConfig {
  readonly condition: (formData: Record<string, any>) => boolean;
  readonly action: 'show' | 'hide' | 'disable' | 'require';
}

// ===== WORKFLOW SYSTEM TYPES =====

// Async Lifecycle Hooks
export interface StepLifecycleHooks {
  readonly onBeforeEnter?: (stepData: any, allData: any, context: WorkflowContext) => Promise<void>;
  readonly onAfterLeave?: (
    stepData: any,
    allData: any,
    context: WorkflowContext
  ) => Promise<boolean>;
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

// Enhanced Step Configuration
export interface StepConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly formConfig: FormConfiguration; // Complete form configuration for this step
  readonly validation?: StepValidationConfig;
  readonly conditional?: StepConditionalConfig;
  readonly allowSkip?: boolean;
  readonly requiredToComplete?: boolean;
  readonly hooks?: StepLifecycleHooks;
  readonly permissions?: StepPermissions;
  readonly isDynamic?: boolean;
  readonly dynamicConfig?: DynamicStepConfig;
  readonly renderer?: CustomStepRenderer;
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
  readonly action: 'show' | 'hide' | 'skip';
}

export type CustomStepRenderer = (props: StepConfig) => React.ReactElement;

// Base persistence data structure
export interface WorkflowPersistenceData {
  readonly workflowId: string;
  readonly currentStepIndex: number;
  readonly allData: Record<string, any>;
  readonly metadata: {
    readonly timestamp: number;
    readonly version?: string;
    readonly userId?: string;
    readonly sessionId?: string;
  };
}

// Persistence adapter interface - implement this for any storage backend
export interface PersistenceAdapter {
  readonly name: string;
  save(key: string, data: WorkflowPersistenceData): Promise<void>;
  load(key: string): Promise<WorkflowPersistenceData | null>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list?(pattern?: string): Promise<string[]>; // Optional: list all keys
}

// Persistence configuration
export interface PersistenceConfig {
  readonly adapter: PersistenceAdapter;
  readonly key?: string; // Custom key, defaults to workflowId
  readonly debounceMs?: number;
  readonly autoSave?: boolean;
  readonly saveOnStepChange?: boolean;
  readonly encryptionKey?: string;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;

  // Lifecycle hooks
  readonly onSave?: (data: WorkflowPersistenceData) => Promise<void> | void;
  readonly onLoad?: (data: WorkflowPersistenceData) => Promise<void> | void;
  readonly onError?: (error: Error, operation: 'save' | 'load' | 'remove') => Promise<void> | void;
  readonly onRetry?: (attempt: number, maxRetries: number, error: Error) => Promise<void> | void;
}

// Analytics System
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
  readonly onValidationError?: (
    stepId: string,
    errors: ValidationError[],
    context: WorkflowContext
  ) => void;
  readonly onError?: (error: Error, context: WorkflowContext) => void;
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
  readonly navigation?: NavigationConfig;
  readonly persistence?: PersistenceConfig;
  readonly completion?: CompletionConfig;
  readonly analytics?: WorkflowAnalytics;
  readonly plugins?: WorkflowPlugin[];
  readonly renderConfig?: WorkflowRenderConfig;
}

export interface NavigationConfig {
  readonly allowBackNavigation?: boolean; // Default to true
  readonly allowStepSkipping?: boolean;
  readonly showProgress?: boolean;
  readonly customNavigation?: boolean;
}

export interface CompletionConfig {
  readonly onComplete?: (formData: Record<string, any>) => void | Promise<void>;
  readonly confirmBeforeSubmit?: boolean;
  readonly customCompletionStep?: any;
}

// Workflow Renderers
export interface WorkflowStepperRendererProps {
  readonly steps: StepConfig[];
  readonly currentStepIndex: number;
  readonly visitedSteps: Set<string>;
  readonly onStepClick?: (stepIndex: number) => void;
  readonly className?: string;
}

export type WorkflowStepperRenderer = (props: WorkflowStepperRendererProps) => React.ReactElement;

// Workflow Render Configuration
export interface WorkflowRenderConfig {
  readonly stepperRenderer?: WorkflowStepperRenderer;
  readonly nextButtonRenderer?: WorkflowNextButtonRenderer;
  readonly previousButtonRenderer?: WorkflowPreviousButtonRenderer;
  readonly skipButtonRenderer?: WorkflowSkipButtonRenderer;
}

// Form structural renderers
export interface FormRowRendererProps {
  row: FormFieldRow;
  children: React.ReactNode; // Always React.ReactNode, never function
  className?: string;
  spacing?: 'tight' | 'normal' | 'loose';
  alignment?: 'start' | 'center' | 'end' | 'stretch';
}

export interface FormBodyRendererProps {
  formConfig: FormConfiguration;
  children: React.ReactNode; // Always React.ReactNode, never function
  className?: string;
}

export interface FormSubmitButtonRendererProps {
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  onSubmit: () => void;
  className?: string;
  children?: React.ReactNode; // Always React.ReactNode, never function
}

export type FormRowRenderer = (props: FormRowRendererProps) => React.ReactElement;
export type FormBodyRenderer = (props: FormBodyRendererProps) => React.ReactElement;
export type FormSubmitButtonRenderer = (props: FormSubmitButtonRendererProps) => React.ReactElement;

export interface FieldRendererProps {
  children: React.ReactNode; // Always React.ReactNode, never function
  id: string;
  error?: ValidationError[];
  touched?: boolean;
  disabled?: boolean;
  isValidating?: boolean;
  [key: string]: any;
}

export type FieldRenderer = (props: FieldRendererProps) => React.ReactElement;

// Form renderer configuration
export interface FormRenderConfig {
  readonly rowRenderer?: FormRowRenderer;
  readonly bodyRenderer?: FormBodyRenderer;
  readonly submitButtonRenderer?: FormSubmitButtonRenderer;
  readonly fieldRenderer?: FieldRenderer;
}

export interface FormConfiguration {
  readonly id: string;
  readonly schema?: any; // Can be Zod, Yup, or custom schema
  readonly config: ril; // Reference to StreamlineConfig
  readonly rows: FormFieldRow[];
  readonly allFields: FormFieldConfig[]; // Liste plate pour compatibilité
  readonly renderConfig?: FormRenderConfig; // Configuration pour les renderers
}

export interface WorkflowNextButtonRendererProps {
  isLastStep: boolean;
  canGoNext: boolean;
  isSubmitting: boolean;
  onNext: (event?: React.FormEvent) => void;
  onSubmit: (event?: React.FormEvent) => void;
  className?: string;
  children?: React.ReactNode; // Always React.ReactNode, never function
  // Step data
  currentStep: StepConfig;
  stepData: Record<string, any>;
  allData: Record<string, any>;
  context: WorkflowContext;
}

export interface WorkflowPreviousButtonRendererProps {
  canGoPrevious: boolean;
  onPrevious: (event?: React.FormEvent) => void;
  className?: string;
  children?: React.ReactNode; // Always React.ReactNode, never function
  // Step data
  currentStep: StepConfig;
  stepData: Record<string, any>;
  allData: Record<string, any>;
  context: WorkflowContext;
}

export interface WorkflowSkipButtonRendererProps {
  canSkip: boolean;
  onSkip: (event?: React.FormEvent) => void;
  className?: string;
  children?: React.ReactNode; // Always React.ReactNode, never function
  // Step data
  currentStep: StepConfig;
  stepData: Record<string, any>;
  allData: Record<string, any>;
  context: WorkflowContext;
}

export type WorkflowNextButtonRenderer = (
  props: WorkflowNextButtonRendererProps
) => React.ReactElement;
export type WorkflowPreviousButtonRenderer = (
  props: WorkflowPreviousButtonRendererProps
) => React.ReactElement;
export type WorkflowSkipButtonRenderer = (
  props: WorkflowSkipButtonRendererProps
) => React.ReactElement;
