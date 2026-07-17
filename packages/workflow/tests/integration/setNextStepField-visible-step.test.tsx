import { type ComponentRenderContext, ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * `helper.setNextStepField`/`setNextStepFields` (StepDataHelper, exposed to
 * `onAfterValidation`) must prefill the next VISIBLE step, not the next DECLARED
 * one. In a conditional-step flow where a hidden step sits between the current
 * step and the one the user actually sees next, a prefill "aimed at the next
 * step" landed on the hidden step (raw `currentStepIndex + 1`) and never reached
 * the destination — a real KYC case where an earlier answer routes a step away.
 */
describe('setNextStepField targets the next VISIBLE step', () => {
  const MockRadio = ({ id, props, field }: ComponentRenderContext) => (
    <div data-testid={`field-${id}`}>
      {(props.options as Array<{ value: string; label: string }>).map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={field?.value === option.value}
            onChange={(e) => field?.onChange(e.target.value)}
            data-testid={`radio-${id}-${option.value}`}
          />
          {option.label}
        </label>
      ))}
    </div>
  );

  const DataProbe = () => {
    const { currentStep, workflowState } = useFlow();
    return (
      <div>
        <div data-testid="current-step-id">{currentStep?.id ?? 'none'}</div>
        <div data-testid="all-data">{JSON.stringify(workflowState.allData)}</div>
      </div>
    );
  };

  let config: ReturnType<typeof ril.create>;
  let workflowConfig: ReturnType<ReturnType<typeof flow.create>['build']>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = ril
      .create()
      .component('radio', { name: 'Radio', renderer: MockRadio })
      .component('input', { name: 'Input', renderer: MockInput });

    // A → B → C. B is visible only when A.route === 'takeB'. A's onAfterValidation
    // prefills 'prefilled' into "the next step".
    workflowConfig = flow
      .create(config, 'route-flow', 'Route Flow')
      .addStep({
        id: 'stepA',
        title: 'A',
        formConfig: form.create(config).add({
          id: 'route',
          type: 'radio',
          props: {
            label: 'Route',
            options: [
              { label: 'Take B', value: 'takeB' },
              { label: 'Skip B', value: 'skipB' },
            ],
          },
        }),
        onAfterValidation: (_values, helper) => {
          helper.setNextStepField('prefilled', 'from-A');
        },
      })
      .addStep({
        id: 'stepB',
        title: 'B',
        conditions: { visible: when('stepA.route').equals('takeB') },
        formConfig: form.create(config).add({ id: 'bField', type: 'input', props: { label: 'B' } }),
      })
      .addStep({
        id: 'stepC',
        title: 'C',
        formConfig: form
          .create(config)
          .add({ id: 'prefilled', type: 'input', props: { label: 'Prefilled' } }),
      })
      .build();
  });

  it('prefills stepC (next VISIBLE) when stepB is hidden, not stepB', async () => {
    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{ stepA: { route: 'skipB' } }}
      >
        <DataProbe />
        <FlowBody />
        <NextButton testId="next" />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepA'));

    // Leave A → onAfterValidation prefills "the next step"; B is hidden so the
    // user lands on C.
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepC'));

    const allData = JSON.parse(screen.getByTestId('all-data').textContent ?? '{}');
    // The prefill must land on the VISIBLE destination (C), never the hidden B.
    expect(allData.stepC?.prefilled).toBe('from-A');
    expect(allData.stepB?.prefilled).toBeUndefined();
  });

  it('still prefills the adjacent step when it IS visible', async () => {
    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{ stepA: { route: 'takeB' } }}
      >
        <DataProbe />
        <FlowBody />
        <NextButton testId="next" />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepA'));
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepB'));

    const allData = JSON.parse(screen.getByTestId('all-data').textContent ?? '{}');
    expect(allData.stepB?.prefilled).toBe('from-A');
  });
});
