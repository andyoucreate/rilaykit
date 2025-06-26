import type { StepConfig, StepRenderProps } from '@streamline/core';
import { FormProvider } from '@streamline/form-builder';
import React from 'react';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowStepProps {
  step: StepConfig;
}

export function WorkflowStep({ step }: WorkflowStepProps) {
  const {
    workflowConfig,
    context,
    workflowState,
    setValue,
    goNext,
    goPrevious,
    skipStep,
    submitWorkflow,
  } = useWorkflowContext();

  // Check if step should be rendered based on conditional logic
  const shouldShow = React.useMemo(() => {
    if (!step.conditional) return true;

    try {
      return step.conditional.condition(context.allData, context);
    } catch (error) {
      console.warn(`Conditional evaluation failed for step "${step.id}":`, error);
      return true;
    }
  }, [step.conditional, step.id, context]);

  // Don't render if hidden by conditional
  if (!shouldShow && step.conditional?.action === 'hide') {
    return null;
  }

  // Use step renderer from StreamlineConfig
  const stepRenderer = workflowConfig.renderConfig?.stepRenderer ?? step.customRenderer;

  if (!stepRenderer) {
    throw new Error(
      `No stepRenderer configured for workflow "${workflowConfig.id}". Please configure a stepRenderer using config.setStepRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  // Handle field value changes
  const handleFieldChange = (fieldId: string, value: any) => {
    setValue(fieldId, value);
  };

  // Handle navigation actions
  const handleNext = () => {
    if (context.isLastStep) {
      submitWorkflow();
    } else {
      goNext();
    }
  };

  const handleSkip = () => {
    skipStep();
  };

  // Prepare props for the step renderer
  const stepRenderProps: StepRenderProps = {
    step,
    formConfig: step.formConfig, // Use the form config from the step directly
    formData: context.allData,
    errors: workflowState.errors,
    onFieldChange: handleFieldChange,
    onNext: handleNext,
    onPrevious: goPrevious,
    onSkip: step.allowSkip ? handleSkip : undefined,
    isFirstStep: context.isFirstStep,
    isLastStep: context.isLastStep,
    currentStepIndex: context.currentStepIndex,
    totalSteps: context.totalSteps,
    context,
  };

  return (
    <FormProvider
      formConfig={step.formConfig}
      onSubmit={handleNext}
      defaultValues={context.allData}
      onFieldChange={handleFieldChange}
    >
      {stepRenderer(stepRenderProps)}
    </FormProvider>
  );
}

export default WorkflowStep;
