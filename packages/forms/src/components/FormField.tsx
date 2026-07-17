import type { ComponentEntry, ComponentRenderContext, FormFieldConfig } from '@rilaykit/core';
import { NotFoundError, catalogEntryKey, getOwn } from '@rilaykit/core';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useFieldActions,
  useFieldConditions,
  useFieldProps,
  useFieldState,
  useFieldValue,
} from '../stores';
import { parseCompositeKey } from '../utils/repeatable-data';
import { shouldValidateOnEvent } from '../utils/validation-timing';
import { useForm } from './FormProvider';

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
  const { formConfig, validateField, conditionsHelpers, formInstanceKey } = useForm();

  // Two-phase validation timing (RHF model), resolved once from the form config.
  // Default `mode` is `onTouched` (validate on first blur, then live) — RilayKit's
  // established default; RHF's own default is `onSubmit`, but we preserve behavior.
  const mode = formConfig.validation?.mode ?? 'onTouched';
  const reValidateMode = formConfig.validation?.reValidateMode ?? 'onChange';

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
      const repeatableConfig = getOwn(formConfig.repeatableFields, parsed.repeatableId);
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
      key: catalogEntryKey('component', fieldConfig.componentId),
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

  // Per-field debounce timer for change-triggered validation. Cleared on
  // unmount, whenever a newer change supersedes a pending run, and — see below
  // — whenever the mounted form is swapped.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending debounced run is work scheduled BY, and FOR, the form mounted when
  // the user typed. It closes over the value they typed and passes it to
  // `validateField` EXPLICITLY, so once it fires it is not a stale run that can
  // be recognised and dropped downstream — it is a brand-new, perfectly current
  // run carrying a value from a form that no longer exists.
  //
  // Unmount does not cover this. A step transition re-renders the same
  // `FormField` in the same position with the same field id, so React reconciles
  // it rather than remounting it: the timer survives, fires on the new step, and
  // validates the PREVIOUS step's text against the NEW step's rules — leaving an
  // error on a field the user is looking at empty and has never touched.
  // `formInstanceKey` and `componentId` are deliberately dependencies the BODY
  // does not read: their whole job is to make this effect re-run — i.e. to fire
  // the cleanup — when the mounted form is swapped OR the field is retyped
  // mid-stream (`text`→`textarea`, same id, new component). Without the retype
  // trigger a pending debounced run fires the ORPHANED pre-retype value's verdict
  // onto the freshly re-registered control. The rule below reasons about what a
  // body READS, and cannot see that a cleanup-only effect's deps are its TRIGGER.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup trigger, not an input
  useEffect(
    () => () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    },
    [formInstanceKey, fieldConfig.componentId]
  );

  // Stable change handler
  const handleChange = useCallback(
    async (newValue: unknown) => {
      setValue(newValue);

      const shouldValidate = shouldValidateOnEvent('change', {
        mode,
        reValidateMode,
        hasErrored: fieldState.errors.length > 0,
        touched: fieldState.touched,
      });
      if (!shouldValidate) return;

      // Debounce change-triggered validation when configured (blur/submit always
      // validate immediately, unaffected by this). Superseded runs are cancelled.
      const debounceMs = fieldConfig.validation?.debounceMs;
      if (debounceMs && debounceMs > 0) {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          void validateField(fieldId, newValue);
        }, debounceMs);
        return;
      }

      await validateField(fieldId, newValue);
    },
    [
      fieldId,
      setValue,
      validateField,
      mode,
      reValidateMode,
      fieldConfig.validation?.debounceMs,
      fieldState.errors.length,
      fieldState.touched,
    ]
  );

  // Stable blur handler
  const handleBlur = useCallback(async () => {
    if (!fieldState.touched) {
      setTouched();
    }

    const shouldValidate = shouldValidateOnEvent('blur', {
      mode,
      reValidateMode,
      hasErrored: fieldState.errors.length > 0,
      touched: fieldState.touched,
    });
    if (shouldValidate) {
      await validateField(fieldId);
    }
  }, [
    fieldId,
    mode,
    reValidateMode,
    fieldState.errors.length,
    fieldState.touched,
    setTouched,
    validateField,
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
        // Raw store visibility (pre-forceVisible): effective visibility is
        // always true inside a rendered field, so the raw flag is the only
        // informative value (e.g. styling a condition-hidden field under forceVisible)
        visible: conditions.visible,
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
      conditions.visible,
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
