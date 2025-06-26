import type { ComponentRenderProps } from '@streamline/core';
import clsx from 'clsx';
import React, { useCallback } from 'react';
import { useFormContext } from './FormProvider';

export interface FormFieldProps {
  fieldId: string;
  disabled?: boolean;
  customProps?: Record<string, any>;
  className?: string;
}

export function FormField({
  fieldId,
  disabled = false,
  customProps = {},
  className,
}: FormFieldProps) {
  const { formState, formConfig, setValue, markFieldTouched, validateField } = useFormContext();

  // Get field configuration from context
  const fieldConfig = formConfig.allFields.find((field) => field.id === fieldId);

  if (!fieldConfig) {
    throw new Error(`Field with ID "${fieldId}" not found in form configuration`);
  }

  // Get component configuration
  const componentConfig = formConfig.config.getComponent(fieldConfig.componentId);

  if (!componentConfig) {
    throw new Error(`Component with ID "${fieldConfig.componentId}" not found`);
  }

  const fieldValue = formState.values[fieldConfig.id];
  const fieldErrors = formState.errors[fieldConfig.id] || [];
  const fieldWarnings = formState.warnings[fieldConfig.id] || [];
  const isFieldTouched = formState.touched.has(fieldConfig.id);
  const isFieldValidating = formState.isValidating.has(fieldConfig.id);

  // Handle field value change
  const handleChange = useCallback(
    (value: any) => {
      setValue(fieldConfig.id, value);

      // Auto-validate on change if configured
      if (fieldConfig.validation?.validateOnChange) {
        validateField(fieldConfig.id, value);
      }
    },
    [fieldConfig.id, fieldConfig.validation, setValue, validateField]
  );

  // Handle field blur
  const handleBlur = useCallback(() => {
    markFieldTouched(fieldConfig.id);

    // Auto-validate on blur if configured
    if (fieldConfig.validation?.validateOnBlur) {
      validateField(fieldConfig.id);
    }
  }, [fieldConfig.id, fieldConfig.validation, markFieldTouched, validateField]);

  // Check conditional logic
  const shouldShow = React.useMemo(() => {
    if (!fieldConfig.conditional) return true;

    try {
      return fieldConfig.conditional.condition(formState.values);
    } catch (error) {
      console.warn(`Conditional evaluation failed for field "${fieldConfig.id}":`, error);
      return true;
    }
  }, [fieldConfig.conditional, formState.values, fieldConfig.id]);

  // Apply conditional actions
  const conditionalProps = React.useMemo(() => {
    if (!fieldConfig.conditional || !shouldShow) return {};

    const action = fieldConfig.conditional.action;

    switch (action) {
      case 'disable':
        return { disabled: true };
      case 'require':
        return { required: true };
      default:
        return {};
    }
  }, [fieldConfig.conditional, shouldShow]);

  // Don't render if hidden by conditional
  if (!shouldShow && fieldConfig.conditional?.action === 'hide') {
    return null;
  }

  // Prepare props for the component renderer
  const mergedProps = {
    ...componentConfig.defaultProps,
    ...fieldConfig.props,
    ...customProps,
    ...conditionalProps,
  };

  const renderProps: ComponentRenderProps = {
    id: fieldConfig.id,
    props: mergedProps,
    value: fieldValue,
    onChange: handleChange,
    onBlur: handleBlur,
    error: fieldErrors,
    warnings: fieldWarnings,
    touched: isFieldTouched,
    disabled: disabled || conditionalProps.disabled,
    isValidating: isFieldValidating,
  };

  return (
    <div
      className={clsx('streamline-form-field', className)}
      data-field-id={fieldConfig.id}
      data-field-type={componentConfig.subType}
    >
      {componentConfig.renderer(renderProps)}
    </div>
  );
}

export default FormField;
