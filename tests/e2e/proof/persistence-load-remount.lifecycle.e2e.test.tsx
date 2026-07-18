/**
 * PROOF — an async persistence load must not evict the user from the form it
 * already let them type into.
 *
 * WorkflowProvider renders a fully INTERACTIVE step form while the adapter's
 * `load()` is still in flight. The FormProvider's remount key folded in
 * `isInitializing`, so the moment `load()` resolved the key flipped and the
 * whole form subtree remounted — destroying everything that lives in
 * FORM-LOCAL state. The values survive (the workflow store re-seeds them); the
 * VALIDATION ERROR and the keyboard FOCUS do not.
 *
 * A localStorage adapter resolves in a microtask and never shows this. A
 * network- or IndexedDB-backed one gives the user a window to type into, and
 * then ejects their focus mid-keystroke.
 *
 * THE RULE: a remount is a re-SEED, so it is owed only when the store's seed
 * data was actually replaced underneath the form — a reset, or a restore that
 * delivered something. A `load()` that restores NOTHING replaces nothing and
 * must cost the user nothing.
 */
import { required } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import type { PersistedWorkflowData, WorkflowPersistenceAdapter } from '@rilaykit/workflow';
import { flow } from '@rilaykit/workflow';
import { FlowBody, WorkflowProvider, useFlow } from '@rilaykit/workflow/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createProofRil } from '../_setup/proof-fixtures';

const r = createProofRil();

/** Long enough that the user is typing while `load()` is still in flight. */
const LOAD_LATENCY_MS = 150;

function buildFlow() {
  return flow
    .create(r, 'slow-load', 'Slow load')
    .addStep({
      id: 'contact',
      title: 'Contact',
      formConfig: form
        .create(r, 'contact-form')
        .add({
          id: 'email',
          type: 'text',
          props: {},
          validation: {
            validate: [required('Email is required'), z.string().email('Invalid email')],
          },
        })
        .add({ id: 'other', type: 'text', props: {} })
        .setValidation({ mode: 'onChange' }),
    })
    .build();
}

function InitProbe() {
  const { workflowState } = useFlow();
  return <output data-testid="init">{String(workflowState.isInitializing)}</output>;
}

function Harness() {
  return (
    <div>
      <InitProbe />
      <FlowBody />
    </div>
  );
}

/** An adapter whose `load()` is slow — a network or IndexedDB one. */
function makeSlowAdapter(stored: PersistedWorkflowData | null): WorkflowPersistenceAdapter {
  return {
    save: async () => {},
    load: async () => {
      await new Promise((resolve) => setTimeout(resolve, LOAD_LATENCY_MS));
      return stored;
    },
    remove: async () => {},
    exists: async () => stored !== null,
  };
}

async function typeAnInvalidEmailDuringTheLoadWindow(): Promise<void> {
  // The form is interactive NOW — before the load resolves. That is the
  // premise: the provider rendered it, so the user may use it.
  expect(screen.getByTestId('init').textContent).toBe('true');

  fireEvent.change(screen.getByTestId('email'), { target: { value: 'nope' } });
  screen.getByTestId('other').focus();

  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('alert').textContent).toBe('Invalid email');
  expect(document.activeElement).toBe(screen.getByTestId('other'));
}

describe('PROOF: an async persistence load does not evict the user', () => {
  it('keeps the validation error and the focus when the load restores NOTHING', async () => {
    render(
      <WorkflowProvider
        workflowConfig={{ ...buildFlow(), persistence: { adapter: makeSlowAdapter(null) } }}
      >
        <Harness />
      </WorkflowProvider>
    );

    await typeAnInvalidEmailDuringTheLoadWindow();

    // The load resolves with nothing to restore. Pure loss if it remounts.
    await waitFor(() => expect(screen.getByTestId('init').textContent).toBe('false'), {
      timeout: 2000,
    });

    expect(screen.getByRole('alert').textContent).toBe('Invalid email');
    expect(document.activeElement).toBe(screen.getByTestId('other'));
    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe('nope');
  });

  it('still re-seeds the form when the load DOES restore data', async () => {
    const stored: PersistedWorkflowData = {
      workflowId: 'slow-load',
      currentStepIndex: 0,
      allData: { contact: { other: 'restored' } },
      stepData: {},
      visitedSteps: ['contact'],
      passedSteps: [],
      timestamp: Date.now(),
    } as PersistedWorkflowData;

    render(
      <WorkflowProvider
        workflowConfig={{ ...buildFlow(), persistence: { adapter: makeSlowAdapter(stored) } }}
      >
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('init').textContent).toBe('false'), {
      timeout: 2000,
    });

    // The restored value reached the input: a real restore still re-seeds.
    await waitFor(() =>
      expect((screen.getByTestId('other') as HTMLInputElement).value).toBe('restored')
    );
  });
});
