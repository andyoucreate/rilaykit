import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider, useForm } from '../../src/components/FormProvider';
import { useFormStoreApi } from '../../src/stores';

const MockTextInput = ({ id, props, field }: ComponentRenderContext) => (
  <div>
    <label>{String(props.label ?? '')}</label>
    <input
      data-testid={`input-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  </div>
);

let releaseValidations: (() => void) | null = null;
let pendingGate: Promise<void> | null = null;
const slowRequiredSchema: StandardSchemaV1<unknown> = {
  '~standard': {
    version: 1,
    vendor: 'r16',
    validate: async (value) => {
      await pendingGate;
      if (value === '' || value === undefined || value === null)
        return { issues: [{ message: 'sku required' }] };
      return { value };
    },
  },
};
let rilConfig: ReturnType<typeof ril.create>;

function buildFormConfig(): FormConfiguration {
  return form
    .create(rilConfig, 'r16-a2')
    .add({ id: 'title', type: 'text', props: { label: 'Title' } })
    .addRepeatable('items', (r) =>
      r
        .add({
          id: 'sku',
          type: 'text',
          props: { label: 'SKU' },
          validation: { validate: slowRequiredSchema },
        })
        .defaultValue({ sku: '' })
    )
    .build();
}

function Child() {
  const { submit } = useForm();
  const store = useFormStoreApi();
  const [submitResult, setSubmitResult] = React.useState('none');
  return (
    <div>
      <FormBody />
      <button
        type="button"
        data-testid="go"
        onClick={async () => {
          const p = submit();
          const order = store.getState()._repeatableOrder.items;
          store.getState()._removeRepeatableItem('items', order[1]);
          releaseValidations?.();
          setSubmitResult((await p) ? 'submitted' : 'blocked');
        }}
      >
        Go
      </button>
      <div data-testid="submit-result">{submitResult}</div>
    </div>
  );
}

describe('R16-A2: a row removed mid-submit-validation must not silently block submit', () => {
  beforeEach(() => {
    rilConfig = ril
      .create()
      .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } });
    pendingGate = new Promise<void>((resolve) => {
      releaseValidations = resolve;
    });
  });

  it('submit succeeds when the only invalid row was removed mid-validation', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider
        formConfig={buildFormConfig()}
        defaultValues={{ title: 't', items: [{ sku: 'ok' }, { sku: '' }] }}
        onSubmit={onSubmit}
      >
        <Child />
      </FormProvider>
    );
    fireEvent.click(screen.getByTestId('go'));
    await waitFor(() => expect(screen.getByTestId('submit-result')).not.toHaveTextContent('none'));
    expect(screen.getByTestId('submit-result')).toHaveTextContent('submitted');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect((onSubmit.mock.calls[0][0] as Record<string, unknown>).items).toEqual([{ sku: 'ok' }]);
  });
});
