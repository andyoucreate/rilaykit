import {
  type ComponentRenderProps,
  type ComponentRenderer,
  type FormBodyRenderer,
  type FormBodyRendererProps,
  type FormRowRenderer,
  type FormRowRendererProps,
  type FormSubmitButtonRenderer,
  type FormSubmitButtonRendererProps,
  type WorkflowNavigationRenderer,
  type WorkflowNavigationRendererProps,
  type WorkflowNextButtonRenderer,
  type WorkflowNextButtonRendererProps,
  type WorkflowPreviousButtonRenderer,
  type WorkflowPreviousButtonRendererProps,
  type WorkflowSkipButtonRenderer,
  type WorkflowSkipButtonRendererProps,
  type WorkflowStepperRenderer,
  type WorkflowStepperRendererProps,
  createZodValidator,
  ril,
} from '@rilaykit/core';
import { FormField, form } from '@rilaykit/forms';
import {
  RilayLicenseManager,
  Workflow,
  WorkflowBody,
  WorkflowNavigation,
  WorkflowStepper,
  flow,
} from '@rilaykit/workflow';
import Link from 'next/link';
import type React from 'react';
import { useState } from 'react';
import { z } from 'zod';

// Component interfaces
interface TextInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
}

interface EmailInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
}

interface SelectInputProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}

interface TextareaInputProps {
  label: string;
  placeholder?: string;
  rows?: number;
}

