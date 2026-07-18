import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';
import { useFormActions, useRepeatableKeys } from '../../src/stores';

const MockTextInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label>{String(props.label ?? '')}</label>
    <input
      data-testid={`input-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  </div>
);

function createRil() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: MockTextInput,
    defaultProps: { label: '' },
  });
}

let rilConfig: ReturnType<typeof createRil>;

function buildForm(): FormConfiguration {
  return form
    .create(rilConfig, 'reset-form')
    .addRepeatable('items', (r) =>
      r
        .add({ id: 'name', type: 'text', props: { label: 'Item Name' } })
        .min(1)
        .defaultValue({ name: '' })
    )
    .build();
}

function ResetTestChild() {
  const keys = useRepeatableKeys('items');
  const { reset } = useFormActions();

  return (
    <div>
      <FormBody />
      <div data-testid="keys-count">{keys.length}</div>
      <button type="button" data-testid="reset" onClick={() => reset()}>
        Reset
      </button>
    </div>
  );
}

describe('BUG 3: reset() rebuilds repeatable order (rows must not vanish)', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('should keep the repeatable row and restore its value after reset()', () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ items: [{ name: 'a' }] }}>
        <ResetTestChild />
      </FormProvider>
    );

    // One row present initially, value === 'a'
    expect(screen.getByTestId('keys-count')).toHaveTextContent('1');
    const input = screen.getByTestId('input-items[k0].name') as HTMLInputElement;
    expect(input.value).toBe('a');

    // Mutate the value
    fireEvent.change(input, { target: { value: 'changed' } });
    expect((screen.getByTestId('input-items[k0].name') as HTMLInputElement).value).toBe('changed');

    // Reset — the row must survive and the value must be restored
    fireEvent.click(screen.getByTestId('reset'));

    expect(screen.getByTestId('keys-count')).toHaveTextContent('1');
    expect((screen.getByTestId('input-items[k0].name') as HTMLInputElement).value).toBe('a');
  });
});
