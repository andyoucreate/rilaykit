// @ts-nocheck - generic constraints relaxed for test ergonomics
import { type ComponentRenderContext, onChange, ril } from '@rilaykit/core';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';
import { useFormStore } from '../../src/stores/formStore';

const MockText = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

/**
 * Round 17: a swap reset must not be observed by the OUTGOING step's effect
 * engine.
 *
 * The reset runs in a LAYOUT effect; the engine's teardown+rebuild is a PASSIVE
 * effect one commit later. Left subscribed, the previous step's engine sees the
 * new step's reset values as watched changes and fires its onChange effect onto
 * the fresh step's target, overwriting the seeded default. Initial-grade grading
 * cannot save this: the swap clears every ownership signal (userEditedFields and
 * touched), so the fresh target is not user-owned and the user-owned guard is a
 * no-op. The only fix is to stop the outgoing engine before the reset notifies.
 */
describe('Round 17: outgoing effect engine must not observe the swap reset', () => {
  let config: ReturnType<typeof ril.create>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = ril.create().component('text', { name: 'Text', renderer: MockText });
  });

  it("old step's effect does not overwrite the new step's reset default", async () => {
    // Step 1: `city` is derived from `shared` by an onChange effect.
    const step1 = form
      .create(config, 'step-1')
      .add({ id: 'shared', type: 'text' })
      .add({
        id: 'city',
        type: 'text',
        effects: [
          onChange('shared', (value, { setValue }) => {
            setValue('city', `derived:${String(value)}`);
          }),
        ],
      })
      .build();

    // Step 2: shares both ids, but `city` is a PLAIN field — no effect. Its
    // seeded default ('Paris') must survive the transition untouched.
    const step2 = form
      .create(config, 'step-2')
      .add({ id: 'shared', type: 'text' })
      .add({ id: 'city', type: 'text' })
      .build();

    let storeRef = null;
    const Probe = () => {
      storeRef = useFormStore();
      return null;
    };

    const { rerender } = render(
      <FormProvider formConfig={step1} defaultValues={{ shared: 'one', city: '' }}>
        <Probe />
      </FormProvider>
    );

    await waitFor(() => expect(storeRef.getState().values.city).toBe('derived:one'));

    // Transition to step 2 in place — the reset path WorkflowProvider takes.
    rerender(
      <FormProvider formConfig={step2} defaultValues={{ shared: 'two', city: 'Paris' }}>
        <Probe />
      </FormProvider>
    );

    expect(storeRef.getState().values.shared).toBe('two');
    expect(storeRef.getState().values.city).toBe('Paris');
  });
});
