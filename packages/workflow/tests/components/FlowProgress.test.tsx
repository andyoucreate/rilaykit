import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, FlowProgress, flow } from '@rilaykit/workflow';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const step = (id: string) => ({
  id,
  title: id.toUpperCase(),
  formConfig: form.create(r, id).add({ id: `${id}-f`, type: 'text', props: {} }).build(),
});

const wf = flow
  .create(r, 'wf', 'WF')
  .addStep(step('a'))
  .addStep({ ...step('b'), conditions: { visible: when('a.a-f').equals('show-b') } })
  .addStep(step('c'));

describe('<Flow.Progress>', () => {
  it('lists only visible steps, bare default', () => {
    render(
      <Flow of={wf}>
        <FlowProgress />
      </Flow>
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['A', 'C']);
    expect(items[0]?.dataset.active).toBe('true');
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
});