// Basic input components
const TextInput: React.FC<ComponentRenderProps<TextInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
      {renderProps.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={renderProps.id}
      type="text"
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      required={renderProps.props.required}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

const EmailInput: React.FC<ComponentRenderProps<EmailInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
      {renderProps.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={renderProps.id}
      type="email"
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      required={renderProps.props.required}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

const SelectInput: React.FC<ComponentRenderProps<SelectInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
      {renderProps.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <select
      id={renderProps.id}
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      required={renderProps.props.required}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    >
      <option value="">Select an option...</option>
      {renderProps.props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

const TextareaInput: React.FC<ComponentRenderProps<TextareaInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
    </label>
    <textarea
      id={renderProps.id}
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      rows={renderProps.props.rows || 4}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

// Custom renderers
const formRowRenderer: FormRowRenderer = (props: FormRowRendererProps): React.ReactElement => (
  <div
    className={`grid gap-4 mb-4 ${
      props.row.fields.length === 1
        ? 'grid-cols-1'
        : props.row.fields.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-3'
    }`}
  >
    {props.children}
  </div>
);

const formBodyRenderer: FormBodyRenderer = (props: FormBodyRendererProps): React.ReactElement => (
  <div className="space-y-4">{props.children}</div>
);

const formSubmitButtonRenderer: FormSubmitButtonRenderer = (
  props: FormSubmitButtonRendererProps
): React.ReactElement => (
  <button
    type="submit"
    onClick={props.onSubmit}
    disabled={props.isSubmitting || !props.isValid}
    className={`btn-primary w-full ${props.className || ''}`}
  >
    {props.isSubmitting ? 'Submitting...' : props.children || 'Continue'}
  </button>
);

// Workflow custom renderers
const workflowStepperRenderer: WorkflowStepperRenderer = (
  props: WorkflowStepperRendererProps
): React.ReactElement => (
  <div className="mb-8">
    <div className="flex items-center justify-between">
      {props.steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              index === props.currentStepIndex
                ? 'bg-blue-500 text-white'
                : props.visitedSteps.has(step.id)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
            }`}
          >
            {index + 1}
          </div>
          <div className="ml-2">
            <div className="text-sm font-medium text-gray-900">{step.title}</div>
            {step.description && <div className="text-xs text-gray-500">{step.description}</div>}
          </div>
          {index < props.steps.length - 1 && <div className="flex-1 h-px bg-gray-300 mx-4" />}
        </div>
      ))}
    </div>
  </div>
);

const workflowNavigationRenderer: WorkflowNavigationRenderer = (
  props: WorkflowNavigationRendererProps
): React.ReactElement => (
  <div className="flex justify-between mt-8 pt-6 border-t">
    <button
      type="button"
      onClick={props.onPrevious}
      disabled={!props.canGoPrevious}
      className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
    >
      ← Previous
    </button>

    <div className="flex space-x-3">
      {props.canSkip && (
        <button type="button" onClick={props.onSkip} className="btn-outline">
          Skip Step
        </button>
      )}

      {props.context.isLastStep ? (
        <button
          type="submit"
          onClick={props.onSubmit}
          disabled={!props.canGoNext || props.isSubmitting}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {props.isSubmitting ? 'Submitting...' : 'Complete Workflow'}
        </button>
      ) : (
        <button
          type="submit"
          onClick={props.onNext}
          disabled={!props.canGoNext}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      )}
    </div>
  </div>
);

// New individual button renderers
const workflowNextButtonRenderer: WorkflowNextButtonRenderer = (
  props: WorkflowNextButtonRendererProps
): React.ReactElement => (
  <button
    type="submit"
    onClick={props.isLastStep ? props.onSubmit : props.onNext}
    disabled={!props.canGoNext}
    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {props.children || (props.isLastStep ? 'Complete Workflow' : 'Next →')}
  </button>
);

const workflowPreviousButtonRenderer: WorkflowPreviousButtonRenderer = (
  props: WorkflowPreviousButtonRendererProps
): React.ReactElement => (
  <button
    type="button"
    onClick={props.onPrevious}
    disabled={!props.canGoPrevious}
    className={`btn-secondary disabled:opacity-50 disabled:cursor-not-allowed ${
      !props.canGoPrevious ? 'hidden' : ''
    }`}
  >
    {props.children || '← Previous'}
  </button>
);

const workflowSkipButtonRenderer: WorkflowSkipButtonRenderer = (
  props: WorkflowSkipButtonRendererProps
): React.ReactElement => (
  <button
    type="button"
    onClick={props.onSkip}
    disabled={!props.canSkip}
    className={`btn-outline ${!props.canSkip ? 'hidden' : ''}`}
  >
    {props.children || 'Skip Step'}
  </button>
);

RilayLicenseManager.setLicenseKey(process.env.NEXT_PUBLIC_RILAY_LICENSE_KEY!);

export default function WorkflowTestPage() {
  const [isCompleted, setIsCompleted] = useState(false);
  const [workflowData, setWorkflowData] = useState<Record<string, any>>({});

  // Create and configure ril
  const config = ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: TextInput as ComponentRenderer<TextInputProps>,
      defaultProps: { placeholder: 'Enter text...' },
      category: 'inputs',
    })
    .addComponent('email', {
      name: 'Email Input',
      renderer: EmailInput as ComponentRenderer<EmailInputProps>,
      defaultProps: { placeholder: 'Enter email...' },
      category: 'inputs',
    })
    .addComponent('select', {
      name: 'Select Input',
      renderer: SelectInput as ComponentRenderer<SelectInputProps>,
      defaultProps: { options: [] },
      category: 'inputs',
    })
    .addComponent('textarea', {
      name: 'Textarea Input',
      renderer: TextareaInput as ComponentRenderer<TextareaInputProps>,
      defaultProps: { placeholder: 'Enter text...', rows: 4 },
      category: 'inputs',
    });

  // Set custom renderers
  config
    .setRowRenderer(formRowRenderer)
    .setBodyRenderer(formBodyRenderer)
    .setSubmitButtonRenderer(formSubmitButtonRenderer)
    .setStepperRenderer(workflowStepperRenderer)
    .setWorkflowNavigationRenderer(workflowNavigationRenderer)
    .setWorkflowNextButtonRenderer(workflowNextButtonRenderer)
    .setWorkflowPreviousButtonRenderer(workflowPreviousButtonRenderer)
    .setWorkflowSkipButtonRenderer(workflowSkipButtonRenderer);

  // Define validation schemas
  const personalInfoSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
  });

  const preferencesSchema = z.object({
    role: z.string().min(1, 'Role is required'),
    experience: z.string().min(1, 'Experience level is required'),
  });

  const reviewSchema = z.object({
    feedback: z.string().min(10, 'Please provide at least 10 characters of feedback'),
  });

  // Build form configurations for each step
  const personalInfoForm = form
    .create(config)
    .addRowFields([
      {
        fieldId: 'firstName',
        componentType: 'text',
        props: { label: 'First Name', required: true },
        validation: { validator: createZodValidator(personalInfoSchema.shape.firstName) },
      },
      {
        fieldId: 'lastName',
        componentType: 'text',
        props: { label: 'Last Name', required: true },
        validation: { validator: createZodValidator(personalInfoSchema.shape.lastName) },
      },
    ])
    .addField(
      'email',
      'email',
      { label: 'Email Address', required: true },
      { validation: { validator: createZodValidator(personalInfoSchema.shape.email) } }
    )
    .build();

  const preferencesForm = form
    .create(config)
    .addField(
      'role',
      'select',
      {
        label: 'Your Role',
        required: true,
        options: [
          { value: 'developer', label: 'Developer' },
          { value: 'designer', label: 'Designer' },
          { value: 'manager', label: 'Product Manager' },
          { value: 'other', label: 'Other' },
        ],
      },
      { validation: { validator: createZodValidator(preferencesSchema.shape.role) } }
    )
    .addField(
      'experience',
      'select',
      {
        label: 'Experience Level',
        required: true,
        options: [
          { value: 'junior', label: 'Junior (0-2 years)' },
          { value: 'mid', label: 'Mid-level (2-5 years)' },
          { value: 'senior', label: 'Senior (5+ years)' },
        ],
      },
      { validation: { validator: createZodValidator(preferencesSchema.shape.experience) } }
    )
    .build();

  const reviewForm = form
    .create(config)
    .addField(
      'feedback',
      'textarea',
      {
        label: 'Your Feedback',
        placeholder: 'Tell us about your experience with this workflow...',
      },
      { validation: { validator: createZodValidator(reviewSchema.shape.feedback) } }
    )
    .build();

  // Build workflow configuration
  const workflowConfig = flow
    .create(
      config,
      'user-onboarding',
      'User Onboarding Workflow',
      'A multi-step workflow to onboard new users'
    )
    .addStep('personal-info', 'Personal Information', personalInfoForm, {
      description: 'Tell us about yourself',
      requiredToComplete: true,
      renderer: () => {
        return (
          <div className="flex-col gap-4 grid grid-cols-2">
            <FormField fieldId="firstName" />
            <FormField fieldId="lastName" />
            <FormField fieldId="email" />
          </div>
        );
      },
    })
    .addStep('preferences', 'Preferences', preferencesForm, {
      description: 'Set your preferences',
      requiredToComplete: true,
    })
    .addStep('review', 'Review & Feedback', reviewForm, {
      description: 'Review your information and provide feedback',
      allowSkip: true,
    })
    .setNavigation({
      allowBackNavigation: true,
      showProgress: true,
    })
    .setAnalytics({
      onWorkflowStart: (workflowId, context) => {
        console.log('Workflow started:', workflowId, context);
      },
      onStepStart: (stepId, timestamp, context) => {
        console.log('Step started:', stepId, timestamp, context);
      },
      onStepComplete: (stepId, duration, data, context) => {
        console.log('Step completed:', stepId, duration, data, context);
      },
      onWorkflowComplete: (workflowId, duration, data) => {
        console.log('Workflow completed:', workflowId, duration, data);
      },
    })
    .build();

  const handleWorkflowComplete = (data: Record<string, any>) => {
    console.log('Workflow completed with data:', data);
    setWorkflowData(data);
    setIsCompleted(true);
  };

  const handleStepChange = (fromStep: number, toStep: number) => {
    console.log(`Step changed from ${fromStep} to ${toStep}`);
  };

  if (isCompleted) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-primary hover:text-blue-600 text-sm font-medium">
            ← Back to Home
          </Link>
        </div>

        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Workflow Completed!</h1>
          <p className="text-gray-600 mb-8">Thank you for completing the onboarding workflow.</p>

          <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm text-left max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold mb-4">Collected Data:</h3>
            <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto">
              {JSON.stringify(workflowData, null, 2)}
            </pre>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={() => {
                setIsCompleted(false);
                setWorkflowData({});
              }}
              className="btn-primary"
            >
              Start Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-primary hover:text-blue-600 text-sm font-medium">
          ← Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-800 mb-4">🔀 Workflow Test</h1>
      <p className="text-gray-600 mb-8">
        This page demonstrates the features of the{' '}
        <code className="bg-gray-100 px-2 py-1 rounded text-sm">@rilaykit/workflow</code> package.
      </p>

      <div className="bg-white p-8 border border-gray-200 rounded-lg shadow-sm">
        <Workflow
          workflowConfig={workflowConfig}
          onWorkflowComplete={handleWorkflowComplete}
          onStepChange={handleStepChange}
          defaultValues={{}}
          user={{ name: 'Test User' }}
        >
          <WorkflowStepper />
          <WorkflowBody />

          {/* Traditional approach with WorkflowNavigation */}
          <WorkflowNavigation />

          {/* New decomposed approach - uncomment to test */}
          {/* 
          <div className="flex justify-between mt-8 pt-6 border-t">
            <WorkflowPreviousButton />
            <div className="flex space-x-3">
              <WorkflowSkipButton />
              <WorkflowNextButton />
            </div>
          </div>
          */}
        </Workflow>
      </div>

      <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">
          🆕 New Decomposed Button Components:
        </h3>
        <p className="text-gray-700 mb-4">
          The workflow navigation can now be composed using individual button components for maximum
          flexibility:
        </p>
        <div className="bg-gray-100 p-4 rounded-lg text-sm">
          <code>{`// Replace <WorkflowNavigation /> with:
<div className="flex justify-between mt-8 pt-6 border-t">
  <WorkflowPreviousButton />
  <div className="flex space-x-3">
    <WorkflowSkipButton />
    <WorkflowNextButton />
  </div>
</div>`}</code>
        </div>
        <p className="text-gray-600 text-sm mt-3">
          Each button component automatically handles its own visibility and state based on the
          workflow configuration.
        </p>
      </div>

      <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">🔧 Features being tested:</h3>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Multi-step workflow navigation with progress tracking
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Step validation with Zod schemas
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            LocalStorage data persistence between steps
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Analytics tracking (check console)
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Back navigation and step skipping
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Custom workflow and form renderers
          </li>
        </ul>
      </div>
    </div>
  );
}
