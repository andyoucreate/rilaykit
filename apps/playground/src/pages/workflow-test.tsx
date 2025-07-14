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
  async,
  email,
  minLength,
  required,
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
  useWorkflowContext,
} from '@rilaykit/workflow';
import type React from 'react';
import { useState } from 'react';

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

const formBodyRenderer: FormBodyRenderer = (props: FormBodyRendererProps): React.ReactElement => {
  return <div className="space-y-4">{props.children}</div>;
};

const formSubmitButtonRenderer: FormSubmitButtonRenderer = (
  props: FormSubmitButtonRendererProps
): React.ReactElement => (
  <button
    type="submit"
    onClick={props.onSubmit}
    disabled={props.isSubmitting}
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
): React.ReactElement => {
  const { workflowState } = useWorkflowContext();

  return (
    <button
      type="submit"
      onClick={props.onSubmit}
      disabled={!props.canGoNext || workflowState.isSubmitting}
      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {props.children || (props.isLastStep ? 'Complete Workflow' : 'Next →')}
      {props.isSubmitting && ' ⏳'}
    </button>
  );
};

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
    validation: {
      validators: [email('Please enter a valid email address')],
    },
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
  })
  .configure({
    rowRenderer: formRowRenderer,
    bodyRenderer: formBodyRenderer,
    submitButtonRenderer: formSubmitButtonRenderer,
    stepperRenderer: workflowStepperRenderer,
    nextButtonRenderer: workflowNextButtonRenderer,
    previousButtonRenderer: workflowPreviousButtonRenderer,
    skipButtonRenderer: workflowSkipButtonRenderer,
  });

