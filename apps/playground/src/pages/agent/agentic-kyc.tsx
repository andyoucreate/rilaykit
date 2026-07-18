import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { agentCatalog } from '@/lib/agent-catalog';
import { advanceTranscript } from '@/lib/agent-transcript';
import { useState } from 'react';
import type { Part } from 'rilaykit';
import { Catalog, Parts } from 'rilaykit/react';

// A complete KYC flow the assistant emits as a single `show_flow` tool call. It
// is untrusted JSON (a FlowSchema) that `compileFlow` turns into a running,
// validated, multi-step workflow: conditional STEPS (beneficial owners only for
// a company), conditional FIELDS (US → SSN/State, DE → VAT, other → passport;
// a per-row PEP explanation), a repeatable (beneficial owners, min 1), and
// required validation — all driven through the real HITL loop, no LLM.
const KYC_FLOW = {
  id: 'agentic-kyc-demo',
  name: 'KYC onboarding',
  description: 'Agent-emitted customer due-diligence flow',
  steps: [
    {
      id: 'identity',
      title: 'Identity',
      form: {
        id: 'identity',
        fields: [
          {
            id: 'legalName',
            type: 'text',
            props: { label: 'Legal name', placeholder: 'Ada Lovelace' },
            validation: { rules: ['required'] },
          },
          {
            id: 'country',
            type: 'select',
            props: {
              label: 'Country of residence',
              options: [
                { value: 'US', label: 'United States' },
                { value: 'DE', label: 'Germany' },
                { value: 'other', label: 'Other' },
              ],
            },
            validation: { rules: ['required'] },
          },
          {
            id: 'ssn',
            type: 'text',
            props: { label: 'SSN', placeholder: '123-45-6789' },
            conditions: {
              visible: { field: 'country', operator: 'equals', value: 'US' },
              required: { field: 'country', operator: 'equals', value: 'US' },
            },
          },
          {
            id: 'vatId',
            type: 'text',
            props: { label: 'VAT ID' },
            conditions: {
              visible: { field: 'country', operator: 'equals', value: 'DE' },
              required: { field: 'country', operator: 'equals', value: 'DE' },
            },
          },
          {
            id: 'passportNo',
            type: 'text',
            props: { label: 'Passport number' },
            conditions: {
              visible: { field: 'country', operator: 'equals', value: 'other' },
              required: { field: 'country', operator: 'equals', value: 'other' },
            },
          },
        ],
      },
    },
    {
      id: 'entity',
      title: 'Account type',
      form: {
        id: 'entity',
        fields: [
          {
            id: 'entityType',
            type: 'select',
            props: {
              label: 'Account type',
              options: [
                { value: 'individual', label: 'Individual' },
                { value: 'company', label: 'Company' },
              ],
            },
            validation: { rules: ['required'] },
          },
        ],
      },
    },
    {
      id: 'ownership',
      title: 'Beneficial owners',
      // Company-only STEP — an individual skips it entirely, and it drops from
      // the completion payload.
      conditions: { visible: { field: 'entityType', operator: 'equals', value: 'company' } },
      form: {
        id: 'ownership',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'owners',
              min: 1,
              defaultValue: { ownerName: '', ownershipPct: 0, isPEP: false, pepReason: '' },
              rows: [
                {
                  fields: [
                    {
                      id: 'ownerName',
                      type: 'text',
                      props: { label: 'Owner name' },
                      validation: { rules: ['required'] },
                    },
                    { id: 'ownershipPct', type: 'number', props: { label: 'Ownership %' } },
                    { id: 'isPEP', type: 'checkbox', props: { label: 'Politically exposed?' } },
                    {
                      id: 'pepReason',
                      type: 'text',
                      props: { label: 'PEP explanation' },
                      conditions: {
                        visible: { field: 'isPEP', operator: 'equals', value: true },
                        required: { field: 'isPEP', operator: 'equals', value: true },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    {
      id: 'review',
      title: 'Review & consent',
      form: {
        id: 'review',
        fields: [
          {
            id: 'consent',
            type: 'checkbox',
            props: { label: 'I confirm the information above is accurate' },
          },
        ],
      },
    },
  ],
};

const INITIAL_TRANSCRIPT: Part[] = [
  {
    type: 'text',
    text: "Let's complete your KYC. I've put together the whole flow — work through the steps (use Back/Next), and I'll confirm once it's submitted.",
    state: 'done',
  },
  {
    type: 'tool',
    toolCallId: 'call_kyc',
    name: 'show_flow',
    state: 'ready',
    input: { schema: KYC_FLOW },
  },
];

/** A compact, readable summary of what the flow collected — proof the exact
 * projected payload (hidden steps/fields absent) reaches the agent on resolve. */
function summarize(values: Record<string, unknown>): string {
  const identity = (values.identity ?? {}) as Record<string, unknown>;
  const entity = (values.entity ?? {}) as Record<string, unknown>;
  const owners = ((values.ownership ?? {}) as { owners?: unknown[] }).owners;
  const parts = [
    identity.legalName ? `${String(identity.legalName)} (${String(identity.country)})` : null,
    entity.entityType ? `account: ${String(entity.entityType)}` : null,
    Array.isArray(owners) ? `${owners.length} beneficial owner(s)` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function AgentKycPage() {
  const [transcript, setTranscript] = useState<Part[]>(INITIAL_TRANSCRIPT);

  const handleResolve = (toolCallId: string, output: unknown) => {
    const result = output as { status?: string; values?: Record<string, unknown> };
    const followUp: Part[] =
      result.status === 'submitted'
        ? [
            {
              type: 'text',
              text: `Thanks — KYC submitted. I received: ${summarize(result.values ?? {})}. Only the visible steps and fields were included; anything conditionally hidden was dropped from the payload.`,
              state: 'done',
            },
          ]
        : [
            {
              type: 'text',
              text: 'No problem — cancelled. Ping me when you want to resume.',
              state: 'done',
            },
          ];
    setTranscript((prev) => advanceTranscript(prev, toolCallId, output, followUp));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Agentic KYC (show_flow)"
        description="The assistant emits one show_flow tool call whose schema is a full KYC flow — conditional steps (owners for a company only), conditional fields (US/DE/other), a repeatable of beneficial owners with a per-row PEP field, and required validation. compileFlow turns the untrusted JSON into a live workflow, driven through the real HITL loop. No LLM, no API key."
      />
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Assistant</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setTranscript(INITIAL_TRANSCRIPT)}>
            Reset
          </Button>
        </CardHeader>
        <CardContent>
          <Catalog value={agentCatalog}>
            <div className="space-y-4">
              <Parts parts={transcript} onResolve={handleResolve} />
            </div>
          </Catalog>
        </CardContent>
      </Card>
    </div>
  );
}
