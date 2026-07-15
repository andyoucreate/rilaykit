import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';
import { useFieldValue, useFormStoreApi } from '../../src/stores';

/**
 * The store reset that follows a form-id swap must be ATOMIC with the swap.
 *
 * `FormProvider` resets the store when the mounted form's id changes. If that
 * reset runs in a PASSIVE effect, it is flushed in a scheduler macrotask —
 * leaving a window in which the new form is already committed while the store
 * still holds the previous form's values. Anything written into the store during
 * that window (a keystroke, or a programmatic prefill such as a workflow step's
 * `onAfterValidation` binding) is silently destroyed by the reset that lands
 * afterwards. Running the reset in a LAYOUT effect closes the window.
 *
 * These tests pin the ordering deterministically. React flushes layout effects
 * for the whole tree before ANY passive effect, and flushes passive effects
 * bottom-up (child before parent). So a child's passive effect reacting to the
 * new form id is exactly the earliest point a consumer can observe the swap:
 *   - reset in a passive effect (parent) → runs AFTER this child → wipes it
 *   - reset in a layout effect          → runs BEFORE this child → survives
 */

const MockTextInput = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

function createRil() {
  return ril.create().component('text', { name: 'Text', renderer: MockTextInput });
}

let rilConfig: ReturnType<typeof createRil>;

function buildStepOne(): FormConfiguration {
  return form.create(rilConfig, 'stepOne').add({ id: 'accountType', type: 'text' }).build();
}

function buildStepTwo(): FormConfiguration {
  return form.create(rilConfig, 'stepTwo').add({ id: 'companyName', type: 'text' }).build();
}

/**
 * Stands in for any consumer that writes into the store as soon as the new form
 * becomes observable — the shape every cross-step prefill takes.
 */
function PrefillOnArrival({ formId }: { formId: string }) {
  const store = useFormStoreApi();
  const companyName = useFieldValue('companyName');

  useEffect(() => {
    if (formId === 'stepTwo') {
      store.getState()._setValue('companyName', 'Tech Innovation SAS');
    }
  }, [formId, store]);

  return <div data-testid="company-name">{String(companyName ?? '')}</div>;
}

/** Reports the store's values at the earliest observable point after the swap. */
function ObserveOnArrival({ formId, seen }: { formId: string; seen: string[] }) {
  const store = useFormStoreApi();

  useEffect(() => {
    seen.push(JSON.stringify(store.getState().values));
  }, [formId, store]);

  return null;
}

describe('the store reset on a form-id change is atomic with the swap', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('preserves a value written by a consumer reacting to the new form id', () => {
    const { rerender } = render(
      <FormProvider formConfig={buildStepOne()} defaultValues={{ accountType: 'enterprise' }}>
        <PrefillOnArrival formId="stepOne" />
      </FormProvider>
    );

    // Swap the mounted form, exactly as a workflow step transition does.
    rerender(
      <FormProvider formConfig={buildStepTwo()} defaultValues={{}}>
        <PrefillOnArrival formId="stepTwo" />
      </FormProvider>
    );

    // Written on arrival — the reset must already have happened, so this survives.
    expect(screen.getByTestId('company-name')).toHaveTextContent('Tech Innovation SAS');
  });

  it("never exposes the previous form's values once the new form is observable", () => {
    const seen: string[] = [];

    const { rerender } = render(
      <FormProvider formConfig={buildStepOne()} defaultValues={{ accountType: 'enterprise' }}>
        <ObserveOnArrival formId="stepOne" seen={seen} />
      </FormProvider>
    );

    rerender(
      <FormProvider formConfig={buildStepTwo()} defaultValues={{}}>
        <ObserveOnArrival formId="stepTwo" seen={seen} />
      </FormProvider>
    );

    // First entry is the initial mount; the entry for the swap must show a store
    // already reset to step two's (empty) defaults, with no leftover from step one.
    expect(seen).toEqual([JSON.stringify({ accountType: 'enterprise' }), JSON.stringify({})]);
  });
});
