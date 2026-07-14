import { SubmitButton } from '@/components/chrome/submit-button';
import { PageHeader } from '@/components/layout/page-header';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { r } from '@/lib/ril-config';
import { useState } from 'react';
import { Form, FormBody, email, required, useFormStoreApi } from 'rilaykit';

const teamForm = r
  .form('team')
  .add({
    id: 'teamName',
    type: 'text',
    props: { label: 'Team Name', placeholder: 'Engineering Team' },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .addRepeatable('members', (rep) =>
    rep
      .add(
        {
          id: 'name',
          type: 'text',
          props: { label: 'Name', placeholder: 'Jane Doe' },
          validation: { validate: [required()], validateOnBlur: true },
        },
        {
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: { validate: [required(), email()], validateOnBlur: true },
        }
      )
      .add({
        id: 'role',
        type: 'select',
        props: {
          label: 'Role',
          options: [
            { label: 'Member', value: 'member' },
            { label: 'Lead', value: 'lead' },
            { label: 'Manager', value: 'manager' },
          ],
        },
        validation: { validate: [required()], validateOnBlur: true },
      })
      .min(1)
      .max(5)
      .defaultValue({ name: '', email: '', role: 'member' })
  )
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

export function RepeatableFieldsPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Repeatable Fields"
        description="Dynamic repeatable field groups using addRepeatable(). Add up to 5 team members with name, email, and role. Minimum 1 required."
      />
      <Card>
        <CardHeader>
          <CardTitle>Team Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <Form of={teamForm} onSubmit={(data) => setSubmittedData(data)}>
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
