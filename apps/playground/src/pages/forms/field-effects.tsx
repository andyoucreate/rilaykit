import { Form, FormBody, FormSubmitButton, onChange, useFormStoreApi } from 'rilaykit';
import { r } from '@/lib/ril-config';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';

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

const effectsForm = r
  .form('effects')
  .add({
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
  })
  .add({
    id: 'city',
    type: 'select',
    props: {
      label: 'City',
      placeholder: 'Select a country first',
      options: [],
    },
    effects: [
      onChange('country', async (newCountry, { setValue, setProps }) => {
        // Simulate async API call
        await new Promise((resolve) => setTimeout(resolve, 300));
        const cities = CITIES_BY_COUNTRY[newCountry as string] ?? [];
        setValue('city', '');
        setProps('city', { options: cities, placeholder: cities.length ? 'Select a city' : 'No cities available' });
      }),
    ],
  })
  .add(
    {
      id: 'price',
      type: 'number',
      props: { label: 'Unit Price', placeholder: '0.00', step: 0.01 },
    },
    {
      id: 'quantity',
      type: 'number',
      props: { label: 'Quantity', placeholder: '1', step: 1, min: 0 },
    },
  )
  .add({
    id: 'total',
    type: 'number',
    props: { label: 'Total (auto-calculated)', readOnly: true },
    effects: [
      onChange('price', (_newPrice, { getFieldValue, setValue }) => {
        const price = Number(getFieldValue('price')) || 0;
        const quantity = Number(getFieldValue('quantity')) || 0;
        setValue('total', Math.round(price * quantity * 100) / 100);
      }),
      onChange('quantity', (_newQty, { getFieldValue, setValue }) => {
        const price = Number(getFieldValue('price')) || 0;
        const quantity = Number(getFieldValue('quantity')) || 0;
        setValue('total', Math.round(price * quantity * 100) / 100);
      }),
    ],
  })
  .build();

function FormInner() {
  const storeApi = useFormStoreApi();
  return (
    <InspectorStoreProvider store={storeApi}>
      <FormBody />
    </InspectorStoreProvider>
  );
}

export function FieldEffectsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Field Effects"
        description="Reactive field-to-field effects using onChange(). Changing 'Country' cascades to 'City' options (simulated async). Price × Quantity auto-calculates Total."
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Cascading Selects</CardTitle>
        </CardHeader>
        <CardContent>
          <Form formConfig={effectsForm} onSubmit={(data) => alert(JSON.stringify(data, null, 2))}>
            <FormInner />
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
