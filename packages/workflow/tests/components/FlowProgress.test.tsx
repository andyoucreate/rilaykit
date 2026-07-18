import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';
import { Flow, FlowBody, FlowProgress, useFlow } from '@rilaykit/workflow/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MockInput } from '../_helpers/mock-components';

const r = ril.create().component('text', { name: 'Text', renderer: MockInput });
const step = (id: string) => ({
  id,
  title: id.toUpperCase(),
  formConfig: form
    .create(r, id)
    .add({ id: `${id}-f`, type: 'text', props: {} })
    .build(),
});

const wf = flow
  .create(r, 'wf', 'WF')
  .addStep(step('a'))
  .addStep({ ...step('b'), conditions: { visible: when('a.a-f').equals('show-b') } })
  .addStep(step('c'));

const hiddenWf = flow
  .create(r, 'hidden-wf', 'Hidden')
  .addStep({ ...step('x'), conditions: { visible: when('x.x-f').equals('never') } });

function OriginalIndexProbe() {
  const { workflowState } = useFlow();
  return <output data-testid="original-index">{workflowState.currentStepIndex}</output>;
}

describe('<Flow.Progress>', () => {
  it('lists only visible steps with exact active flags, bare default', () => {
    const { container } = render(
      <Flow of={wf}>
        <FlowProgress className="progress-x" />
      </Flow>
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['A', 'C']);
    expect(items.map((li) => li.dataset.active)).toEqual(['true', 'false']);
    expect(container.querySelector('ol[data-flow-progress]')?.className).toBe('progress-x');
  });

  it('exposes steps/currentIndex/goTo via render prop', () => {
    render(
      <Flow of={wf}>
        <FlowProgress>
          {({ steps, currentIndex }) => (
            <output data-testid="p">{`${currentIndex}/${steps.length}`}</output>
          )}
        </FlowProgress>
      </Flow>
    );
    expect(screen.getByTestId('p').textContent).toBe('0/2');
  });

  it('goTo maps the visible index back to the original index before navigating', async () => {
    render(
      <Flow of={wf}>
        <FlowProgress>
          {({ goTo }) => (
            <button type="button" data-testid="go-1" onClick={() => goTo(1)}>
              go
            </button>
          )}
        </FlowProgress>
        <FlowProgress />
        <OriginalIndexProbe />
      </Flow>
    );

    fireEvent.click(screen.getByTestId('go-1'));

    // Visible index 1 is step 'c' (original index 2), because 'b' is hidden.
    await waitFor(() => {
      expect(screen.getByTestId('original-index').textContent).toBe('2');
    });
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.dataset.active)).toEqual(['false', 'true']);
  });

  it('goTo is a no-op for out-of-range visible indexes', () => {
    render(
      <Flow of={wf}>
        <FlowProgress>
          {({ goTo }) => (
            <button type="button" data-testid="go-5" onClick={() => goTo(5)}>
              go
            </button>
          )}
        </FlowProgress>
        <FlowProgress />
        <OriginalIndexProbe />
      </Flow>
    );

    fireEvent.click(screen.getByTestId('go-5'));

    expect(screen.getByTestId('original-index').textContent).toBe('0');
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.dataset.active)).toEqual(['true', 'false']);
  });

  it('recomputes the visible steps when a condition value changes', async () => {
    render(
      <Flow of={wf}>
        <FlowBody />
        <FlowProgress />
      </Flow>
    );

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['A', 'C']);

    fireEvent.change(screen.getByTestId('input-a-f'), { target: { value: 'show-b' } });

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['A', 'B', 'C']);
    });
    expect(screen.getAllByRole('listitem').map((li) => li.dataset.active)).toEqual([
      'true',
      'false',
      'false',
    ]);
  });

  it('reports currentIndex -1 when the current step is hidden', () => {
    render(
      <Flow of={hiddenWf}>
        <FlowProgress>
          {({ steps, currentIndex }) => (
            <output data-testid="hidden-p">{`${currentIndex}/${steps.length}`}</output>
          )}
        </FlowProgress>
      </Flow>
    );
    expect(screen.getByTestId('hidden-p').textContent).toBe('-1/0');
  });
});
