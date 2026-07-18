import {
  type MonitoringEvent,
  type WorkflowContext,
  destroyGlobalMonitoring,
  initializeMonitoring,
  ril,
} from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import type { WorkflowPersistenceAdapter } from '../../src/persistence/types';
import { WorkflowPersistenceError } from '../../src/persistence/types';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * These tests pin the observability contract Karl scoped: EVERY workflow error
 * path must reach `trackError`, so that BOTH `analytics.onError` and the global
 * monitoring adapter (`getGlobalMonitor`) see it — including the persistence
 * save/load/remove failures that previously reached neither.
 */

const rilConfig = ril.create().component('input', { name: 'Text Input', renderer: MockInput });

/** Grabs `persistNow` from the flow context so a test can force a save. */
function PersistNowButton() {
  const { persistNow } = useFlow();
  return (
    <button
      type="button"
      data-testid="persist-now"
      onClick={() => {
        // saveWorkflowState rethrows after handleError; swallow it here so the
        // test observes the analytics side-effect, not an unhandled rejection.
        persistNow?.().catch(() => {});
      }}
    >
      Persist
    </button>
  );
}

/** Grabs `submitWorkflow` so a test can force a completion. */
function SubmitButton() {
  const { submitWorkflow } = useFlow();
  return (
    <button
      type="button"
      data-testid="submit"
      onClick={() => {
        // submitWorkflow rethrows after trackError; swallow so the test observes
        // the analytics side-effect, not an unhandled rejection.
        submitWorkflow?.().catch(() => {});
      }}
    >
      Submit
    </button>
  );
}

