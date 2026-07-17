import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Row, SPECIAL_VALUES, inspect } from '@/lib/special-values';
import { useState } from 'react';
import { LocalStorageAdapter, type PersistedWorkflowData } from 'rilaykit';

// The real workflow persistence adapter — no mock, the same code path a persisted
// workflow uses. Plain JSON.stringify/parse corrupts these values (Date → string,
// NaN/Infinity → null, BigInt throws); the adapter's tagged serializer preserves them.
const adapter = new LocalStorageAdapter({ keyPrefix: 'playground-special' });
const STORAGE_KEY = 'special-values-demo';

function makeData(fields: Record<string, unknown>): PersistedWorkflowData {
  return {
    workflowId: STORAGE_KEY,
    currentStepIndex: 0,
    allData: { step: fields },
    stepData: {},
    visitedSteps: [],
    lastSaved: 0,
  };
}

export function SpecialValuesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  const roundTrip = async () => {
    await adapter.save(STORAGE_KEY, makeData(SPECIAL_VALUES));
    const data = await adapter.load(STORAGE_KEY);
    setRows(data ? inspect(data.allData.step as Record<string, unknown>) : null);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Persistence: special values"
        description="Workflow persistence preserves values a plain JSON.stringify/parse would silently corrupt. This saves a Date, NaN, Infinity, and a BigInt through the real LocalStorageAdapter, loads them back, and checks each survived its type intact."
      />
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Save → load round trip</CardTitle>
          <Button size="sm" onClick={roundTrip}>
            Save &amp; reload
          </Button>
        </CardHeader>
        <CardContent>
          {rows === null ? (
            <p className="text-sm text-muted-foreground">
              Click “Save &amp; reload” to write the values to localStorage and read them back.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Value</th>
                  <th className="py-2 font-medium">Saved</th>
                  <th className="py-2 font-medium">Loaded</th>
                  <th className="py-2 font-medium">Intact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 font-mono text-xs">{row.original}</td>
                    <td className="py-2 font-mono text-xs">{row.loaded}</td>
                    <td className="py-2">{row.preserved ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
