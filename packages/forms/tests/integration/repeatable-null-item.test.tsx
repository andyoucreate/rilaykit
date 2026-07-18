import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';

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
    .create(rilConfig, 'null-item-form')
    .addRepeatable('items', (r) =>
      r.add({ id: 'name', type: 'text', props: { label: 'Item Name' } }).defaultValue({ name: '' })
    )
    .build();
}

describe('BUG 4: Form renders with a null repeatable row (backend JSON null)', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('should mount without crashing when defaultValues contain a null item', () => {
    const config = buildForm();

    expect(() =>
      render(
        <FormProvider formConfig={config} defaultValues={{ items: [null] }}>
          <FormBody />
        </FormProvider>
      )
    ).not.toThrow();

    // The single (normalized) row is rendered.
    expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
  });
});
