import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Flow, flow } from '@rilaykit/workflow';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  formConfig: form.create(r, id).add({ id: `${id}-f`, type: 'text', props: {} }).build(),
  ...extra,
});

describe('Flow nav buttons', () => {
  it('Next advances to the next step (bare default)', async () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Next>Continue</Flow.Next>
      </Flow>
    );
    expect(screen.getByTestId('a-f')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('b-f')).toBeInTheDocument();
  });

  it('Back render prop exposes canGo=false on first step', () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Back>{({ canGo }) => <output data-testid="can-back">{String(canGo)}</output>}</Flow.Back>
      </Flow>
    );
    expect(screen.getByTestId('can-back').textContent).toBe('false');
  });

  it('Skip honours a dynamic allowSkip predicate', () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a', { allowSkip: (ctx: { allData: Record<string, unknown> }) => ctx.allData.vip === true }))
      .addStep(step('b'));
    render(
      <Flow of={wf} defaults={{}}>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('Skip renders when allowSkip is true', () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a', { allowSkip: true })).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });
});
