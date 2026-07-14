import { type ComponentRenderContext, ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, flow } from '@rilaykit/workflow';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const r = ril.create().component('text', {
  renderer: ({ id, field }: ComponentRenderContext) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});
const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  formConfig: form
    .create(r, id)
    .add({ id: `${id}-f`, type: 'text', props: {} })
    .build(),
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
        <Flow.Back>
          {({ canGo }) => <output data-testid="can-back">{String(canGo)}</output>}
        </Flow.Back>
      </Flow>
    );
    expect(screen.getByTestId('can-back').textContent).toBe('false');
  });

  it('Skip honours a dynamic allowSkip predicate', () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(
        step('a', {
          allowSkip: (ctx: { allData: Record<string, unknown> }) => ctx.allData.vip === true,
        })
      )
      .addStep(step('b'));
    render(
      <Flow of={wf} defaults={{}}>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('Skip shows and advances when the dynamic allowSkip predicate is true', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(
        step('a', {
          allowSkip: ({ allData }: { allData: Record<string, unknown> }) =>
            (allData.a as { vip?: boolean } | undefined)?.vip === true,
        })
      )
      .addStep(step('b'));
    render(
      <Flow of={wf} defaults={{ a: { vip: true } }}>
        <Flow.Body />
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    const skip = screen.getByRole('button', { name: 'Skip' });
    expect(skip).toBeInTheDocument();
    fireEvent.click(skip);
    expect(await screen.findByTestId('b-f')).toBeInTheDocument();
  });

  it('Skip appears reactively when entered data makes the predicate true', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(
        step('a', {
          allowSkip: ({ allData }: { allData: Record<string, unknown> }) =>
            (allData.a as Record<string, unknown> | undefined)?.['a-f'] === 'skip me',
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
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'skip me' } });
    expect(await screen.findByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('Skip renders when allowSkip is true', () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a', { allowSkip: true }))
      .addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('Skip renders and advances for a step skippable only via conditions', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a', { conditions: { skippable: when('a-f').equals('y').build() } }))
      .addStep(step('b'));
    render(
      <Flow of={wf} defaults={{ a: { 'a-f': 'y' } }}>
        <Flow.Body />
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    const skip = screen.getByRole('button', { name: 'Skip' });
    expect(skip).toBeInTheDocument();
    fireEvent.click(skip);
    expect(await screen.findByTestId('b-f')).toBeInTheDocument();
  });
});
