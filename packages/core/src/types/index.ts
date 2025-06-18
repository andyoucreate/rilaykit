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
  readonly maxColumns?: number; // Max 3 par défaut
  readonly spacing?: "tight" | "normal" | "loose";
  readonly alignment?: "start" | "center" | "end" | "stretch";
}

// Conditional configuration
export interface ConditionalConfig {
  readonly condition: (formData: Record<string, any>) => boolean;
  readonly action: "show" | "hide" | "disable" | "require";
}

// Multi-step workflow types
export interface StepConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: string[]; // Field IDs for this step
  readonly validation?: StepValidationConfig;
  readonly conditional?: StepConditionalConfig;
  readonly customRenderer?: StepRenderer;
  readonly allowSkip?: boolean;
  readonly requiredToComplete?: boolean;
}

export interface StepValidationConfig {
  readonly validator?: (
    stepData: Record<string, any>,
    allFormData: Record<string, any>
  ) => ValidationResult | Promise<ValidationResult>;
  readonly validateOnStepChange?: boolean;
  readonly blockNextIfInvalid?: boolean;
}

export interface StepConditionalConfig {
  readonly condition: (formData: Record<string, any>) => boolean;
  readonly action: "show" | "hide" | "skip";
}

export interface StepRenderer {
  (props: StepRenderProps): React.ReactElement;
}

export interface StepRenderProps {
  step: StepConfig;
  fields: FormFieldConfig[];
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
}

// Workflow configuration
export interface WorkflowConfig {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: StepConfig[];
  readonly navigation?: NavigationConfig;
  readonly persistence?: PersistenceConfig;
  readonly completion?: CompletionConfig;
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

export interface FormConfiguration {
  readonly id: string;
  readonly schema?: any; // Can be Zod, Yup, or custom schema
  readonly config: StreamlineConfig; // Reference to StreamlineConfig
  readonly rows: FormFieldRow[];
  readonly allFields: FormFieldConfig[]; // Liste plate pour compatibilité
}
