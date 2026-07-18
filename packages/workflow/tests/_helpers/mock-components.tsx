import type { ComponentRenderContext } from '@rilaykit/core';

/**
 * Shared catalog mock components for workflow tests (new ComponentRenderContext
 * shape), mirroring tests/e2e/_setup/test-helpers.tsx.
 */

export const MockInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label htmlFor={id}>{String(props.label ?? id)}</label>
    <input
      id={id}
      type="text"
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      data-testid={`input-${id}`}
    />
  </div>
);

export const MockSelect = ({ id, props, field }: ComponentRenderContext) => {
  const options = (props.options as Array<{ value: string; label: string }> | undefined) ?? [];
  const multiple = Boolean(props.multiple);
  const value = Array.isArray(field?.value)
    ? String(field?.value[0] ?? '')
    : String(field?.value ?? '');

  return (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{String(props.label ?? id)}</label>
      <select
        id={id}
        value={value}
        multiple={multiple}
        onChange={(e) => field?.onChange(multiple ? [e.target.value] : e.target.value)}
        data-testid={`select-${id}`}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const MockCheckbox = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label htmlFor={id}>{String(props.label ?? id)}</label>
    <input
      id={id}
      type="checkbox"
      checked={Boolean(field?.value)}
      onChange={(e) => field?.onChange(e.target.checked)}
      data-testid={`checkbox-${id}`}
    />
  </div>
);
