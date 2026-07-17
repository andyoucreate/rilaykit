import { SubmitButton } from '@/components/chrome/submit-button';
import { PageHeader } from '@/components/layout/page-header';
import { InspectorStoreProvider } from '@/components/shared/inspector-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { grossUpTotal } from '@/lib/invoice-total';
import { r } from '@/lib/ril-config';
import { useState } from 'react';
import { type FieldEffectContext, onChange } from 'rilaykit';
import { Form, FormBody, useFormStoreApi } from 'rilaykit/react';

// One compute shared by both watches (DRY): a line's total is its price grossed up
// by the GLOBAL tax rate. `price` scopes to the row; `taxRate` is a global field,
// so `getFieldValue('taxRate')` reads the shared value from any row.
function recomputeLineTotal({ setValue, getFieldValue }: FieldEffectContext): void {
  setValue('total', grossUpTotal(getFieldValue('price'), getFieldValue('taxRate')));
}

const invoiceForm = r
  .form('invoice')
  .add({
    id: 'taxRate',
    type: 'number',
    props: { label: 'Tax rate (%)', placeholder: '20' },
  })
  .addRepeatable('lines', (rep) =>
    rep
      .add(
        {
          id: 'description',
          type: 'text',
          props: { label: 'Description', placeholder: 'Consulting' },
        },
        {
          id: 'price',
          type: 'number',
          props: { label: 'Price', placeholder: '100' },
          // Per-row sibling watch — updating one line's price recomputes only that line.
          effects: [onChange('price', (_price, ctx) => recomputeLineTotal(ctx))],
        }
      )
      .add({
        id: 'total',
        type: 'number',
        props: { label: 'Total (incl. tax)', readOnly: true },
        // GLOBAL watch — changing the single taxRate fans this effect out to EVERY
        // live line, each recomputing from its own price.
        effects: [onChange('taxRate', (_rate, ctx) => recomputeLineTotal(ctx))],
      })
      .min(1)
      .max(8)
      .defaultValue({ description: '', price: 0, total: 0 })
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

export function InvoiceFanoutPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Global-watch effect fan-out"
        description="Each invoice line's total is derived from its price and one shared tax rate. A line's price watch recomputes only that line; the global taxRate watch fans out to every line at once. Add a few lines with prices, then change the tax rate and watch every total update."
      />
      <Card>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <Form of={invoiceForm} onSubmit={(data) => setSubmittedData(data)}>
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
