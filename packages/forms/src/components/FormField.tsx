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
  // biome-ignore lint/correctness/useExhaustiveDependencies: We need to memoize the field conditions to avoid recalculation on every render
  const fieldConditions = useMemo(
    () => ({
      isVisible: forceVisible || conditionsHelpers.isFieldVisible(fieldId),
      isFieldDisabled: disabled || conditionsHelpers.isFieldDisabled(fieldId),
      isFieldRequired: conditionsHelpers.isFieldRequired(fieldId),
      isFieldReadonly: conditionsHelpers.isFieldReadonly(fieldId),
    }),
    [forceVisible, fieldId, disabled, conditionsHelpers, formState.values]
  );

  // Stable change handler with optimized dependencies
  // MUST be called before early return to follow React Hooks rules
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
  // MUST be called before early return to follow React Hooks rules
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
  // MUST be called before early return to follow React Hooks rules
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
  // MUST be called before early return to follow React Hooks rules
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

  // Hide field if not visible - early return AFTER all hooks
  if (!fieldConditions.isVisible) {
    return null;
  }

  // Render component directly - don't use useMemo to allow hooks in renderers
  const renderedComponent = componentConfig.renderer(renderProps as ComponentRenderProps<never>);

  // Render field wrapper - don't use useMemo to allow hooks in renderers
  const fieldRenderer = formConfig.renderConfig?.fieldRenderer;
  const shouldUseFieldRenderer = componentConfig.useFieldRenderer !== false;

  const content =
    fieldRenderer && shouldUseFieldRenderer
      ? fieldRenderer({
          children: renderedComponent,
          id: fieldId,
          ...mergedProps,
          error: fieldState.errors,
          isValidating,
          touched: fieldState.isTouched,
        })
      : renderedComponent;

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
