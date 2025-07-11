import type { ComponentRenderProps } from '@rilaykit/core';
import React, { useCallback, useMemo } from 'react';
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

  // Memoize field config lookup to avoid repeated searches
  const fieldConfig = useMemo(
    () => formConfig.allFields.find((field) => field.id === fieldId),
    [formConfig.allFields, fieldId]
  );

  if (!fieldConfig) {
    throw new Error(`Field with ID "${fieldId}" not found`);
  }

  // Memoize component config lookup
  const componentConfig = useMemo(
    () => formConfig.config.getComponent(fieldConfig.componentId as never),
    [formConfig.config, fieldConfig.componentId]
  );

  if (!componentConfig) {
    throw new Error(`Component with ID "${fieldConfig.componentId}" not found`);
  }

  // Memoize field state values that are referenced multiple times
  const fieldState = useMemo(
    () => ({
      value: formState.values[fieldConfig.id],
      errors: formState.errors[fieldConfig.id] || [],
      touched: formState.touched.has(fieldConfig.id),
      validating: formState.isValidating.has(fieldConfig.id),
    }),
    [formState.values, formState.errors, formState.touched, formState.isValidating, fieldConfig.id]
  );

  // Handle field value change - optimized dependencies
  const handleChange = useCallback(
    (value: any) => {
      const hadErrors = fieldState.errors.length > 0;
      setValue(fieldConfig.id, value);

      // Auto-validate on change if:
      // - Explicitly configured with validateOnChange
      // - Field had errors (immediate feedback on correction)
      // - Field is touched (user has interacted with it before)
      if (
        fieldConfig.validation?.validateOnChange ||
        (hadErrors && fieldConfig.validation?.validator) ||
        (fieldState.touched && fieldConfig.validation?.validator)
      ) {
        validateField(fieldConfig.id, value);
      }
    },
    [
      fieldConfig.id,
      fieldConfig.validation,
      setValue,
      validateField,
      fieldState.errors.length,
      fieldState.touched,
    ]
  );

  // Handle field blur - stable callback
  const handleBlur = useCallback(() => {
    markFieldTouched(fieldConfig.id);

    // Auto-validate on blur if configured OR if field has validation
    if (fieldConfig.validation?.validateOnBlur || fieldConfig.validation?.validator) {
      validateField(fieldConfig.id);
    }
  }, [fieldConfig.id, fieldConfig.validation, markFieldTouched, validateField]);

  // Check conditional logic - memoized expensive calculation
  const shouldShow = useMemo(() => {
    if (!fieldConfig.conditional) return true;

    try {
      return fieldConfig.conditional.condition(formState.values);
    } catch (error) {
      console.warn(`Conditional evaluation failed for field "${fieldConfig.id}":`, error);
      return true;
    }
  }, [fieldConfig.conditional, formState.values, fieldConfig.id]);

  // Apply conditional actions - memoized calculation
  const conditionalProps = useMemo(() => {
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

  // Memoize merged props to avoid recreating on every render
  const mergedProps = useMemo(
    () => ({
      ...(componentConfig.defaultProps ?? {}),
      ...fieldConfig.props,
      ...customProps,
      ...conditionalProps,
    }),
    [componentConfig.defaultProps, fieldConfig.props, customProps, conditionalProps]
  );

  // Memoize render props to avoid recreating complex object
  const renderProps: ComponentRenderProps = useMemo(
    () => ({
      id: fieldConfig.id,
      props: mergedProps,
      value: fieldState.value,
      onChange: handleChange,
      onBlur: handleBlur,
      error: fieldState.errors,
      touched: fieldState.touched,
      disabled: disabled || conditionalProps.disabled,
      isValidating: fieldState.validating,
    }),
    [
      fieldConfig.id,
      mergedProps,
      fieldState.value,
      handleChange,
      handleBlur,
      fieldState.errors,
      fieldState.touched,
      disabled,
      conditionalProps.disabled,
      fieldState.validating,
    ]
  );

  const fieldRenderer = formConfig.renderConfig?.fieldRenderer;
  const renderedComponent = componentConfig.renderer(renderProps as ComponentRenderProps<never>);

  // Default to true if useFieldRenderer is not defined
  const shouldUseFieldRenderer = componentConfig.useFieldRenderer !== false;

  const content =
    fieldRenderer && shouldUseFieldRenderer
      ? fieldRenderer({
          children: renderedComponent,
          id: fieldConfig.id,
          error: fieldState.errors,
          touched: fieldState.touched,
          disabled: disabled || conditionalProps.disabled,
          isValidating: fieldState.validating,
          ...mergedProps,
        })
      : renderedComponent;

  return (
    <div
      className={className}
      data-field-id={fieldConfig.id}
      data-field-type={componentConfig.type}
    >
      {content}
    </div>
  );
}

export default React.memo(FormField);
