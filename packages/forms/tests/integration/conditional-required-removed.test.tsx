import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril, when } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useForm } from '../../src/components/FormProvider';
import { type FormStore, useFormStoreApi } from '../../src/stores';

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

/**
 * 'target' is conditionally required when 'trigger' equals 'yes'. It has NO base
 * validation of its own — its only possible error is the CONDITIONAL_REQUIRED
 * one synthesised by the validator.
 */
function buildForm(): FormConfiguration {
  return form
    .create(rilConfig, 'conditional-required-removed-form')
    .add({ id: 'trigger', type: 'text', props: { label: 'Trigger' } })
    .add({
      id: 'target',
      type: 'text',
      props: { label: 'Target' },
      conditions: { required: when('trigger').equals('yes') },
    })
    .build();
}

let capturedStore: FormStore | null = null;

function Capture() {
  capturedStore = useFormStoreApi();
  const { submit } = useForm();
  const store = useFormStoreApi();

  return (
    <div>
      <button
        type="button"
        data-testid="submit"
        onClick={() => {
          void submit();
        }}
      >
        submit
      </button>
      <button
        type="button"
        data-testid="trigger-no"
        onClick={() => store.getState()._setValue('trigger', 'no')}
      >
        trigger no
      </button>
      <button
        type="button"
        data-testid="trigger-yes"
        onClick={() => store.getState()._setValue('trigger', 'yes')}
      >
        trigger yes
      </button>
    </div>
  );
}

describe('conditional-required error clears when a still-visible field stops being required', () => {
  beforeEach(() => {
    rilConfig = createRil();
    capturedStore = null;
  });

  it('frees isValid when required flips true→false while the field stays visible', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ trigger: 'yes', target: '' }}>
        <Capture />
      </FormProvider>
    );

    const store = capturedStore;
    if (!store) throw new Error('store not captured');

    // (1) Submit commits the CONDITIONAL_REQUIRED error on the empty target.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(store.getState().errors.target?.[0]?.code).toBe('CONDITIONAL_REQUIRED');
    });
    expect(store.getState().isValid).toBe(false);

    // (2) target is no longer required (trigger !== 'yes') but stays visible.
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-no'));
    });

    // (3) The stale CONDITIONAL_REQUIRED error must be cleared and isValid freed.
    await waitFor(() => {
      expect(store.getState().isValid).toBe(true);
    });
    expect(store.getState().errors.target ?? []).toHaveLength(0);
  });

  it('re-arms the requirement when required flips back false→true', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ trigger: 'yes', target: '' }}>
        <Capture />
      </FormProvider>
    );

    const store = capturedStore;
    if (!store) throw new Error('store not captured');

    // Commit, then remove the requirement (clearing the error).
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => {
      expect(store.getState().errors.target?.[0]?.code).toBe('CONDITIONAL_REQUIRED');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-no'));
    });
    await waitFor(() => {
      expect(store.getState().isValid).toBe(true);
    });

    // Re-arm: target required again — the clear must not suppress future validation.
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-yes'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(store.getState().errors.target?.[0]?.code).toBe('CONDITIONAL_REQUIRED');
    });
    expect(store.getState().isValid).toBe(false);
  });
});
