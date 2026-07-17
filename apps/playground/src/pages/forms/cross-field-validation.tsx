import { SubmitButton } from '@/components/chrome/submit-button';
import { PageHeader } from '@/components/layout/page-header';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { r } from '@/lib/ril-config';
import { useState } from 'react';
import { custom, minLength, required } from 'rilaykit';
import { Form, FormBody, useFormStoreApi } from 'rilaykit/react';

const crossValidationForm = r
  .form('cross-validation')
  .add(
    {
      id: 'password',
      type: 'text',
      props: { label: 'Password', placeholder: 'Enter password' },
      validation: { validate: [required(), minLength(8)], validateOnBlur: true },
    },
    {
      id: 'confirmPassword',
      type: 'text',
      props: { label: 'Confirm Password', placeholder: 'Re-enter password' },
      validation: { validate: [required()], validateOnBlur: true },
    }
  )
  .add(
    {
      id: 'startDate',
      type: 'date',
      props: { label: 'Start Date' },
      validation: { validate: [required()], validateOnBlur: true },
    },
    {
      id: 'endDate',
      type: 'date',
      props: { label: 'End Date' },
      validation: { validate: [required()], validateOnBlur: true },
    }
  )
  .add(
    {
      id: 'contactEmail',
      type: 'email',
      props: { label: 'Email (optional)', description: 'Provide at least one contact method' },
    },
    {
      id: 'contactPhone',
      type: 'text',
      props: {
        label: 'Phone (optional)',
        description: 'Provide at least one contact method',
        placeholder: '+1 555-0000',
      },
    }
  )
  .setValidation({
    validate: custom<Record<string, unknown>>((data) => {
      // Password match
      if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
        return false;
      }
      // Date order
      if (data.startDate && data.endDate && data.startDate > data.endDate) {
        return false;
      }
      // At least one contact
      if (!data.contactEmail && !data.contactPhone) {
        return false;
      }
      return true;
    }, 'Passwords must match, end date must be after start date, and at least one contact method is required.'),
    validateOnSubmit: true,
  })
  .build();

function FormInner() {
  const storeApi = useFormStoreApi();
  return (
    <InspectorStoreProvider store={storeApi}>
      <FormBody />
      <div className="mt-6">
        <SubmitButton />
      </div>
    </InspectorStoreProvider>
  );
}

export function CrossFieldValidationPage() {
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Cross-field Validation"
        description="Form-level validation with custom() validators. Password match, date ordering, and 'at least one contact method' rules — validated on submit."
      />
      <Card>
        <CardHeader>
          <CardTitle>Registration Form</CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            of={crossValidationForm}
            onSubmit={(data) => setResult(JSON.stringify(data, null, 2))}
          >
            <FormInner />
          </Form>
        </CardContent>
      </Card>
      {result && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Success!</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md bg-muted p-4 text-sm">{result}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
