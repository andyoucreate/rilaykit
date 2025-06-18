import type {
  FormConfiguration,
  StreamlineConfig,
  ValidationResult,
} from '@streamline/core';
import React from 'react';
import { FormProvider, FormProviderProps } from './FormProvider';
import { FormRenderer, FormRendererProps } from './FormRenderer';

export interface FormProps extends 
  Omit<FormProviderProps, 'children'>,
  Omit<FormRendererProps, 'onSubmit' | 'onReset'> {
  
  // Provider-specific props (re-exposed for clarity)
  configuration: StreamlineConfig;
  formConfig: FormConfiguration;
  initialData?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onValidate?: (data: Record<string, any>) => ValidationResult | Promise<ValidationResult>;
  
  // Form-level event handlers
  onFormSubmit?: (event: React.FormEvent, data: Record<string, any>) => void;
  onFormReset?: (event: React.FormEvent) => void;
  
  // Additional form options
  autoComplete?: 'on' | 'off';
  id?: string;
  name?: string;
  encType?: string;
  method?: 'get' | 'post';
  target?: string;
  noValidate?: boolean;
}

/**
 * Complete Form component that combines FormProvider and FormRenderer
 * This is the main component users should use for creating forms
 */
export const Form: React.FC<FormProps> = ({
  // Provider props
  configuration,
  formConfig,
  initialData,
  onSubmit,
  onValidate,
  validateOnChange,
  validateOnBlur,
  debounceMs,
  
  // Renderer props
  className,
  showSubmitButton,
  submitButtonText,
  showResetButton,
  resetButtonText,
  customActions,
  renderField,
  renderRow,
  
  // Form-specific props
  onFormSubmit,
  onFormReset,
  autoComplete = 'on',
  id,
  name,
  encType,
  method,
  target,
  noValidate = true,
  
  ...restProps
}) => {
  
  // Handle form submission with additional form event
  const handleSubmit = (event: React.FormEvent) => {
    if (onFormSubmit) {
      // Get form data from provider context - this will be handled by FormRenderer
      onFormSubmit(event, {});
    }
  };

  // Handle form reset
  const handleReset = (event: React.FormEvent) => {
    if (onFormReset) {
      onFormReset(event);
    }
  };

  return (
    <FormProvider
      configuration={configuration}
      formConfig={formConfig}
      initialData={initialData}
      onSubmit={onSubmit}
      onValidate={onValidate}
      validateOnChange={validateOnChange}
      validateOnBlur={validateOnBlur}
      debounceMs={debounceMs}
    >
      <FormRenderer
        className={className}
        showSubmitButton={showSubmitButton}
        submitButtonText={submitButtonText}
        showResetButton={showResetButton}
        resetButtonText={resetButtonText}
        customActions={customActions}
        renderField={renderField}
        renderRow={renderRow}
        onSubmit={handleSubmit}
        onReset={handleReset}
        {...restProps}
      />
    </FormProvider>
  );
};

Form.displayName = 'Form';

// Export hook for accessing form context
export { useFormContext } from './FormProvider';

// Export types for TypeScript users
export type { FormContextValue, FormState } from './FormProvider';
export type { FormRendererProps, FormRowProps } from './FormRenderer';

