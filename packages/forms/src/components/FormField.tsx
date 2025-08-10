import type { ComponentRenderProps } from '@rilaykit/core';
import React, { useCallback, useMemo } from 'react';
import { useFormContext } from './FormProvider';

export interface FormFieldProps {
  fieldId: string;
  disabled?: boolean;
  customProps?: Record<string, any>;
  className?: string;
  forceVisible?: boolean;
}

export const FormField = React.memo(function FormField({
  fieldId,
  disabled = false,
  customProps = {},
  className,
  forceVisible = false,
}: FormFieldProps) {
  const { formState, formConfig, setValue, setFieldTouched, validateField, conditionsHelpers } =
    useFormContext();

  // Get field config - early return if not found
  const fieldConfig = formConfig.allFields.find((field) => field.id === fieldId);
  if (!fieldConfig) {
    throw new Error(`Field with ID "${fieldId}" not found`);
  }

  // Get component config - early return if not found
  const componentConfig = formConfig.config.getComponent(fieldConfig.componentId);
  if (!componentConfig) {
    throw new Error(`Component with ID "${fieldConfig.componentId}" not found`);
  }

  // Memoize field state to avoid recalculation
  const fieldState = useMemo(
    () => ({
      value: formState.values[fieldId],
      errors: formState.errors[fieldId] || [],
      validationState: formState.validationState[fieldId] || 'idle',
      isTouched: formState.touched[fieldId] || false,
    }),
    [
      formState.values[fieldId],
      formState.errors[fieldId],
      formState.validationState[fieldId],
      formState.touched[fieldId],
    ]
  );

  const isValidating = fieldState.validationState === 'validating';

  // Memoize condition checks to avoid recalculation
  const fieldConditions = useMemo(
    () => ({
      isVisible: forceVisible || conditionsHelpers.isFieldVisible(fieldId),
      isFieldDisabled: disabled || conditionsHelpers.isFieldDisabled(fieldId),
      isFieldRequired: conditionsHelpers.isFieldRequired(fieldId),
      isFieldReadonly: conditionsHelpers.isFieldReadonly(fieldId),
    }),
    [
      forceVisible,
      conditionsHelpers.isFieldVisible(fieldId),
      disabled,
      conditionsHelpers.isFieldDisabled(fieldId),
      conditionsHelpers.isFieldRequired(fieldId),
      conditionsHelpers.isFieldReadonly(fieldId),
    ]
  );

  // Hide field if not visible
  if (!fieldConditions.isVisible) {
    return null;
  }

  // Stable change handler with optimized dependencies
  const handleChange = useCallback(
    async (newValue: any) => {
      // Update value
      setValue(fieldId, newValue);

      // Validate immediately if configured OR if field is already touched
      if (fieldConfig.validation?.validateOnChange || fieldState.isTouched) {
        await validateField(fieldId, newValue);
      }
    },
    [
      fieldId,
      setValue,
      validateField,
      fieldConfig.validation?.validateOnChange,
      fieldState.isTouched,
    ]
  );

  // Stable blur handler with optimized dependencies
  const handleBlur = useCallback(async () => {
    // Marquer comme touched au premier blur
    if (!fieldState.isTouched) {
      setFieldTouched(fieldId);
    }

    // Valider sur blur si configuré (par défaut si pas de validateOnChange)
    if (fieldConfig.validation?.validateOnBlur !== false) {
      await validateField(fieldId);
    }
  }, [
    fieldId,
    fieldState.isTouched,
    setFieldTouched,
    validateField,
    fieldConfig.validation?.validateOnBlur,
  ]);

  // Memoize merged props to avoid recalculation on every render
  const mergedProps = useMemo(
    () => ({
      ...(componentConfig.defaultProps ?? {}),
      ...fieldConfig.props,
      ...customProps,
      disabled: fieldConditions.isFieldDisabled,
      required: fieldConditions.isFieldRequired,
      readOnly: fieldConditions.isFieldReadonly,
    }),
    [
      componentConfig.defaultProps,
      fieldConfig.props,
      customProps,
      fieldConditions.isFieldDisabled,
      fieldConditions.isFieldRequired,
      fieldConditions.isFieldReadonly,
    ]
  );

  // Memoize render props to avoid recreating object
  const renderProps: ComponentRenderProps = useMemo(
    () => ({
      id: fieldId,
      props: mergedProps,
      value: fieldState.value,
      onChange: handleChange,
      onBlur: handleBlur,
      disabled: fieldConditions.isFieldDisabled,
      error: fieldState.errors,
      isValidating,
      touched: fieldState.isTouched,
    }),
    [
      fieldId,
      mergedProps,
      fieldState.value,
      handleChange,
      handleBlur,
      fieldConditions.isFieldDisabled,
      fieldState.errors,
      isValidating,
      fieldState.isTouched,
    ]
  );

  // Memoize component rendering to avoid unnecessary recalculation
  const renderedComponent = useMemo(
    () => componentConfig.renderer(renderProps as ComponentRenderProps<never>),
    [componentConfig.renderer, renderProps]
  );

  // Memoize field renderer logic
  const content = useMemo(() => {
    const fieldRenderer = formConfig.renderConfig?.fieldRenderer;
    const shouldUseFieldRenderer = componentConfig.useFieldRenderer !== false;

    return fieldRenderer && shouldUseFieldRenderer
      ? fieldRenderer({
          children: renderedComponent,
          id: fieldId,
          ...mergedProps,
          error: fieldState.errors,
          isValidating,
          touched: fieldState.isTouched,
        })
      : renderedComponent;
  }, [
    formConfig.renderConfig?.fieldRenderer,
    componentConfig.useFieldRenderer,
    renderedComponent,
    fieldId,
    mergedProps,
    fieldState.errors,
    isValidating,
    fieldState.isTouched,
  ]);

  return (
    <div
      className={className}
      data-field-id={fieldId}
      data-field-type={componentConfig.type}
      data-field-visible={fieldConditions.isVisible}
      data-field-disabled={fieldConditions.isFieldDisabled}
      data-field-required={fieldConditions.isFieldRequired}
      data-field-readonly={fieldConditions.isFieldReadonly}
    >
      {content}
    </div>
  );
});

export default FormField;
