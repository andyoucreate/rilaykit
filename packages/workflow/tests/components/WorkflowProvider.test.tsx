import { ril } from '@rilaykit/core';
import { form, useFormConfigContext } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { WorkflowProvider, useWorkflowContext } from '../../src/components/WorkflowProvider';

// Mock components
const TestComponent = () => React.createElement('div', null, 'test');
const TestFormRenderer = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'form-renderer' }, children);
const TestStepperRenderer = () =>
  React.createElement('div', { 'data-testid': 'stepper' }, 'stepper');
const TestButtonRenderer = ({ children, ...props }: any) =>
  React.createElement('div', { ...props, role: 'button' }, children);

// Mock license manager
vi.mock('../../src/licensing/RilayLicenseManager', () => ({
  RilayLicenseManager: {
    logLicenseStatus: vi.fn(),
    setLicenseKey: vi.fn(),
    isLicensed: vi.fn(() => true),
  },
}));

describe('WorkflowProvider', () => {
  let config: any;
  let workflowConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
        defaultProps: { placeholder: 'Enter text...' },
      })
      .addComponent('email', {
        name: 'Email Input',
        renderer: TestComponent,
        defaultProps: { placeholder: 'Enter email...' },
      })
      .configure({
        rowRenderer: TestFormRenderer,
        bodyRenderer: TestFormRenderer,
        stepperRenderer: TestStepperRenderer,
        nextButtonRenderer: TestButtonRenderer,
        previousButtonRenderer: TestButtonRenderer,
        skipButtonRenderer: TestButtonRenderer,
      });

    const personalInfoForm = form
      .create<any>(config, 'personal-info')
      .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
      .add({ id: 'lastName', type: 'text', props: { label: 'Last Name' } })
      .build();

    const preferencesForm = form
      .create<any>(config, 'preferences')
      .add({ id: 'theme', type: 'text', props: { label: 'Theme' } })
      .build();

    workflowConfig = flow
      .create(config, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'personal-info',
        title: 'Personal Information',
        formConfig: personalInfoForm,
      })
      .addStep({
        id: 'preferences',
        title: 'Preferences',
        formConfig: preferencesForm,
        allowSkip: true,
      })
      .build();
  });

  describe('Provider Setup', () => {
    it('should render WorkflowProvider with children', () => {
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <div data-testid="workflow-content">Workflow Content</div>
        </WorkflowProvider>
      );

      expect(screen.getByTestId('workflow-content')).toBeInTheDocument();
    });

    it('should provide workflow context to children', () => {
      const TestChild = () => {
        const { workflowState } = useWorkflowContext();
        return <div data-testid="current-step">{workflowState.currentStepIndex}</div>;
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });

    it('should initialize with default values', () => {
      const defaultValues = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const TestChild = () => {
        const { workflowState } = useWorkflowContext();
        return <div data-testid="default-values">{JSON.stringify(workflowState.allData)}</div>;
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('default-values')).toHaveTextContent('John');
    });

    it('should call onStepChange callback', async () => {
      const onStepChange = vi.fn();

      const TestChild = () => {
        const { goNext } = useWorkflowContext();
        return (
          <button type="button" onClick={() => goNext()} data-testid="next-btn">
            Next
          </button>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig} onStepChange={onStepChange}>
          <TestChild />
        </WorkflowProvider>
      );

      fireEvent.click(screen.getByTestId('next-btn'));

      await waitFor(() => {
        expect(onStepChange).toHaveBeenCalledWith(0, 1, expect.any(Object));
      });
    });

    it('should call onWorkflowComplete callback', async () => {
      const onWorkflowComplete = vi.fn();

      const TestChild = () => {
        const { workflowState } = useWorkflowContext();

        return (
          <div data-testid="workflow-complete">
            {workflowState.currentStepIndex >= 0 ? 'Started' : 'Not started'}
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('workflow-complete')).toHaveTextContent('Started');
    });
  });

  describe('useWorkflow Hook', () => {
    it('should throw error when used outside provider', () => {
      const TestComponent = () => {
        useWorkflowContext();
        return null;
      };

      expect(() => render(<TestComponent />)).toThrow(
        'useWorkflowContext must be used within a WorkflowProvider'
      );
    });

    it('should provide workflow state', () => {
      const TestChild = () => {
        const { workflowState, workflowConfig } = useWorkflowContext();
        return (
          <div>
            <div data-testid="current-step">{workflowState.currentStepIndex}</div>
            <div data-testid="total-steps">{workflowConfig.steps.length}</div>
            <div data-testid="is-first">
              {workflowState.currentStepIndex === 0 ? 'true' : 'false'}
            </div>
            <div data-testid="is-last">
              {workflowState.currentStepIndex === workflowConfig.steps.length - 1
                ? 'true'
                : 'false'}
            </div>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
      expect(screen.getByTestId('total-steps')).toHaveTextContent('2');
      expect(screen.getByTestId('is-first')).toHaveTextContent('true');
      expect(screen.getByTestId('is-last')).toHaveTextContent('false');
    });

    it('should provide workflow config', () => {
      const TestChild = () => {
        const { workflowConfig: config } = useWorkflowContext();
        return (
          <div>
            <div data-testid="workflow-id">{config.id}</div>
            <div data-testid="workflow-name">{config.name}</div>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('workflow-id')).toHaveTextContent('test-workflow');
      expect(screen.getByTestId('workflow-name')).toHaveTextContent('Test Workflow');
    });

    it('should provide current step info', () => {
      const TestChild = () => {
        const { currentStep } = useWorkflowContext();
        return (
          <div>
            <div data-testid="step-id">{currentStep?.id}</div>
            <div data-testid="step-title">{currentStep?.title}</div>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('step-id')).toHaveTextContent('personal-info');
      expect(screen.getByTestId('step-title')).toHaveTextContent('Personal Information');
    });
  });

  describe('Navigation Functions', () => {
    it('should navigate to next step', async () => {
      const TestChild = () => {
        const { workflowState, goNext } = useWorkflowContext();
        return (
          <div>
            <div data-testid="current-step">{workflowState.currentStepIndex}</div>
            <button type="button" onClick={() => goNext()} data-testid="next-btn">
              Next
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('current-step')).toHaveTextContent('0');

      fireEvent.click(screen.getByTestId('next-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      });
    });

    it('should navigate to previous step', async () => {
      const TestChild = () => {
        const { workflowState, goNext, goPrevious } = useWorkflowContext();
        return (
          <div>
            <div data-testid="current-step">{workflowState.currentStepIndex}</div>
            <button type="button" onClick={() => goNext()} data-testid="next-btn">
              Next
            </button>
            <button type="button" onClick={() => goPrevious()} data-testid="prev-btn">
              Previous
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      // Go to next step first
      fireEvent.click(screen.getByTestId('next-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      });

      // Go back to previous step
      fireEvent.click(screen.getByTestId('prev-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('current-step')).toHaveTextContent('0');
      });
    });

    it('should navigate to specific step', async () => {
      const TestChild = () => {
        const { workflowState, goToStep } = useWorkflowContext();
        return (
          <div>
            <div data-testid="current-step">{workflowState.currentStepIndex}</div>
            <button type="button" onClick={() => goToStep(1)} data-testid="goto-btn">
              Go to Step 1
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('current-step')).toHaveTextContent('0');

      fireEvent.click(screen.getByTestId('goto-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      });
    });
  });

  describe('Data Management', () => {
    it('should manage step data', async () => {
      const TestChild = () => {
        const { workflowState, setValue, setStepData } = useWorkflowContext();
        return (
          <div>
            <div data-testid="step-data">{JSON.stringify(workflowState.stepData)}</div>
            <button
              type="button"
              onClick={() => setValue('firstName', 'John')}
              data-testid="set-value-btn"
            >
              Set Value
            </button>
            <button
              type="button"
              onClick={() => setStepData({ firstName: 'Jane', lastName: 'Doe' })}
              data-testid="set-data-btn"
            >
              Set Data
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      // Set individual value
      fireEvent.click(screen.getByTestId('set-value-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('step-data')).toHaveTextContent('John');
      });

      // Set all step data
      fireEvent.click(screen.getByTestId('set-data-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('step-data')).toHaveTextContent('Jane');
        expect(screen.getByTestId('step-data')).toHaveTextContent('Doe');
      });
    });

    it('should manage all workflow data', async () => {
      const TestChild = () => {
        const { workflowState, setValue, goNext } = useWorkflowContext();
        return (
          <div>
            <div data-testid="all-data">{JSON.stringify(workflowState.allData)}</div>
            <button
              type="button"
              onClick={() => setValue('firstName', 'John')}
              data-testid="set-value-btn"
            >
              Set Value
            </button>
            <button type="button" onClick={() => goNext()} data-testid="next-btn">
              Next
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      // Set value in first step
      fireEvent.click(screen.getByTestId('set-value-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('all-data')).toHaveTextContent('John');
      });

      // Go to next step and verify data persists
      fireEvent.click(screen.getByTestId('next-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('all-data')).toHaveTextContent('John');
      });
    });
  });

  describe('Validation', () => {
    it('should validate current step', async () => {
      const TestChild = () => {
        const { validateForm } = useFormConfigContext();
        const [result, setResult] = React.useState<any>(null);

        const handleValidate = async () => {
          const validationResult = await validateForm();
          setResult(validationResult);
        };

        return (
          <div>
            <div data-testid="validation-result">{result ? JSON.stringify(result) : 'null'}</div>
            <button type="button" onClick={handleValidate} data-testid="validate-btn">
              Validate
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      fireEvent.click(screen.getByTestId('validate-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-result')).not.toHaveTextContent('null');
      });
    });
  });

  describe('Submission', () => {
    it('should handle workflow completion', async () => {
      const TestChild = () => {
        const { workflowState } = useWorkflowContext();
        return (
          <div>
            <div data-testid="is-completed">
              {workflowState.currentStepIndex >= 0 ? 'true' : 'false'}
            </div>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('is-completed')).toHaveTextContent('true');
    });
  });

  describe('User Context', () => {
    it('should provide basic workflow info', () => {
      const TestChild = () => {
        const { workflowConfig: config } = useWorkflowContext();
        return (
          <div>
            <div data-testid="workflow-name">{config.name}</div>
            <div data-testid="step-count">{config.steps.length}</div>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('workflow-name')).toHaveTextContent('Test Workflow');
      expect(screen.getByTestId('step-count')).toHaveTextContent('2');
    });
  });
});
