import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, FlowBody, flow } from '@rilaykit/workflow';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const stepForm = form.create(r, 's1').add({ id: 'email', type: 'text', props: {} });
const wf = flow
  .create(r, 'onboarding', 'Onboarding')
  .addStep({ id: 'personal', title: 'Personal', formConfig: stepForm.build() });

describe('<Flow of> + <Flow.Body>', () => {
  it('renders the current step form through FlowBody default', () => {
    render(
      <Flow of={wf} defaults={{}}>
        <FlowBody />
      </Flow>
    );
    expect(screen.getByTestId('email')).toBeInTheDocument();
  });

  it('supports the render-prop children with step context', () => {
    render(
      <Flow of={wf}>
        <FlowBody>{({ step }) => <h1 data-testid="title">{step.title}</h1>}</FlowBody>
      </Flow>
    );
    expect(screen.getByTestId('title').textContent).toBe('Personal');
  });
});