export default function WorkflowTestPage() {
  const [isCompleted, setIsCompleted] = useState(false);
  const [workflowData, setWorkflowData] = useState<Record<string, any>>({});

  // Build form configurations for each step
  const personalInfoForm = factory
    .form()
    .add(
      {
        id: 'firstName',
        type: 'text',
        props: { label: 'First Name' },
        validation: {
          validators: [required('First name is required'), minLength(2, 'Too short')],
        },
      },
      {
        id: 'lastName',
        type: 'text',
        props: { label: 'Last Name' },
        validation: {
          validators: [required('Last name is required'), minLength(2, 'Too short')],
        },
      }
    )
    .add({
      id: 'email',
      type: 'email', // This component already has email validation built-in
      props: { label: 'Email Address' },
      validation: {
        // Additional field-level validation combines with component validation
        validators: [required('Email is required')],
        validateOnBlur: true,
      },
    })
    .add({
      id: 'siren',
      type: 'text',
      props: { label: 'SIREN (French company number)', placeholder: 'Ex: 123456789' },
      validation: {
        validators: [
          required('SIREN is required'),
          (value) => {
            if (!/^\d{9}$/.test(value)) {
              return {
                isValid: false,
                errors: [{ message: 'SIREN must be 9 digits', code: 'INVALID_FORMAT' }],
              };
            }
            return { isValid: true, errors: [] };
          },
        ],
      },
    });

  const preferencesForm = factory
    .form()
    .add({
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
      validation: {
        validators: [
          required('Role is required'),
          async(async (value) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return value !== 'developer';
          }, 'Developer is not allowed'),
        ],
        validateOnBlur: true,
      },
    })
    .add({
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
      validation: {
        validators: [required('Experience is required')],
        validateOnBlur: true,
      },
    });

  const companyInfoForm = factory
    .form()
    .add({
      id: 'companyName',
      type: 'text',
      props: { label: 'Company Name' },
    })
    .add({
      id: 'companyAddress',
      type: 'text',
      props: { label: 'Company Address' },
    })
    .add({
      id: 'industry',
      type: 'select',
      props: {
        label: 'Industry',
        options: [
          { value: 'tech', label: 'Technology' },
          { value: 'finance', label: 'Finance' },
          { value: 'healthcare', label: 'Healthcare' },
          { value: 'education', label: 'Education' },
          { value: 'retail', label: 'Retail' },
          { value: 'manufacturing', label: 'Manufacturing' },
          { value: 'other', label: 'Other' },
        ],
      },
    });

  const reviewForm = factory.form().add({
    id: 'feedback',
    type: 'textarea',
    props: {
      label: 'Your Feedback',
      placeholder: 'Tell us about your experience with this workflow...',
    },
  });

  // Simulation d'un appel API pour récupérer les infos d'une entreprise par SIREN
  const fetchCompanyBySiren = async (siren: string) => {
    // Simulation d'un délai d'API
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Données simulées
    const mockCompanies: Record<string, any> = {
      '123456789': {
        name: 'Tech Innovation SAS',
        address: '123 Avenue des Champs-Élysées, 75008 Paris',
        industry: 'tech',
        legalForm: 'SAS',
        foundedYear: 2015,
      },
      '987654321': {
        name: 'Finance Pro SARL',
        address: '456 Rue de la Paix, 75001 Paris',
        industry: 'finance',
        legalForm: 'SARL',
        foundedYear: 2010,
      },
    };

    return (
      mockCompanies[siren] || {
        name: 'Unknown Company',
        address: 'Address not found',
        industry: 'other',
        legalForm: 'Unknown',
        foundedYear: new Date().getFullYear(),
      }
    );
  };

  // Build workflow configuration
  const workflowConfig = factory
    .flow(
      'user-onboarding',
      'User Onboarding Workflow',
      'A multi-step workflow to onboard new users with API integration'
    )
    .addStep({
      id: 'personal-info',
      title: 'Personal Information',
      description: 'Tell us about yourself and your company',
      allowSkip: false,
      formConfig: personalInfoForm,
      // 🎯 Exemple d'onAfterValidation avec appel API
      onAfterValidation: async (stepData, helper, _context) => {
        console.log('🔍 Personal info step validated, checking SIREN...', stepData);

        if (stepData.siren) {
          try {
            console.log('📡 Calling API for SIREN:', stepData.siren);
            const companyInfo = await fetchCompanyBySiren(stepData.siren);
            console.log('✅ Company info fetched:', companyInfo);

            // 🎯 Pré-remplir l'étape suivante avec les données de l'entreprise
            helper.setNextStepFields({
              companyName: companyInfo.name,
              companyAddress: companyInfo.address,
              industry: companyInfo.industry,
            });

            console.log('🎯 Next step pre-filled with company data');
          } catch (error) {
            console.error('❌ Failed to fetch company info:', error);
          }
        }
      },
      renderer: () => {
        return (
          <div className="flex-col gap-4 grid grid-cols-2">
            <FormField fieldId="firstName" className="" />
            <FormField fieldId="lastName" className="" />
            <FormField fieldId="email" className="" />
            <FormField fieldId="siren" className="" />
          </div>
        );
      },
    })
    .addStep({
      id: 'company-info',
      title: 'Company Information',
      description: 'Company details (auto-filled from SIREN)',
      formConfig: companyInfoForm,
    })
    .addStep({
      id: 'preferences',
      title: 'Preferences',
      description: 'Set your preferences',
      formConfig: preferencesForm,
    })
    .addStep({
      id: 'review',
      title: 'Review & Feedback',
      description: 'Review your information and provide feedback',
      allowSkip: true,
      formConfig: reviewForm,
    })
    .configure({
      analytics: {
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
                  🔙 Custom Previous
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
                    onClick={props.onSubmit}
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
        <h3 className="text-xl font-semibold text-gray-800 mb-4">🆕 Validation System Features:</h3>
        <p className="text-gray-700 mb-4">
          The new validation system combines component-level and field-level validation:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">Component-Level Validation</h4>
            <div className="bg-gray-100 p-3 rounded-lg text-sm mb-2">
              <code>{`addComponent('email', {
  validation: {
    validators: [email()],
    validateOnBlur: true
  }
})`}</code>
            </div>
            <p className="text-gray-600 text-sm">
              Built-in validation for all instances of this component.
            </p>
          </div>

          <div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">Field-Level Validation</h4>
            <div className="bg-gray-100 p-3 rounded-lg text-sm mb-2">
              <code>{`add({
  type: 'email',
  validation: {
    validators: [required()],
    validateOnChange: true
  }
})`}</code>
            </div>
            <p className="text-gray-600 text-sm">
              Additional validation specific to this field instance.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-lg font-medium text-gray-800 mb-2">Validation Features :</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="bg-white p-2 rounded border">✅ Component Defaults</div>
            <div className="bg-white p-2 rounded border">✅ Field Override</div>
            <div className="bg-white p-2 rounded border">✅ Zod Integration</div>
            <div className="bg-white p-2 rounded border">✅ Built-in Validators</div>
            <div className="bg-white p-2 rounded border">✅ onChange/onBlur</div>
            <div className="bg-white p-2 rounded border">✅ Async Validation</div>
            <div className="bg-white p-2 rounded border">✅ Cross-field</div>
            <div className="bg-white p-2 rounded border">✅ Debouncing</div>
          </div>
        </div>
      </div>

      <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">🚀 NEW: onAfterValidation Hook</h3>
        <p className="text-gray-700 mb-4">
          Execute custom logic after step validation and before moving to the next step. Perfect for
          API calls and data pre-filling!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">🎯 Use Cases</h4>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                Fetch company data from SIREN number
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                Auto-fill address from postal code
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                Calculate pricing based on selections
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                Validate data against external APIs
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">🛠️ Helper Methods</h4>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li className="flex items-start">
                <code className="bg-purple-100 px-2 py-1 rounded text-xs mr-2">
                  setNextStepFields()
                </code>
                <span>Pre-fill next step</span>
              </li>
              <li className="flex items-start">
                <code className="bg-purple-100 px-2 py-1 rounded text-xs mr-2">
                  setStepFields()
                </code>
                <span>Set data for any step</span>
              </li>
              <li className="flex items-start">
                <code className="bg-purple-100 px-2 py-1 rounded text-xs mr-2">getStepData()</code>
                <span>Read step data</span>
              </li>
              <li className="flex items-start">
                <code className="bg-purple-100 px-2 py-1 rounded text-xs mr-2">getAllData()</code>
                <span>Access all workflow data</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded-lg">
          <h4 className="text-lg font-medium text-gray-800 mb-2">📝 Example Implementation</h4>
          <div className="bg-gray-800 text-gray-100 p-3 rounded text-sm overflow-x-auto">
            <pre>{`onAfterValidation: async (stepData, helper, context) => {
  if (stepData.siren) {
    // 📡 API call
    const company = await fetchCompanyBySiren(stepData.siren);
    
    // 🎯 Pre-fill next step
    helper.setNextStepFields({
      companyName: company.name,
      address: company.address,
      industry: company.sector
    });
  }
}`}</pre>
          </div>
        </div>

        <div className="mt-4 p-3 bg-purple-100 rounded-lg">
          <p className="text-purple-800 text-sm">
            <strong>💡 Try it:</strong> Enter a SIREN number (123456789 or 987654321) in the first
            step and see how it auto-fills the company information step!
          </p>
        </div>
      </div>

      <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">🔧 Features being tested:</h3>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Multi-step workflow navigation with progress tracking
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Component-level + field-level validation combination
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Real-time validation feedback with error display
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
