import type { ValidationError, ValidationResult } from './index';

// =================================================================
// VALIDATION STATE
// =================================================================

export type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

// =================================================================
// FIELD CONTEXT - Unified field state and actions
// =================================================================

/**
 * Field state without actions - used for selectors
 */
export interface FieldState {
  readonly value: unknown;
  readonly errors: ValidationError[];
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
 * Field actions - stable references for setValue, validate, etc.
 */
export interface FieldActions {
  readonly setValue: (value: unknown) => void;
  readonly setTouched: () => void;
  readonly validate: () => Promise<ValidationResult>;
  readonly clearErrors: () => void;
}

/**
 * Complete field context - combines state, conditions and actions
 * Used by component renderers for full field access
 */
export interface FieldContext extends FieldState, FieldConditions {
  readonly id: string;
  readonly componentId: string;
  readonly defaultValue?: unknown;
  readonly actions: FieldActions;
}

// =================================================================
// FORM CONTEXT - Unified form state and actions
// =================================================================

/**
 * Form state without actions - used for selectors
 */
export interface FormState {
  readonly values: Record<string, unknown>;
  readonly errors: Record<string, ValidationError[]>;
  readonly validationStates: Record<string, ValidationState>;
  readonly touched: Record<string, boolean>;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  readonly isValid: boolean;
}

/**
 * Form actions - stable references
 */
export interface FormActions {
  readonly setValue: (fieldId: string, value: unknown) => void;
  readonly setTouched: (fieldId: string) => void;
  readonly setErrors: (fieldId: string, errors: ValidationError[]) => void;
  readonly setValidationState: (fieldId: string, state: ValidationState) => void;
  readonly setSubmitting: (isSubmitting: boolean) => void;
  readonly submit: () => Promise<boolean>;
  readonly reset: (values?: Record<string, unknown>) => void;
  readonly validate: () => Promise<ValidationResult>;
  readonly validateField: (fieldId: string, value?: unknown) => Promise<ValidationResult>;
}

/**
 * Complete form context - combines state and actions
 */
export interface FormContextValue extends FormState {
  readonly formId: string;
  readonly actions: FormActions;
  readonly getFieldState: (fieldId: string) => FieldState;
  readonly getFieldConditions: (fieldId: string) => FieldConditions;
}

// =================================================================
// COMPONENT RENDER PROPS - Unified props for renderers
// =================================================================

/**
 * Props passed to component renderers (v2)
 * Replaces the old ComponentRenderProps with spread [key: string]: any
 */
export interface ComponentRenderPropsV2<TProps = unknown> {
  /** Field identifier */
  readonly id: string;

  /** Component-specific props (label, placeholder, options, etc.) */
  readonly props: TProps;

  /** Field state (value, errors, touched, etc.) */
  readonly field: FieldState;

  /** Field conditions (visible, disabled, required, readonly) */
  readonly conditions: FieldConditions;

  /** Stable action references */
  readonly actions: FieldActions;
}

/**
 * Props passed to field wrapper renderers (v2)
 */
export interface FieldRendererPropsV2 {
  /** Rendered component content */
  readonly children: React.ReactNode;

  /** Field identifier */
  readonly id: string;

  /** Field state */
  readonly field: FieldState;

  /** Field conditions */
  readonly conditions: FieldConditions;

  /** Component props (for label, placeholder, helpText, etc.) */
  readonly componentProps: Record<string, unknown>;
}

/**
 * Props passed to form submit button renderer (v2)
 */
export interface FormSubmitButtonRendererPropsV2 {
  /** Whether form is currently submitting */
  readonly isSubmitting: boolean;

  /** Whether form is valid (no errors) */
  readonly isValid: boolean;

  /** Whether form has been modified */
  readonly isDirty: boolean;

  /** Submit handler */
  readonly onSubmit: () => void;

  /** Reset handler */
  readonly onReset: () => void;

  /** Form data access (for advanced use cases) */
  readonly form: {
    readonly values: Record<string, unknown>;
    readonly errors: Record<string, ValidationError[]>;
  };

  /** Optional className */
  readonly className?: string;

  /** Optional children */
  readonly children?: React.ReactNode;
}

// =================================================================
// WORKFLOW CONTEXT - Unified workflow state
// =================================================================

/**
 * Step state for workflow
 */
export interface WorkflowStepState {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isVisible: boolean;
  readonly isSkippable: boolean;
}

/**
 * Navigation state for workflow
 */
export interface WorkflowNavigationState {
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly canSkip: boolean;
  readonly isTransitioning: boolean;
}

/**
 * Progress state for workflow
 */
export interface WorkflowProgressState {
  readonly totalSteps: number;
  readonly visibleSteps: number;
  readonly currentStepIndex: number;
  readonly visitedSteps: ReadonlySet<string>;
  readonly passedSteps: ReadonlySet<string>;
}

/**
 * Complete workflow step context
 */
export interface WorkflowStepContext {
  readonly step: WorkflowStepState;
  readonly navigation: WorkflowNavigationState;
  readonly progress: WorkflowProgressState;
  readonly stepData: Record<string, unknown>;
  readonly allData: Record<string, unknown>;
}

/**
 * Props passed to workflow button renderers (v2)
 */
export interface WorkflowButtonRendererPropsV2 {
  /** Navigation state */
  readonly navigation: WorkflowNavigationState;

  /** Progress state */
  readonly progress: WorkflowProgressState;

  /** Current step state */
  readonly step: WorkflowStepState;

  /** Whether workflow is submitting */
  readonly isSubmitting: boolean;

  /** Step data */
  readonly stepData: Record<string, unknown>;

  /** All workflow data */
  readonly allData: Record<string, unknown>;

  /** Action handler (next/previous/skip/submit) */
  readonly onAction: () => void;

  /** Optional className */
  readonly className?: string;

  /** Optional children */
  readonly children?: React.ReactNode;
}

