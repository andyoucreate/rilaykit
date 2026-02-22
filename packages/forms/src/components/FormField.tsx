import type { ComponentRenderProps, FormFieldConfig } from '@rilaykit/core';
import React, { useCallback, useMemo } from 'react';
import { useFieldActions, useFieldConditions, useFieldState, useFieldValue } from '../stores';
import { parseCompositeKey } from '../utils/repeatable-data';
import { useFormConfigContext } from './FormProvider';

export interface FormFieldProps {
  fieldId: string;
  /** Pre-resolved field config (used by RepeatableItem to skip allFields lookup) */
  fieldConfig?: FormFieldConfig;
  disabled?: boolean;
  customProps?: Record<string, unknown>;
  className?: string;
  forceVisible?: boolean;
}

export const FormField = React.memo(function FormField({
  fieldId,
  fieldConfig: fieldConfigProp,
  disabled = false,
  customProps = {},
  className,
  forceVisible = false,
}: FormFieldProps) {
  // Get form config (stable reference)
  const { formConfig, validateField, conditionsHelpers } = useFormConfigContext();

  // Granular selectors - only re-render when THIS field changes
  const value = useFieldValue(fieldId);
  const fieldState = useFieldState(fieldId);
  const conditions = useFieldConditions(fieldId);
  const { setValue, setTouched } = useFieldActions(fieldId);

  // Get field config — use prop if provided, otherwise lookup
  const fieldConfig = useMemo(() => {
    if (fieldConfigProp) return fieldConfigProp;

    // Try static fields first
    const staticField = formConfig.allFields.find((field) => field.id === fieldId);
    if (staticField) return staticField;

    // Try composite key lookup for repeatable fields
    const parsed = parseCompositeKey(fieldId);
    if (parsed && formConfig.repeatableFields) {
      const repeatableConfig = formConfig.repeatableFields[parsed.repeatableId];
      if (repeatableConfig) {
        const templateField = repeatableConfig.allFields.find((f) => f.id === parsed.fieldId);
        if (templateField) {
          // Return a copy with the composite ID
          return { ...templateField, id: fieldId };
        }
      }
    }

    return undefined;
  }, [fieldConfigProp, formConfig.allFields, formConfig.repeatableFields, fieldId]);

  if (!fieldConfig) {
    throw new Error(`Field with ID "${fieldId}" not found`);
  }

  // Get component config - early return if not found
  const componentConfig = formConfig.config.getComponent(fieldConfig.componentId);
  if (!componentConfig) {
    throw new Error(`Component with ID "${fieldConfig.componentId}" not found`);
  }

  const isValidating = fieldState.validationState === 'validating';

  // Compute effective conditions
  const effectiveConditions = useMemo(
    () => ({
      isVisible: forceVisible || conditions.visible,
      isFieldDisabled: disabled || conditions.disabled,
      isFieldRequired: conditions.required || conditionsHelpers.isFieldRequired(fieldId),
      isFieldReadonly: conditions.readonly,
    }),
    [forceVisible, disabled, conditions, conditionsHelpers, fieldId]
  );

  // Stable change handler
  const handleChange = useCallback(
    async (newValue: unknown) => {
      setValue(newValue);

      // Validate immediately if configured OR if field is already touched
      if (fieldConfig.validation?.validateOnChange || fieldState.touched) {
        await validateField(fieldId, newValue);
      }
    },
    [fieldId, setValue, validateField, fieldConfig.validation?.validateOnChange, fieldState.touched]
  );

  // Stable blur handler
  const handleBlur = useCallback(async () => {
    if (!fieldState.touched) {
      setTouched();
    }

    if (fieldConfig.validation?.validateOnBlur !== false) {
      await validateField(fieldId);
    }
  }, [
    fieldId,
    fieldState.touched,
    setTouched,
    validateField,
    fieldConfig.validation?.validateOnBlur,
  ]);

  // Memoize merged props
  const mergedProps = useMemo(
    () => ({
      ...(componentConfig.defaultProps ?? {}),
      ...fieldConfig.props,
      ...customProps,
      disabled: effectiveConditions.isFieldDisabled,
      required: effectiveConditions.isFieldRequired,
      readOnly: effectiveConditions.isFieldReadonly,
    }),
    [
      componentConfig.defaultProps,
      fieldConfig.props,
      customProps,
      effectiveConditions.isFieldDisabled,
      effectiveConditions.isFieldRequired,
      effectiveConditions.isFieldReadonly,
    ]
  );

  // Memoize render props
  const renderProps: ComponentRenderProps = useMemo(
    () => ({
      id: fieldId,
      props: mergedProps,
      value,
      onChange: handleChange,
      onBlur: handleBlur,
      disabled: effectiveConditions.isFieldDisabled,
      error: fieldState.errors,
      isValidating,
      touched: fieldState.touched,
    }),
    [
      fieldId,
      mergedProps,
      value,
      handleChange,
      handleBlur,
      effectiveConditions.isFieldDisabled,
      fieldState.errors,
      isValidating,
      fieldState.touched,
    ]
  );

  // Hide field if not visible
  if (!effectiveConditions.isVisible) {
    return null;
  }

  // Render component
  const renderedComponent = componentConfig.renderer(renderProps as ComponentRenderProps<never>);

  // Render field wrapper
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
          touched: fieldState.touched,
        })
      : renderedComponent;

  return (
    <div
      className={className}
      data-field-id={fieldId}
      data-field-type={componentConfig.type}
      data-field-visible={effectiveConditions.isVisible}
      data-field-disabled={effectiveConditions.isFieldDisabled}
      data-field-required={effectiveConditions.isFieldRequired}
      data-field-readonly={effectiveConditions.isFieldReadonly}
    >
      {content}
    </div>
  );
});

export default FormField;
