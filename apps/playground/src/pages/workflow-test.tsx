import {
  type ComponentRenderProps,
  type ComponentRenderer,
  type FormBodyRenderer,
  type FormBodyRendererProps,
  type FormRowRenderer,
  type FormRowRendererProps,
  type FormSubmitButtonRenderer,
  type FormSubmitButtonRendererProps,
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
import { FormField } from '@rilaykit/forms';
import {
  RilayLicenseManager,
  Workflow,
  WorkflowBody,
  WorkflowNextButton,
  WorkflowPreviousButton,
  WorkflowSkipButton,
  WorkflowStepper,
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

// New individual button renderers - children is always React.ReactNode
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
  const factory = ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: TextInput as ComponentRenderer<TextInputProps>,
      defaultProps: { placeholder: 'Enter text...' },
    })
    .addComponent('email', {
      name: 'Email Input',
      renderer: EmailInput as ComponentRenderer<EmailInputProps>,
      defaultProps: { placeholder: 'Enter email...' },
    })
    .addComponent('select', {
      name: 'Select Input',
      renderer: SelectInput as ComponentRenderer<SelectInputProps>,
      defaultProps: { options: [] },
    })
    .addComponent('textarea', {
      name: 'Textarea Input',
      renderer: TextareaInput as ComponentRenderer<TextareaInputProps>,
      defaultProps: { placeholder: 'Enter text...', rows: 4 },
    });

  // Set custom renderers
  factory
    .setRowRenderer(formRowRenderer)
    .setBodyRenderer(formBodyRenderer)
    .setSubmitButtonRenderer(formSubmitButtonRenderer)
    .setStepperRenderer(workflowStepperRenderer)
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
  const personalInfoForm = factory
    .createForm()
    .addRowFields([
      {
        id: 'firstName',
        type: 'text',
        props: { label: 'First Name', required: true },
        validation: { validator: createZodValidator(personalInfoSchema.shape.firstName) },
      },
      {
        id: 'lastName',
        type: 'text',
        props: { label: 'Last Name', required: true },
        validation: { validator: createZodValidator(personalInfoSchema.shape.lastName) },
      },
    ])
    .addField({
      id: 'email',
      type: 'email',
      props: { label: 'Email Address', required: true },
      validation: { validator: createZodValidator(personalInfoSchema.shape.email) },
    });

  const preferencesForm = factory
    .createForm()
    .addField({
      id: 'role',
      type: 'select',
      props: {
        label: 'Your Role',
        required: true,
        options: [
          { value: 'developer', label: 'Developer' },
          { value: 'designer', label: 'Designer' },
          { value: 'manager', label: 'Product Manager' },
          { value: 'other', label: 'Other' },
        ],
      },
      validation: { validator: createZodValidator(preferencesSchema.shape.role) },
    })
    .addField({
      id: 'experience',
      type: 'select',
      props: {
        label: 'Experience Level',
        required: true,
        options: [
          { value: 'junior', label: 'Junior (0-2 years)' },
          { value: 'mid', label: 'Mid-level (2-5 years)' },
          { value: 'senior', label: 'Senior (5+ years)' },
        ],
      },
      validation: { validator: createZodValidator(preferencesSchema.shape.experience) },
    });

  const reviewForm = factory.createForm().addField({
    id: 'feedback',
    type: 'textarea',
    props: {
      label: 'Your Feedback',
      placeholder: 'Tell us about your experience with this workflow...',
    },
    validation: { validator: createZodValidator(reviewSchema.shape.feedback) },
  });

  // Build workflow configuration
  const workflowConfig = factory
    .createFlow(
      'user-onboarding',
      'User Onboarding Workflow',
      'A multi-step workflow to onboard new users'
    )
    .addStep({
      id: 'personal-info',
      title: 'Personal Information',
      description: 'Tell us about yourself',
      requiredToComplete: true,
      formConfig: personalInfoForm,
      renderer: () => {
        return (
          <div className="flex-col gap-4 grid grid-cols-2">
            <FormField fieldId="firstName" className="" />
            <FormField fieldId="lastName" className="" />
            <FormField fieldId="email" className="" />
          </div>
        );
      },
    })
    .addStep({
      id: 'preferences',
      title: 'Preferences',
      description: 'Set your preferences',
      requiredToComplete: true,
      formConfig: preferencesForm,
    })
    .addStep({
      id: 'review',
      title: 'Review & Feedback',
      description: 'Review your information and provide feedback',
      allowSkip: true,
      formConfig: reviewForm,
    })
    .setNavigation({
      allowBackNavigation: true,
      showProgress: true,
    })
    .setAnalytics({
      onWorkflowStart: (workflowId: string, context: any) => {
        console.log('Workflow started:', workflowId, context);
      },
      onStepStart: (stepId: string, timestamp: number, context: any) => {
        console.log('Step started:', stepId, timestamp, context);
      },
      onStepComplete: (stepId: string, duration: number, data: any, context: any) => {
        console.log('Step completed:', stepId, duration, data, context);
      },
      onWorkflowComplete: (workflowId: string, duration: number, data: any) => {
        console.log('Workflow completed:', workflowId, duration, data);
      },
    });

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
          {/* <WorkflowNavigation /> */}

          {/* New decomposed approach with renderAs examples */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <WorkflowPreviousButton>
              {(props) => <span>⬅️ {props.canGoPrevious ? 'Retour' : 'Pas de retour'}</span>}
            </WorkflowPreviousButton>
            <div className="flex space-x-3">
              <WorkflowSkipButton>
                {(props) => <span>{props.canSkip ? '⏭️ Passer' : '🚫 Obligatoire'}</span>}
              </WorkflowSkipButton>
              <WorkflowNextButton>
                {(props) => (
                  <span>
                    {props.isLastStep ? '🎉 Terminer' : '➡️ Continuer'}
                    {props.isSubmitting && ' ⏳'}
                  </span>
                )}
              </WorkflowNextButton>
            </div>
          </div>

          {/* Alternative with renderAs="children" for completely custom rendering */}
          <div className="flex justify-between mt-4 pt-4 border-t border-dashed">
            <WorkflowPreviousButton renderAs="children">
              {(props) => (
                <button
                  type="button"
                  onClick={props.onPrevious}
                  disabled={!props.canGoPrevious}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔙 Custom Previous ({props.context.currentStepIndex + 1}/
                  {props.context.totalSteps})
                </button>
              )}
            </WorkflowPreviousButton>
            <div className="flex space-x-3">
              <WorkflowSkipButton renderAs="children">
                {(props) =>
                  props.canSkip ? (
                    <button
                      type="button"
                      onClick={props.onSkip}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg"
                    >
                      ⚡ Skip This Step
                    </button>
                  ) : null
                }
              </WorkflowSkipButton>
              <WorkflowNextButton renderAs="children">
                {(props) => (
                  <button
                    type="submit"
                    onClick={props.isLastStep ? props.onSubmit : props.onNext}
                    disabled={!props.canGoNext}
                    className={`px-6 py-2 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                      props.isLastStep ? 'bg-green-600' : 'bg-blue-600'
                    }`}
                  >
                    {props.isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      <span>
                        {props.isLastStep
                          ? '✅ Complete Workflow'
                          : `➡️ Next Step (${props.context.currentStepIndex + 2}/${props.context.totalSteps})`}
                      </span>
                    )}
                  </button>
                )}
              </WorkflowNextButton>
            </div>
          </div>

          {/* Example of custom stepper with renderAs */}
          <div className="mt-4 pt-4 border-t border-dashed">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Custom Stepper Example:</h4>
            <WorkflowStepper renderAs="children">
              {(props) => (
                <div className="flex items-center justify-center space-x-2 mb-4">
                  {props.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center">
                      <button
                        type="button"
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-colors border-0 ${
                          index === props.currentStepIndex
                            ? 'bg-blue-600 text-white'
                            : props.visitedSteps.has(step.id)
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-200 text-gray-600'
                        }`}
                        onClick={() => props.onStepClick?.(index)}
                      >
                        {index + 1}
                      </button>
                      {index < props.steps.length - 1 && (
                        <div className="w-8 h-0.5 bg-gray-200 mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </WorkflowStepper>
          </div>
        </Workflow>
      </div>

      <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">
          🎨 Nouvelle fonctionnalité: renderAs pour tous les composants
        </h3>
        <p className="text-gray-700 mb-4">
          Tous les composants supportent maintenant deux approches pour personnaliser le rendu :
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">
              1. Function Children (défaut)
            </h4>
            <div className="bg-gray-100 p-3 rounded-lg text-sm mb-2">
              <code>{`<WorkflowNextButton>
  {(props) => (
    <span>
      {props.isLastStep ? '🎉 Terminer' : '➡️ Continuer'} 
    </span>
  )}
</WorkflowNextButton>`}</code>
            </div>
            <p className="text-gray-600 text-sm">
              Utilise le renderer configuré + children personnalisés.
            </p>
          </div>

          <div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">
              2. Custom Renderer (renderAs="children")
            </h4>
            <div className="bg-gray-100 p-3 rounded-lg text-sm mb-2">
              <code>{`<WorkflowNextButton renderAs="children">
  {(props) => (
    <button onClick={props.onNext}>
      Custom Button
    </button>
  )}
</WorkflowNextButton>`}</code>
            </div>
            <p className="text-gray-600 text-sm">Remplace complètement le renderer par défaut.</p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-lg font-medium text-gray-800 mb-2">Composants supportés :</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="bg-white p-2 rounded border">✅ WorkflowNextButton</div>
            <div className="bg-white p-2 rounded border">✅ WorkflowPreviousButton</div>
            <div className="bg-white p-2 rounded border">✅ WorkflowSkipButton</div>
            <div className="bg-white p-2 rounded border">✅ WorkflowStepper</div>
            <div className="bg-white p-2 rounded border">✅ FormSubmitButton</div>
            <div className="bg-white p-2 rounded border">✅ FormBody</div>
            <div className="bg-white p-2 rounded border">✅ FormRow</div>
            <div className="bg-white p-2 rounded border">🔄 Plus à venir...</div>
          </div>
        </div>
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
