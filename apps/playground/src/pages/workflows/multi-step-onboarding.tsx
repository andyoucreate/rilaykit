import { NextButton } from '@/components/chrome/next-button';
import { PreviousButton } from '@/components/chrome/previous-button';
import { Stepper } from '@/components/chrome/stepper';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { r } from '@/lib/ril-config';
import { useState } from 'react';
import { Flow, LocalStorageAdapter, email, minLength, required } from 'rilaykit';

const personalInfoForm = r
  .form('personal-info')
  .add(
    {
      id: 'firstName',
      type: 'text',
      props: { label: 'First Name', placeholder: 'John' },
      validation: { validate: [required(), minLength(2)], validateOnBlur: true },
    },
    {
      id: 'lastName',
      type: 'text',
      props: { label: 'Last Name', placeholder: 'Doe' },
      validation: { validate: [required(), minLength(2)], validateOnBlur: true },
    }
  )
  .add({
    id: 'email',
    type: 'email',
    props: { label: 'Email' },
    validation: { validate: [required(), email()], validateOnBlur: true },
  })
  .build();

const accountSetupForm = r
  .form('account-setup')
  .add({
    id: 'username',
    type: 'text',
    props: { label: 'Username', placeholder: 'johndoe' },
    validation: { validate: [required(), minLength(3)], validateOnBlur: true },
  })
  .add(
    {
      id: 'password',
      type: 'text',
      props: { label: 'Password', placeholder: '••••••••' },
      validation: { validate: [required(), minLength(8)], validateOnBlur: true },
    },
    {
      id: 'confirmPassword',
      type: 'text',
      props: { label: 'Confirm Password' },
      validation: { validate: [required()], validateOnBlur: true },
    }
  )
  .build();

const preferencesForm = r
  .form('preferences')
  .add({
    id: 'theme',
    type: 'select',
    props: {
      label: 'Theme',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'System', value: 'system' },
      ],
    },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .add({ id: 'notifications', type: 'switch', props: { label: 'Enable notifications' } })
  .add({
    id: 'language',
    type: 'select',
    props: {
      label: 'Language',
      options: [
        { label: 'English', value: 'en' },
        { label: 'French', value: 'fr' },
        { label: 'German', value: 'de' },
        { label: 'Spanish', value: 'es' },
      ],
    },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .build();

const reviewForm = r.form('review').build();

const onboardingFlow = r
  .flow('onboarding', 'User Onboarding', 'Complete your account setup')
  .step({
    id: 'personal',
    title: 'Personal Info',
    description: 'Tell us about yourself',
    formConfig: personalInfoForm,
  })
  .step({
    id: 'account',
    title: 'Account Setup',
    description: 'Create your credentials',
    formConfig: accountSetupForm,
  })
  .step({
    id: 'preferences',
    title: 'Preferences',
    description: 'Customize your experience',
    formConfig: preferencesForm,
  })
  .step({
    id: 'review',
    title: 'Review',
    description: 'Confirm your details',
    formConfig: reviewForm,
  })
  .configure({
    persistence: {
      adapter: new LocalStorageAdapter({ keyPrefix: 'rilaykit_playground_' }),
    },
  })
  .build();

export function MultiStepOnboardingPage() {
  const [completedData, setCompletedData] = useState<Record<string, unknown> | null>(null);

  if (completedData) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Multi-step Onboarding" description="Workflow completed successfully!" />
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md bg-muted p-4 text-sm">
              {JSON.stringify(completedData, null, 2)}
            </pre>
            <Button className="mt-4" onClick={() => setCompletedData(null)}>
              Start Over
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Multi-step Onboarding"
        description="4-step workflow with a stepper, navigation buttons, and localStorage persistence. Refresh the page to see your progress restored."
      />
      <Card>
        <CardContent className="pt-6">
          <Flow of={onboardingFlow} onComplete={(data) => setCompletedData(data)}>
            <Stepper />
            <div className="mt-6">
              <Flow.Body />
            </div>
            <div className="mt-6 flex justify-between">
              <PreviousButton />
              <NextButton />
            </div>
          </Flow>
        </CardContent>
      </Card>
    </div>
  );
}
