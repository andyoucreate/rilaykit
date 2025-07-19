import type { ComponentRenderProps } from '@rilaykit/core';
import React, { useCallback } from 'react';
import { useFormContext } from './FormProvider';

export interface FormFieldProps {
  fieldId: string;
  disabled?: boolean;
  customProps?: Record<string, any>;
  className?: string;
  /** Force field to be visible even if conditions say otherwise (for debugging) */
  forceVisible?: boolean;
}

export function FormField({
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

  // Simple field state access
  const value = formState.values[fieldId];
  const errors = formState.errors[fieldId] || [];
  const validationState = formState.validationState[fieldId] || 'idle';
  const isTouched = formState.touched[fieldId] || false;
  const isValidating = validationState === 'validating';

  // Simple condition checks
  const isVisible = forceVisible || conditionsHelpers.isFieldVisible(fieldId);
  const isFieldDisabled = disabled || conditionsHelpers.isFieldDisabled(fieldId);
  const isFieldRequired = conditionsHelpers.isFieldRequired(fieldId);
  const isFieldReadonly = conditionsHelpers.isFieldReadonly(fieldId);

  // Hide field if not visible
  if (!isVisible) {
    return null;
  }

  // Simple change handler
  const handleChange = useCallback(
    async (newValue: any) => {
      // Update value
      setValue(fieldId, newValue);

      // Validate immediately si configuré OU si le champ est déjà touched
      if (fieldConfig.validation?.validateOnChange || isTouched) {
        await validateField(fieldId, newValue);
      }
    },
    [fieldId, setValue, validateField, fieldConfig.validation?.validateOnChange, isTouched]
  );

  // Simple blur handler
  const handleBlur = useCallback(async () => {
    // Marquer comme touched au premier blur
    if (!isTouched) {
      setFieldTouched(fieldId);
    }

    // Valider sur blur si configuré (par défaut si pas de validateOnChange)
    if (fieldConfig.validation?.validateOnBlur !== false) {
      await validateField(fieldId);
    }
  }, [fieldId, isTouched, setFieldTouched, validateField, fieldConfig.validation?.validateOnBlur]);

  // Merge props once
  const mergedProps = {
    ...(componentConfig.defaultProps ?? {}),
    ...fieldConfig.props,
    ...customProps,
    disabled: isFieldDisabled,
    required: isFieldRequired,
    readOnly: isFieldReadonly,
  };

  // Render props
  const renderProps: ComponentRenderProps = {
    id: fieldId,
    props: mergedProps,
    value,
    onChange: handleChange,
    onBlur: handleBlur,
    disabled: isFieldDisabled,
    error: errors,
    isValidating,
    touched: isTouched,
  };

  // Render component
  const fieldRenderer = formConfig.renderConfig?.fieldRenderer;
  const renderedComponent = componentConfig.renderer(renderProps as ComponentRenderProps<never>);

  // Use field renderer if configured and component allows it
  const shouldUseFieldRenderer = componentConfig.useFieldRenderer !== false;
  const content =
    fieldRenderer && shouldUseFieldRenderer
      ? fieldRenderer({
          children: renderedComponent,
          id: fieldId,
          ...mergedProps,
          error: errors,
          isValidating,
          touched: isTouched,
        })
      : renderedComponent;

  return (
    <div
      className={className}
      data-field-id={fieldId}
      data-field-type={componentConfig.type}
      data-field-visible={isVisible}
      data-field-disabled={isFieldDisabled}
      data-field-required={isFieldRequired}
      data-field-readonly={isFieldReadonly}
    >
      {content}
    </div>
  );
}

export default React.memo(FormField);
