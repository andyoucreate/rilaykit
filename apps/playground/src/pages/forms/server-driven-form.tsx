import { PageHeader } from '@/components/layout/page-header';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { r } from '@/lib/ril-config';
import { useState } from 'react';
import {
  Form,
  FormBody,
  FormSubmitButton,
  type FormSchema,
  type SchemaRegistry,
  fromSchema,
  useFormStoreApi,
} from 'rilaykit';

// ---------------------------------------------------------------------------
// 1. JSON Schema — this would come from a backend API in production
// ---------------------------------------------------------------------------

const onboardingSchema: FormSchema = {
  id: 'onboarding',
  rows: [
    {
      fields: [
        {
          id: 'firstName',
          type: 'text',
          props: { label: 'First Name', placeholder: 'John' },
          validation: { rules: ['required'] },
        },
        {
          id: 'lastName',
          type: 'text',
          props: { label: 'Last Name', placeholder: 'Doe' },
          validation: { rules: ['required'] },
        },
      ],
    },
    {
      fields: [
        {
          id: 'email',
          type: 'email',
          props: { label: 'Email', placeholder: 'john@example.com' },
          validation: {
            rules: ['required', 'email'],
            validateOnBlur: true,
          },
        },
      ],
    },
    {
      fields: [
        {
          id: 'country',
          type: 'select',
          props: {
            label: 'Country',
            placeholder: 'Select a country',
            options: [
              { label: 'France', value: 'france' },
              { label: 'Germany', value: 'germany' },
              { label: 'Spain', value: 'spain' },
            ],
          },
        },
      ],
    },
    {
      fields: [
        {
          id: 'city',
          type: 'select',
          props: {
            label: 'City',
            placeholder: 'Select a country first',
            options: [],
          },
          conditions: {
            visible: { field: 'country', operator: 'notEquals', value: '' },
          },
          effects: [
            {
              trigger: 'change',
              watch: 'country',
              handler: 'loadCities',
            },
          ],
        },
      ],
    },
    {
      fields: [
        {
          id: 'bio',
          type: 'textarea',
          props: { label: 'Bio', placeholder: 'Tell us about yourself...', rows: 4 },
          validation: {
            rules: [{ type: 'minLength', params: { min: 10 }, message: 'At least 10 characters' }],
          },
        },
      ],
    },
    {
      fields: [
        {
          id: 'newsletter',
          type: 'checkbox',
          props: { label: 'Subscribe to newsletter' },
        },
      ],
    },
  ],
  defaultValues: {
    firstName: '',
    lastName: '',
    email: '',
    country: '',
    city: '',
    bio: '',
    newsletter: false,
  },
};

// ---------------------------------------------------------------------------
// 2. Schema Registry — custom effect handlers provided client-side
// ---------------------------------------------------------------------------

const CITIES_BY_COUNTRY: Record<string, { label: string; value: string }[]> = {
  france: [
    { label: 'Paris', value: 'paris' },
    { label: 'Lyon', value: 'lyon' },
    { label: 'Marseille', value: 'marseille' },
  ],
  germany: [
    { label: 'Berlin', value: 'berlin' },
    { label: 'Munich', value: 'munich' },
    { label: 'Hamburg', value: 'hamburg' },
  ],
  spain: [
    { label: 'Madrid', value: 'madrid' },
    { label: 'Barcelona', value: 'barcelona' },
    { label: 'Seville', value: 'seville' },
  ],
};

const registry: SchemaRegistry = {
  effects: {
    loadCities: async (newCountry, { setValue, setProps }) => {
      // Simulate async API call
      await new Promise((resolve) => setTimeout(resolve, 300));
      const cities = CITIES_BY_COUNTRY[newCountry as string] ?? [];
      setValue('city', '');
      setProps('city', {
        options: cities,
        placeholder: cities.length ? 'Select a city' : 'No cities available',
      });
    },
  },
};

// ---------------------------------------------------------------------------
// 3. Build the form from the schema
// ---------------------------------------------------------------------------

const { formConfig, defaultValues } = fromSchema(onboardingSchema, r as any, registry);

// ---------------------------------------------------------------------------
// 4. Schema JSON viewer
// ---------------------------------------------------------------------------

function SchemaViewer({ schema }: { schema: FormSchema }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="mb-6">
      <CardHeader
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span>JSON Schema</span>
          <span className="text-sm font-normal text-muted-foreground">
            {isExpanded ? 'Click to collapse' : 'Click to expand'}
          </span>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Render
// ---------------------------------------------------------------------------

function FormInner() {
  const storeApi = useFormStoreApi();

  return (
    <InspectorStoreProvider store={storeApi}>
      <FormBody />
      <div className="mt-6">
        <FormSubmitButton />
      </div>
    </InspectorStoreProvider>
  );
}

export function ServerDrivenFormPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Server-Driven Form"
        description="Form generated entirely from a JSON schema using fromSchema(). The schema defines fields, validation rules, conditions, and effects — no builder code needed."
      />

      <SchemaViewer schema={onboardingSchema} />

      <Card>
        <CardHeader>
          <CardTitle>Generated Form</CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            formConfig={formConfig}
            defaultValues={defaultValues}
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
