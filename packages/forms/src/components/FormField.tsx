import type { ComponentEntry, ComponentRenderContext, FormFieldConfig } from '@rilaykit/core';
import { NotFoundError } from '@rilaykit/core';
import React, { useCallback, useMemo } from 'react';
import {
  useFieldActions,
  useFieldConditions,
  useFieldProps,
  useFieldState,
  useFieldValue,
} from '../stores';
import { parseCompositeKey } from '../utils/repeatable-data';
import { useFormConfigContext } from './FormProvider';

export interface FormFieldProps {
  id: string;
  /** Pre-resolved field config (used by FormListItem to skip allFields lookup) */
  config?: FormFieldConfig;
  disabled?: boolean;
  overrides?: Record<string, unknown>;
  className?: string;
  forceVisible?: boolean;
}

export const FormField = React.memo(function FormField({
  id: fieldId,
  config: fieldConfigProp,
  disabled = false,
  overrides = {},
  className,
  forceVisible = false,
}: FormFieldProps) {
  // Get form config (stable reference)
  const { formConfig, validateField, conditionsHelpers } = useFormConfigContext();

  // Granular selectors - only re-render when THIS field changes
  const value = useFieldValue(fieldId);
  const fieldState = useFieldState(fieldId);
  const conditions = useFieldConditions(fieldId);
  const dynamicProps = useFieldProps(fieldId);
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
    throw new NotFoundError(`Field "${fieldId}" not found`, { key: fieldId });
  }

  // Get catalog entry - early throw if not found or renderless.
  // componentId is runtime-dynamic, so the per-component props typing is erased here.
  const componentEntry = formConfig.config.getComponent(fieldConfig.componentId) as
    | ComponentEntry<Record<string, unknown>>
    | undefined;
  if (!componentEntry?.renderer) {
    throw new NotFoundError(`Component "${fieldConfig.componentId}" not found in catalog`, {
      key: `component:${fieldConfig.componentId}`,
    });
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
  // Precedence: defaultProps < fieldConfig.props < dynamicProps (effects) < overrides < conditions
  const mergedProps = useMemo(
    () => ({
      ...(componentEntry.defaultProps ?? {}),
      ...fieldConfig.props,
      ...dynamicProps,
      ...overrides,
      disabled: effectiveConditions.isFieldDisabled,
      required: effectiveConditions.isFieldRequired,
      readOnly: effectiveConditions.isFieldReadonly,
    }),
    [
      componentEntry.defaultProps,
      fieldConfig.props,
      dynamicProps,
      overrides,
      effectiveConditions.isFieldDisabled,
      effectiveConditions.isFieldRequired,
      effectiveConditions.isFieldReadonly,
    ]
  );

  // Memoize the render context passed to the catalog renderer
  const context: ComponentRenderContext<Record<string, unknown>> = useMemo(
    () => ({
      id: fieldId,
      props: mergedProps,
      field: {
        value,
        onChange: handleChange,
        onBlur: handleBlur,
        error: fieldState.errors,
        disabled: effectiveConditions.isFieldDisabled,
        isValidating,
        touched: fieldState.touched,
      },
      conditions: {
        visible: effectiveConditions.isVisible,
        disabled: effectiveConditions.isFieldDisabled,
        required: effectiveConditions.isFieldRequired,
        readonly: effectiveConditions.isFieldReadonly,
      },
      meta: componentEntry.meta,
    }),
    [
      fieldId,
      mergedProps,
      value,
      handleChange,
      handleBlur,
      fieldState.errors,
      fieldState.touched,
      isValidating,
      effectiveConditions,
      componentEntry.meta,
    ]
  );

  // Hide field if not visible
  if (!effectiveConditions.isVisible) {
    return null;
  }

  return (
    <div
      className={className}
      data-field-id={fieldId}
      data-field-type={componentEntry.type}
      data-field-visible={effectiveConditions.isVisible}
      data-field-disabled={effectiveConditions.isFieldDisabled}
      data-field-required={effectiveConditions.isFieldRequired}
      data-field-readonly={effectiveConditions.isFieldReadonly}
    >
      {componentEntry.renderer(context)}
    </div>
  );
});

export default FormField;