describe('Workflow analytics — every error path routes through trackError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await destroyGlobalMonitoring();
  });

  // --------------------------------------------------------------------------
  // 1 — a rejecting persistence adapter drives analytics.onError (was SILENT).
  // --------------------------------------------------------------------------

  it('routes a rejecting persistence save to analytics.onError AND the monitoring adapter', async () => {
    const onError = vi.fn();
    const monitorEvents: MonitoringEvent[] = [];
    initializeMonitoring({
      enabled: true,
      onEvent: (event) => monitorEvents.push(event),
    });

    const rejectingAdapter: WorkflowPersistenceAdapter = {
      save: () => Promise.reject(new Error('disk full')),
      load: () => Promise.resolve(null),
      remove: () => Promise.resolve(),
      exists: () => Promise.resolve(false),
    };

    const workflowConfig = flow
      .create(rilConfig, 'persist-onerror-wf', 'Persist onError WF')
      .addStep({
        id: 'only',
        title: 'Only',
        formConfig: form
          .create(rilConfig, 'only-form')
          .add({ id: 'name', type: 'input', props: { label: 'Name' } }),
      })
      .configure({
        analytics: { onError },
        persistence: { adapter: rejectingAdapter },
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <PersistNowButton />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('persist-now')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('persist-now'));
    });

    // analytics.onError sees the TYPED persistence error, with the exact wrapped
    // message the persistence layer builds, plus the workflow context.
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const [error, context] = onError.mock.calls[0] as [Error, WorkflowContext];
    expect(error).toBeInstanceOf(WorkflowPersistenceError);
    expect((error as WorkflowPersistenceError).code).toBe('OPERATION_FAILED');
    expect(error.message).toBe(
      '[WorkflowPersistence] Save failed: disk full (Code: OPERATION_FAILED)'
    );
    expect(context.workflowId).toBe('persist-onerror-wf');

    // ...and the monitoring adapter ALSO received it via trackError.
    const errorEvents = monitorEvents.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].source).toBe('workflow_persist-onerror-wf');
    expect(errorEvents[0].data.message).toBe(
      '[WorkflowPersistence] Save failed: disk full (Code: OPERATION_FAILED)'
    );
  });

  // --------------------------------------------------------------------------
  // 2 — a throwing onAfterValidation reaches BOTH sinks (proving trackError).
  // --------------------------------------------------------------------------

  it('routes a throwing onAfterValidation to analytics.onError AND the monitoring adapter', async () => {
    const onError = vi.fn();
    const monitorEvents: MonitoringEvent[] = [];
    initializeMonitoring({
      enabled: true,
      onEvent: (event) => monitorEvents.push(event),
    });

    const workflowConfig = flow
      .create(rilConfig, 'after-validation-wf', 'After validation WF')
      .addStep({
        id: 'first',
        title: 'First',
        formConfig: form
          .create(rilConfig, 'first-form')
          .add({ id: 'a', type: 'input', props: { label: 'A' } }),
        onAfterValidation: () => {
          throw new Error('onAfterValidation exploded');
        },
      })
      .addStep({
        id: 'second',
        title: 'Second',
        formConfig: form
          .create(rilConfig, 'second-form')
          .add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ analytics: { onError } })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton testId="next" />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('field-a')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    // analytics.onError fired with the exact thrown error (this already worked
    // via the direct call)...
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const [error, context] = onError.mock.calls[0] as [Error, WorkflowContext];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('onAfterValidation exploded');
    expect(context.workflowId).toBe('after-validation-wf');

    // ...and the monitoring adapter ALSO received it — the RED half before
    // wiring: the direct onError call never reached the monitor.
    const errorEvents = monitorEvents.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].source).toBe('workflow_after-validation-wf');
    expect(errorEvents[0].data.message).toBe('onAfterValidation exploded');

    // The transition was aborted — still on the first step.
    expect(screen.getByTestId('field-a')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // 3 — CONTROL: a normal validation block on Next does NOT fire onError.
  // --------------------------------------------------------------------------

  it('does NOT fire onError when a validation error blocks Next (normal UX, not an error path)', async () => {
    const onError = vi.fn();
    const monitorEvents: MonitoringEvent[] = [];
    initializeMonitoring({
      enabled: true,
      onEvent: (event) => monitorEvents.push(event),
    });

    // A field-level Standard Schema that fails while the field is empty, so
    // clicking Next is BLOCKED (a normal, expected UX outcome).
    const requiredSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) =>
          typeof value === 'string' && value.length > 0
            ? { value }
            : { issues: [{ message: 'Required' }] },
      },
    };

    const workflowConfig = flow
      .create(rilConfig, 'block-wf', 'Block WF')
      .addStep({
        id: 'first',
        title: 'First',
        formConfig: form.create(rilConfig, 'block-form').add({
          id: 'a',
          type: 'input',
          props: { label: 'A' },
          validation: { validate: requiredSchema },
        }),
      })
      .addStep({
        id: 'second',
        title: 'Second',
        formConfig: form
          .create(rilConfig, 'block-form-2')
          .add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ analytics: { onError } })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton testId="next" />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('field-a')).toBeInTheDocument());

    // Click Next with the required field EMPTY → validation blocks the transition.
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    // Still on the first step (the block worked)...
    await waitFor(() => expect(screen.getByTestId('field-a')).toBeInTheDocument());
    expect(screen.queryByTestId('field-b')).not.toBeInTheDocument();

    // ...and NEITHER sink saw an error: a validation block is not an error path.
    expect(onError).not.toHaveBeenCalled();
    expect(monitorEvents.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 4 — a throwing submission (onWorkflowComplete) reaches BOTH sinks. Covers
  // the SUBMISSION reroute site distinctly from the onAfterValidation one, so a
  // per-site revert to a direct onError call fails the monitor half here.
  // --------------------------------------------------------------------------

  it('routes a throwing submission to analytics.onError AND the monitoring adapter', async () => {
    const onError = vi.fn();
    const monitorEvents: MonitoringEvent[] = [];
    initializeMonitoring({
      enabled: true,
      onEvent: (event) => monitorEvents.push(event),
    });

    const workflowConfig = flow
      .create(rilConfig, 'submit-onerror-wf', 'Submit onError WF')
      .addStep({
        id: 'only',
        title: 'Only',
        formConfig: form
          .create(rilConfig, 'only-form')
          .add({ id: 'name', type: 'input', props: { label: 'Name' } }),
      })
      .configure({
        analytics: {
          onError,
          // Throws INSIDE the submission try → reaches the submission catch,
          // which routes through trackError.
          onWorkflowComplete: () => {
            throw new Error('submission exploded');
          },
        },
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <SubmitButton />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('submit')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const [error, context] = onError.mock.calls[0] as [Error, WorkflowContext];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('submission exploded');
    expect(context.workflowId).toBe('submit-onerror-wf');

    // The monitor ALSO received it — proving the submission catch routes through
    // trackError, not a direct onError call.
    const errorEvents = monitorEvents.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].source).toBe('workflow_submit-onerror-wf');
    expect(errorEvents[0].data.message).toBe('submission exploded');
  });
});
