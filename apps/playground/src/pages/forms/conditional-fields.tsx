import { SubmitButton } from '@/components/chrome/submit-button';
import { PageHeader } from '@/components/layout/page-header';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { r } from '@/lib/ril-config';
import { Form, FormBody, email, required, useFormStoreApi, when } from 'rilaykit';

const conditionalForm = r
  .form('conditional')
  .add({
    id: 'accountType',
    type: 'select',
    props: {
      label: 'Account Type',
      options: [
        { label: 'Personal', value: 'personal' },
        { label: 'Business', value: 'business' },
      ],
    },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .add({
    id: 'companyName',
    type: 'text',
    props: { label: 'Company Name', placeholder: 'Acme Inc.' },
    conditions: {
      visible: when('accountType').equals('business').build(),
    },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .add({
    id: 'contactMethod',
    type: 'select',
    props: {
      label: 'Preferred Contact',
      options: [
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' },
        { label: 'Both', value: 'both' },
      ],
    },
    validation: { validate: [required()], validateOnBlur: true },
  })
  .add({
    id: 'contactEmail',
    type: 'email',
    props: { label: 'Contact Email' },
    conditions: {
      visible: when('contactMethod').in(['email', 'both']).build(),
    },
    validation: { validate: [required(), email()], validateOnBlur: true },
  })
  .add({
    id: 'contactPhone',
    type: 'text',
    props: { label: 'Contact Phone', placeholder: '+1 (555) 000-0000' },
    conditions: {
      visible: when('contactMethod').in(['phone', 'both']).build(),
    },
    validation: { validate: [required()], validateOnBlur: true },
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

export function ConditionalFieldsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Conditional Fields"
        description="Fields that show/hide based on other field values using when().equals().build(). Try changing 'Account Type' and 'Preferred Contact' to see fields appear."
      />
      <Card>
        <CardHeader>
          <CardTitle>Conditional Form</CardTitle>
        </CardHeader>
        <CardContent>
          <Form of={conditionalForm} onSubmit={(data) => alert(JSON.stringify(data, null, 2))}>
            <FormInner />
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
