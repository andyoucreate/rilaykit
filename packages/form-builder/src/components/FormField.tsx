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
  const { formState, formConfig, setValue, setFieldTouched, validateField } = useFormContext();

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
    () => formConfig.config.getComponent(fieldConfig.componentId),
    [formConfig.config, fieldConfig.componentId]
  );

  if (!componentConfig) {
    throw new Error(`Component with ID "${fieldConfig.componentId}" not found`);
  }

  // Get field state from form state
  const fieldState = useMemo(
    () => ({
      value: formState.values[fieldId],
      errors: formState.errors[fieldId] || [],
      validationState: formState.validationState[fieldId] || 'idle',
      isValidating: formState.validationState[fieldId] === 'validating',
      isTouched: formState.touched[fieldId] || false,
    }),
    [formState.values, formState.errors, formState.validationState, formState.touched, fieldId]
  );

  // Handle field change with validation if configured
  const handleChange = useCallback(
    async (value: any) => {
      setValue(fieldConfig.id, value);

      // Validate on change if configured OR if field is touched (default behavior)
      if (fieldConfig.validation?.validateOnChange || fieldState.isTouched) {
        await validateField(fieldConfig.id, value);
      }
    },
    [
      fieldConfig.id,
      fieldConfig.validation?.validateOnChange,
      fieldState.isTouched,
      setValue,
      validateField,
    ]
  );

  // Handle field blur with validation if configured
  const handleBlur = useCallback(async () => {
    // Always mark field as touched on blur
    if (!fieldState.isTouched) {
      setFieldTouched(fieldConfig.id, true);
    }

    // Validate on blur if configured
    if (fieldConfig.validation?.validateOnBlur || !fieldConfig.validation?.validateOnChange) {
      await validateField(fieldConfig.id);
    }
  }, [
    fieldConfig.id,
    fieldConfig.validation?.validateOnBlur,
    fieldConfig.validation?.validateOnChange,
    fieldState.isTouched,
    setFieldTouched,
    validateField,
  ]);

  // Memoize merged props to avoid recreating on every render
  const mergedProps = useMemo(
    () => ({
      ...(componentConfig.defaultProps ?? {}),
      ...fieldConfig.props,
      ...customProps,
    }),
    [componentConfig.defaultProps, fieldConfig.props, customProps]
  );

  // Memoize render props to avoid recreating complex object
  const renderProps: ComponentRenderProps = useMemo(
    () => ({
      id: fieldConfig.id,
      props: mergedProps,
      value: fieldState.value,
      onChange: handleChange,
      onBlur: handleBlur,
      disabled: disabled,
      error: fieldState.errors,
      isValidating: fieldState.isValidating,
      touched: fieldState.isTouched,
    }),
    [
      fieldConfig.id,
      mergedProps,
      fieldState.value,
      fieldState.errors,
      fieldState.isValidating,
      fieldState.isTouched,
      handleChange,
      handleBlur,
      disabled,
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
          disabled: disabled,
          ...mergedProps,
          ...fieldState,
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
