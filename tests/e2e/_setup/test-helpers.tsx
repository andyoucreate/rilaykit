import type { ComponentRenderContext, ValidationResult } from '@rilaykit/core';
import { useForm } from '@rilaykit/forms';
import {
  useFieldErrors,
  useFormDirty,
  useFormStoreApi,
  useFormSubmitState,
  useFormValid,
  useFormValues,
  useRepeatableKeys,
} from '@rilaykit/forms';
import { useRepeatableField } from '@rilaykit/forms';
import type React from 'react';
import { useState } from 'react';

// =================================================================
// MOCK COMPONENTS
// =================================================================

export const MockTextInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    {props?.label && <label htmlFor={id}>{String(props.label)}</label>}
    <input
      id={id}
      data-testid={`input-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
      disabled={field?.disabled}
      readOnly={Boolean(props?.readonly)}
      placeholder={props?.placeholder ? String(props.placeholder) : undefined}
    />
  </div>
);

export const MockSelectInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    {props?.label && <label htmlFor={id}>{String(props.label)}</label>}
    <select
      id={id}
      data-testid={`input-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
      disabled={field?.disabled}
    >
      {(props?.options as Array<{ value: string; label: string }> | undefined)?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

export const MockNumberInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    {props?.label && <label htmlFor={id}>{String(props.label)}</label>}
    <input
      id={id}
      data-testid={`input-${id}`}
      type="number"
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(Number(e.target.value))}
      onBlur={() => field?.onBlur()}
      disabled={field?.disabled}
    />
  </div>
);

export const MockCheckboxInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    {props?.label && <label htmlFor={id}>{String(props.label)}</label>}
    <input
      id={id}
      data-testid={`input-${id}`}
      type="checkbox"
      checked={!!field?.value}
      onChange={(e) => field?.onChange(e.target.checked)}
      disabled={field?.disabled}
    />
  </div>
);

// =================================================================
// HELPER COMPONENTS
// =================================================================

export function FormValuesDisplay() {
  const values = useFormValues();
  return <pre data-testid="form-values">{JSON.stringify(values, null, 2)}</pre>;
}

export function FormStateDisplay() {
  const { isSubmitting, isValid, isDirty } = useFormSubmitState();
  return (
    <div data-testid="form-state">
      <span data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</span>
      <span data-testid="is-valid">{isValid ? 'true' : 'false'}</span>
      <span data-testid="is-dirty">{isDirty ? 'true' : 'false'}</span>
    </div>
  );
}

export function SubmitButton() {
  const { submit } = useForm();
  return (
    <button type="button" data-testid="submit-btn" onClick={() => submit()}>
      Submit
    </button>
  );
}

export function ValidationTrigger() {
  const { validateForm } = useForm();
  const [result, setResult] = useState<ValidationResult | null>(null);

  const handleValidate = async () => {
    const res = await validateForm();
    setResult(res);
  };

  return (
    <div>
      <button type="button" data-testid="validate-btn" onClick={handleValidate}>
        Validate
      </button>
      {result && (
        <div data-testid="validation-result">
          <span data-testid="validation-valid">{result.isValid ? 'true' : 'false'}</span>
          <span data-testid="validation-errors">{JSON.stringify(result.errors)}</span>
        </div>
      )}
    </div>
  );
}

export function FieldErrorDisplay({ fieldId }: { fieldId: string }) {
  const errors = useFieldErrors(fieldId);
  if (errors.length === 0) return null;
  return (
    <div data-testid={`errors-${fieldId}`}>
      {errors.map((err) => (
        <span key={err.message} data-testid={`error-${fieldId}-${errors.indexOf(err)}`}>
          {err.message}
        </span>
      ))}
    </div>
  );
}

export function SetValueButton({ fieldId, value }: { fieldId: string; value: unknown }) {
  const store = useFormStoreApi();
  return (
    <button
      type="button"
      data-testid={`set-${fieldId}`}
      onClick={() => store.getState()._setValue(fieldId, value)}
    >
      Set {fieldId}
    </button>
  );
}

export function ResetButton() {
  const store = useFormStoreApi();
  return (
    <button type="button" data-testid="reset-btn" onClick={() => store.getState()._reset()}>
      Reset
    </button>
  );
}

export function RepeatableControls({ repeatableId }: { repeatableId: string }) {
  const { items, append, remove, move, canAdd, canRemove, count } =
    useRepeatableField(repeatableId);

  return (
    <div data-testid={`repeatable-controls-${repeatableId}`}>
      <span data-testid={`repeatable-count-${repeatableId}`}>{count}</span>
      <span data-testid={`repeatable-can-add-${repeatableId}`}>{canAdd ? 'true' : 'false'}</span>
      <span data-testid={`repeatable-can-remove-${repeatableId}`}>
        {canRemove ? 'true' : 'false'}
      </span>
      <button
        type="button"
        data-testid={`repeatable-append-${repeatableId}`}
        onClick={() => append()}
        disabled={!canAdd}
      >
        Add
      </button>
      {items.map((item, index) => (
        <div key={item.key} data-testid={`repeatable-item-ctrl-${repeatableId}-${index}`}>
          <button
            type="button"
            data-testid={`repeatable-remove-${repeatableId}-${item.key}`}
            onClick={() => remove(item.key)}
            disabled={!canRemove}
          >
            Remove {item.key}
          </button>
          {index > 0 && (
            <button
              type="button"
              data-testid={`repeatable-move-up-${repeatableId}-${index}`}
              onClick={() => move(index, index - 1)}
            >
              Move Up
            </button>
          )}
          {index < items.length - 1 && (
            <button
              type="button"
              data-testid={`repeatable-move-down-${repeatableId}-${index}`}
              onClick={() => move(index, index + 1)}
            >
              Move Down
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function StoreInspector() {
  const store = useFormStoreApi();
  const state = store.getState();
  return (
    <div data-testid="store-inspector">
      <pre data-testid="store-values">{JSON.stringify(state.values)}</pre>
      <pre data-testid="store-errors">{JSON.stringify(state.errors)}</pre>
      <pre data-testid="store-touched">{JSON.stringify(state.touched)}</pre>
      <pre data-testid="store-validation-states">{JSON.stringify(state.validationStates)}</pre>
      <pre data-testid="store-repeatable-order">{JSON.stringify(state._repeatableOrder)}</pre>
      <pre data-testid="store-repeatable-next-key">{JSON.stringify(state._repeatableNextKey)}</pre>
    </div>
  );
}
