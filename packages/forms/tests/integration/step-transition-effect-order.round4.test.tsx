// @ts-nocheck - generic constraints relaxed for test ergonomics
import { type ComponentRenderContext, onChange, ril } from '@rilaykit/core';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';

const MockText = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

describe('Step-transition initial-effect ordering (round-4, Gap 10)', () => {
  let config: ReturnType<typeof ril.create>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = ril.create().component('text', { name: 'Text', renderer: MockText });
  });

  it('new step initial effects observe the NEW step values for a shared field', async () => {
    const observed: unknown[] = [];

    // Step 1: plain shared field, no effects.
    const step1 = form
      .create(config, 'step-1')
      .add({ id: 'shared', type: 'text' })
      .build();

    // Step 2: shares 'shared' and adds an initial effect watching it.
    const step2 = form
      .create(config, 'step-2')
      .add({ id: 'shared', type: 'text' })
      .add({
        id: 'observer',
        type: 'text',
        effects: [
          onChange('shared', (value) => {
            observed.push(value);
          }),
        ],
      })
      .build();

    const { rerender } = render(
      <FormProvider formConfig={step1} defaultValues={{ shared: 'step1-value' }}>
        <div />
      </FormProvider>
    );

    // Transition to step 2 in place (same FormProvider instance, new formConfig +
    // new default values), as WorkflowProvider does across steps.
    rerender(
      <FormProvider formConfig={step2} defaultValues={{ shared: 'step2-value' }}>
        <div />
      </FormProvider>
    );

    await waitFor(() => expect(observed.length).toBeGreaterThan(0));

    // The initial effect must observe step 2's value, never step 1's leftover.
    expect(observed).toContain('step2-value');
    expect(observed).not.toContain('step1-value');
  });
});
