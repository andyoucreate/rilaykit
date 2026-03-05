import { useState } from 'react';
import {
  Workflow,
  WorkflowBody,
  WorkflowStepper,
  WorkflowNextButton,
  WorkflowPreviousButton,
  required,
  minLength,
  when,
} from 'rilaykit';
import { r } from '@/lib/ril-config';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const accountTypeForm = r
  .form('account-type')
  .add({
    id: 'accountType',
    type: 'select',
    props: {
      label: 'Account Type',
      placeholder: 'Choose your account type',
      options: [
        { label: 'Personal', value: 'personal' },
        { label: 'Business', value: 'business' },
        { label: 'Enterprise', value: 'enterprise' },
      ],
    },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .add({ id: 'fullName', type: 'text', props: { label: 'Full Name' }, validation: { validate: [required()], validateOnBlur: true } })
  .build();

const companyDetailsForm = r
  .form('company-details')
  .add({ id: 'companyName', type: 'text', props: { label: 'Company Name' }, validation: { validate: [required()], validateOnBlur: true } })
  .add({ id: 'companySize', type: 'select', props: {
    label: 'Company Size',
    options: [
      { label: '1-10', value: '1-10' },
      { label: '11-50', value: '11-50' },
      { label: '51-200', value: '51-200' },
      { label: '200+', value: '200+' },
    ],
  }, validation: { validate: [required()], validateOnBlur: true } })
  .add({ id: 'website', type: 'text', props: { label: 'Website', placeholder: 'https://...' } })
  .build();

const enterpriseForm = r
  .form('enterprise-setup')
  .add({ id: 'contractId', type: 'text', props: { label: 'Contract ID', description: 'Your enterprise contract identifier' }, validation: { validate: [required()], validateOnBlur: true } })
  .add({ id: 'ssoProvider', type: 'select', props: {
    label: 'SSO Provider',
    options: [
      { label: 'Okta', value: 'okta' },
      { label: 'Azure AD', value: 'azure' },
      { label: 'Google Workspace', value: 'google' },
      { label: 'Custom SAML', value: 'saml' },
    ],
  }, validation: { validate: [required()], validateOnBlur: true } })
  .add({ id: 'adminEmail', type: 'email', props: { label: 'Admin Email' }, validation: { validate: [required()], validateOnBlur: true } })
  .build();

const confirmationForm = r
  .form('confirmation')
  .add({ id: 'agreeTerms', type: 'checkbox', props: { label: 'I agree to the terms and conditions' } })
  .build();

const conditionalFlow = r
  .flow('conditional', 'Account Setup', 'Setup your account with conditional steps')
  .step({ id: 'type', title: 'Account Type', description: 'Choose your account type', formConfig: accountTypeForm })
  .step({
    id: 'company',
    title: 'Company Details',
    description: 'Tell us about your company',
    formConfig: companyDetailsForm,
    conditions: {
      visible: when('accountType').in(['business', 'enterprise']).build(),
    },
  })
  .step({
    id: 'enterprise',
    title: 'Enterprise Setup',
    description: 'Configure enterprise features',
    formConfig: enterpriseForm,
    conditions: {
      visible: when('accountType').equals('enterprise').build(),
    },
  })
  .step({ id: 'confirm', title: 'Confirmation', description: 'Review and confirm', formConfig: confirmationForm })
  .build();

export function ConditionalStepsPage() {
  const [completedData, setCompletedData] = useState<Record<string, unknown> | null>(null);

  if (completedData) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Conditional Steps" description="Workflow completed!" />
        <Card>
          <CardHeader><CardTitle>Setup Complete</CardTitle></CardHeader>
          <CardContent>
            <pre className="rounded-md bg-muted p-4 text-sm">{JSON.stringify(completedData, null, 2)}</pre>
            <Button className="mt-4" onClick={() => setCompletedData(null)}>Start Over</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Conditional Steps"
        description="Steps that show/hide based on previous answers. Select 'Business' to see Company Details. Select 'Enterprise' to see both Company Details and Enterprise Setup."
      />
      <Card>
        <CardContent className="pt-6">
          <Workflow workflowConfig={conditionalFlow} onWorkflowComplete={(data) => setCompletedData(data)}>
            <WorkflowStepper />
            <div className="mt-6">
              <WorkflowBody />
            </div>
            <div className="mt-6 flex justify-between">
              <WorkflowPreviousButton />
              <WorkflowNextButton />
            </div>
          </Workflow>
        </CardContent>
      </Card>
    </div>
  );
}
