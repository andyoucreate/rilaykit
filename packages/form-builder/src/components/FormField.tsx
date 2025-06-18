import type {
  ComponentRenderer,
  ComponentRenderProps,
  FormFieldConfig,
  StreamlineConfig,
  ValidationError,
} from '@streamline/core';
import React from 'react';

export interface FormFieldProps {
  id: string;
  formData?: Record<string, any>;
  errors?: Record<string, ValidationError[]>;
  touched?: Set<string>;
  disabled?: boolean;
  onChange?: (fieldId: string, value: any) => void;
  onBlur?: (fieldId: string) => void;
  configuration?: StreamlineConfig;
  fieldConfig?: FormFieldConfig;
  // Override props
  customRenderer?: ComponentRenderer;
  customProps?: Record<string, any>;
  // Multi-step context props
  stepContext?: {
    stepId: string;
    stepIndex: number;
    totalSteps: number;
  };
  // Validation state
  isValidating?: boolean;
}

/**
 * FormField component for rendering individual form fields
 * Provides granular control over field rendering and validation
 */
export const FormField: React.FC<FormFieldProps> = ({
  id,
  formData = {},
  errors = {},
  touched = new Set(),
  disabled = false,
  onChange,
  onBlur,
  configuration,
  fieldConfig,
  customRenderer,
  customProps = {},
  stepContext,
  isValidating = false,
}) => {
  // Use provided fieldConfig or try to find a component by ID/subType
  let resolvedFieldConfig = fieldConfig;
  let componentConfig: any = null;
  
  if (!resolvedFieldConfig && configuration) {
    // Try to find component by ID first, then by subType
    componentConfig = configuration.getComponent(id) || 
      configuration.getAllComponents().find((comp: any) => comp.subType === id);
    
    if (componentConfig) {
      // Create a basic field config from component config
      resolvedFieldConfig = {
        id,
        componentId: componentConfig.id,
        props: componentConfig.defaultProps || {},
      };
    }
  } else if (resolvedFieldConfig && configuration) {
    // Get the component config for the field
    componentConfig = configuration.getComponent(resolvedFieldConfig.componentId);
  }
  
  if (!resolvedFieldConfig && !customRenderer) {
    console.warn(`FormField: No configuration found for field "${id}"`);
    return null;
  }
  
  // Use custom renderer or component renderer
  const renderer = customRenderer || componentConfig?.renderer;
  
  if (!renderer) {
    console.warn(`FormField: No renderer found for field "${id}"`);
    return null;
  }
  
  // Evaluate conditional logic from field config
  const shouldRender = resolvedFieldConfig?.conditional 
    ? resolvedFieldConfig.conditional.condition(formData)
    : true;
  
  if (!shouldRender && resolvedFieldConfig?.conditional?.action === 'hide') {
    return null;
  }
  
  // Determine if field should be disabled by conditional logic
  const conditionallyDisabled = resolvedFieldConfig?.conditional?.action === 'disable' 
    ? !resolvedFieldConfig.conditional.condition(formData)
    : false;
  
  // Prepare props for renderer
  const componentProps = {
    ...componentConfig?.defaultProps,
    ...resolvedFieldConfig?.props,
    ...customProps,
  };
  
  const renderProps: ComponentRenderProps = {
    id,
    props: componentProps,
    value: formData[id],
    onChange: onChange ? (value: any) => onChange(id, value) : undefined,
    onBlur: onBlur ? () => onBlur(id) : undefined,
    error: errors[id] || [],
    touched: touched.has(id),
    disabled: disabled || conditionallyDisabled,
    isValidating,
    stepContext,
  };
  
  return (
    <div 
      className="w-full mb-4" 
      data-field-id={id}
      data-field-type={componentConfig?.type}
      data-field-subtype={componentConfig?.subType}
    >
      {renderer(renderProps)}
    </div>
  );
};

FormField.displayName = 'FormField'; 