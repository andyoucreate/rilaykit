/**
 * PROOF — flow chrome hardening.
 * User-level scenarios the migrated e2e/unit suites do not pin down with the
 * new chrome: exact namespaced `onComplete` payload, back-navigation data
 * retention, live `allowSkip` predicate flips, and `Flow.Progress` goTo with
 * hidden-step index mapping.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StepDataHelper } from '@rilaykit/core';
import { when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, flow } from '@rilaykit/workflow';
import { createProofRil } from '../_setup/proof-fixtures';

const r = createProofRil();
const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  formConfig: form
    .create(r, id)
    .add({ id: `${id}-f`, type: 'text', props: {} })
    .build(),
  ...extra,
});

describe('PROOF flow chrome hardening', () => {
  it('completes a 2-step flow and delivers the exact namespaced payload to onComplete', async () => {
    const onComplete = vi.fn();
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf} onComplete={onComplete}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(await screen.findByTestId('b-f'), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({ a: { 'a-f': 'one' }, b: { 'b-f': 'two' } })
    );
  });

  it('Back preserves the values typed on the previous step', async () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Back>Back</Flow.Back>
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'kept' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByTestId('b-f');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(((await screen.findByTestId('a-f')) as HTMLInputElement).value).toBe('kept');
  });

  it('allowSkip predicate flips live when allData changes', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(
        step('a', {
          allowSkip: ({ allData }: { allData: Record<string, unknown> }) =>
            (allData.a as Record<string, unknown> | undefined)?.['a-f'] === 'vip',
        })
      )
      .addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'vip' } });
    expect(await screen.findByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('onAfterValidation setNextStepFields prefills the next step through the real store', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(
        step('a', {
          onAfterValidation: (values: Record<string, unknown>, helper: StepDataHelper) => {
            helper.setNextStepFields({ 'b-f': `hello ${String(values['a-f'])}` });
          },
        })
      )
      .addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(((await screen.findByTestId('b-f')) as HTMLInputElement).value).toBe('hello world');
  });

  it('analytics onStepStart / onStepComplete fire while navigating with the new chrome', async () => {
    const onStepStart = vi.fn();
    const onStepComplete = vi.fn();
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a'))
      .addStep(step('b'))
      .configure({ analytics: { onStepStart, onStepComplete } });
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );
    await waitFor(() => expect(onStepStart).toHaveBeenCalledTimes(1));
    expect(onStepStart.mock.calls[0]?.[0]).toBe('a');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(onStepStart).toHaveBeenCalledTimes(2));
    expect(onStepStart.mock.calls[1]?.[0]).toBe('b');
    expect(onStepComplete).toHaveBeenCalledTimes(1);
    expect(onStepComplete.mock.calls[0]?.[0]).toBe('a');
  });

  it('Progress goTo lands on the right step when a middle step is hidden', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a'))
      .addStep({ ...step('hidden'), conditions: { visible: when('a.a-f').equals('never') } })
      .addStep(step('c'));
    render(
      <Flow of={wf}>
        <Flow.Progress>
          {({ steps, goTo }) => (
            <button type="button" onClick={() => goTo(1)} data-testid="jump">
              {steps.map((s) => s.id).join(',')}
            </button>
          )}
        </Flow.Progress>
        <Flow.Body />
      </Flow>
    );
    expect(screen.getByTestId('jump').textContent).toBe('a,c');
    fireEvent.click(screen.getByTestId('jump'));
    expect(await screen.findByTestId('c-f')).toBeInTheDocument();
  });
});
