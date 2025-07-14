import type React from 'react';
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

// 2.2. Validator Function Types
export type FieldValidator<T = any> = (
  value: T,
  context: ValidationContext
) => ValidationResult | Promise<ValidationResult>;

export type FormValidator<T = Record<string, any>> = (
  formData: T,
  context: ValidationContext
) => ValidationResult | Promise<ValidationResult>;

// 2.3. Validation Schema Types (for adapters like Zod)
export type ValidationSchema<T = any> = {
  parse: (value: T) => T;
  safeParse: (value: T) => { success: boolean; data?: T; error?: any };
};

// 2.4. Validation Adapter Interface
export interface ValidationAdapter<TSchema = any> {
  readonly name: string;
  readonly version?: string;
  createFieldValidator<T>(schema: TSchema): FieldValidator<T>;
  createFormValidator<T>(schema: TSchema): FormValidator<T>;
}

// 2.5. Validation Configuration
export interface FieldValidationConfig {
  readonly validators?: FieldValidator[];
  readonly schema?: ValidationSchema;
  readonly validateOnChange?: boolean;
  readonly validateOnBlur?: boolean;
  readonly debounceMs?: number;
}

export interface FormValidationConfig {
  readonly validators?: FormValidator[];
  readonly schema?: ValidationSchema;
  readonly validateOnSubmit?: boolean;
  readonly validateOnStepChange?: boolean;
}

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

export interface ComponentConfig<TProps = any> {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
  readonly renderer: ComponentRenderer<TProps>;
  readonly defaultProps?: Partial<TProps>;
  readonly useFieldRenderer?: boolean;
  readonly validation?: FieldValidationConfig;
}

// =================================================================
// 4. FORM SYSTEM
// =================================================================

// 4.1. Form Structure
export interface FormFieldConfig {
  readonly id: string;
  readonly componentId: string;
  readonly props: Record<string, any>;
  readonly validation?: FieldValidationConfig;
}

export interface FormFieldRow {
  readonly id: string;
  readonly fields: FormFieldConfig[];
  readonly maxColumns?: number;
}

// 4.2. Form Configuration
export interface FormConfiguration<C extends Record<string, any> = Record<string, never>> {
  readonly id: string;
  readonly config: ril<C>;
  readonly rows: FormFieldRow[];
  readonly allFields: FormFieldConfig[];
  readonly renderConfig?: FormRenderConfig;
  readonly validation?: FormValidationConfig;
}

export interface FormRenderConfig {
  readonly rowRenderer?: FormRowRenderer;
  readonly bodyRenderer?: FormBodyRenderer;
  readonly submitButtonRenderer?: FormSubmitButtonRenderer;
  readonly fieldRenderer?: FieldRenderer;
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
  [key: string]: any;
}

export type FormRowRenderer = RendererChildrenFunction<FormRowRendererProps>;
export type FormBodyRenderer = RendererChildrenFunction<FormBodyRendererProps>;
export type FormSubmitButtonRenderer = RendererChildrenFunction<FormSubmitButtonRendererProps>;
export type FieldRenderer = RendererChildrenFunction<FieldRendererProps>;

// =================================================================
// 5. WORKFLOW SYSTEM
// =================================================================

// 5.1. Workflow Structure
export interface WorkflowContext {
  readonly workflowId: string;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly allData: Record<string, any>;
  readonly stepData: Record<string, any>;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly visitedSteps: Set<string>;
}

export interface StepConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly formConfig: FormConfiguration;
  readonly allowSkip?: boolean;
  readonly renderer?: CustomStepRenderer;
}

export type CustomStepRenderer = (props: StepConfig) => React.ReactElement;

// 5.2. Workflow Configuration
export interface WorkflowConfig {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: StepConfig[];
  readonly analytics?: WorkflowAnalytics;
  readonly plugins?: WorkflowPlugin[];
  readonly renderConfig?: WorkflowRenderConfig;
}

export interface WorkflowRenderConfig {
  readonly stepperRenderer?: WorkflowStepperRenderer;
  readonly nextButtonRenderer?: WorkflowNextButtonRenderer;
  readonly previousButtonRenderer?: WorkflowPreviousButtonRenderer;
  readonly skipButtonRenderer?: WorkflowSkipButtonRenderer;
}

// 5.3. Workflow Plugins & Analytics
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

// 5.4. Workflow Renderers
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
  onPrevious: (event?: React.FormEvent) => void;
};

export type WorkflowSkipButtonRendererProps = WorkflowComponentRendererBaseProps & {
  canSkip: boolean;
  onSkip: (event?: React.FormEvent) => void;
};

export type WorkflowStepperRenderer = RendererChildrenFunction<WorkflowStepperRendererProps>;
export type WorkflowNextButtonRenderer = RendererChildrenFunction<WorkflowNextButtonRendererProps>;
export type WorkflowPreviousButtonRenderer =
  RendererChildrenFunction<WorkflowPreviousButtonRendererProps>;
export type WorkflowSkipButtonRenderer = RendererChildrenFunction<WorkflowSkipButtonRendererProps>;
