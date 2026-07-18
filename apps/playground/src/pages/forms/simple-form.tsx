import { SubmitButton } from '@/components/chrome/submit-button';
import { PageHeader } from '@/components/layout/page-header';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { r } from '@/lib/ril-config';
import { useState } from 'react';
import { email, minLength, required } from 'rilaykit';
import { Form, FormBody, useFormStoreApi } from 'rilaykit/react';

const contactForm = r
  .form('contact')
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
    props: { label: 'Email', placeholder: 'john@example.com' },
    validation: { validate: [required(), email()], validateOnBlur: true },
  })
  .add({
    id: 'message',
    type: 'textarea',
    props: { label: 'Message', placeholder: 'Your message...', rows: 5 },
    validation: { validate: [required(), minLength(10)], validateOnBlur: true },
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

export function SimpleFormPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Simple Form"
        description="Basic contact form with field validation (required, email, minLength). Demonstrates the fluent builder API and built-in validators."
      />
      <Card>
        <CardHeader>
          <CardTitle>Contact Form</CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            of={contactForm}
            onSubmit={(data) => {
              setSubmittedData(data);
            }}
          >
            <FormInner />
          </Form>
        </CardContent>
      </Card>
      {submittedData && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Submitted Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md bg-muted p-4 text-sm">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
