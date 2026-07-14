import type { StepConfig } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, FlowBody, flow } from '@rilaykit/workflow';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MockInput } from '../_helpers/mock-components';

const r = ril.create().component('text', { name: 'Text', renderer: MockInput });
const stepForm = form.create(r, 's1').add({ id: 'email', type: 'text', props: {} });
const wf = flow
  .create(r, 'onboarding', 'Onboarding')
  .addStep({ id: 'personal', title: 'Personal', formConfig: stepForm.build() });

const customRenderer = (step: StepConfig) => <div data-testid="custom">{step.title}</div>;
const wfWithRenderer = flow.create(r, 'custom-wf', 'Custom').addStep({
  id: 'personal',
  title: 'Personal',
  formConfig: stepForm.build(),
  renderer: customRenderer,
});

describe('<Flow of> + <Flow.Body>', () => {
  it('renders the current step form through FlowBody default', () => {
    render(
      <Flow of={wf} defaults={{}}>
        <FlowBody />
      </Flow>
    );
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
  });

  it('seeds workflow values from defaults', () => {
    render(
      <Flow of={wf} defaults={{ personal: { email: 'seed@lovelace.dev' } }}>
        <FlowBody />
      </Flow>
    );
    expect(screen.getByTestId('input-email')).toHaveValue('seed@lovelace.dev');
  });

  it('supports the render-prop children with step context', () => {
    render(
      <Flow of={wf}>
        <FlowBody>{({ step }) => <h1 data-testid="title">{step.title}</h1>}</FlowBody>
      </Flow>
    );
    expect(screen.getByTestId('title').textContent).toBe('Personal');
  });

  it('renders static children instead of the FormBody default', () => {
    render(
      <Flow of={wf}>
        <FlowBody>
          <p data-testid="static">x</p>
        </FlowBody>
      </Flow>
    );
    expect(screen.getByTestId('static').textContent).toBe('x');
    expect(screen.queryByTestId('input-email')).toBeNull();
  });

  it('calls onComplete with the collected data when the last step submits', async () => {
    const onComplete = vi.fn();
    render(
      <Flow of={wf} onComplete={onComplete}>
        <FlowBody />
        <Flow.Next>
          {({ go, submitting }) => (
            <button type="button" data-testid="next-btn" onClick={go} disabled={submitting}>
              Next
            </button>
          )}
        </Flow.Next>
      </Flow>
    );

    fireEvent.change(screen.getByTestId('input-email'), {
      target: { value: 'ada@lovelace.dev' },
    });
    fireEvent.click(screen.getByTestId('next-btn'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledWith({ personal: { email: 'ada@lovelace.dev' } });
  });
});

describe('<Flow.Body> step renderer precedence', () => {
  it('renders the custom step renderer instead of the FormBody default', () => {
    render(
      <Flow of={wfWithRenderer}>
        <FlowBody />
      </Flow>
    );
    expect(screen.getByTestId('custom').textContent).toBe('Personal');
    expect(screen.queryByTestId('input-email')).toBeNull();
  });

  it('prefers the custom step renderer over static children', () => {
    render(
      <Flow of={wfWithRenderer}>
        <FlowBody>
          <span data-testid="kids" />
        </FlowBody>
      </Flow>
    );
    expect(screen.getByTestId('custom').textContent).toBe('Personal');
    expect(screen.queryByTestId('kids')).toBeNull();
  });
});

describe('<Flow.Body stepId>', () => {
  it('renders nothing when stepId does not match the current step', () => {
    render(
      <Flow of={wf}>
        <FlowBody stepId="other" />
      </Flow>
    );
    expect(screen.queryByTestId('input-email')).toBeNull();
  });

  it('renders the step form when stepId matches the current step', () => {
    render(
      <Flow of={wf}>
        <FlowBody stepId="personal" />
      </Flow>
    );
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
  });
});
