import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { agentCatalog } from '@/lib/agent-catalog';
import { advanceTranscript } from '@/lib/agent-transcript';
import { useState } from 'react';
import type { Part } from 'rilaykit';
import { Catalog, Parts } from 'rilaykit/react';

// Turn 1: the assistant asks for contact details with a show_form.
const CONTACT_FORM = {
  id: 'contact',
  fields: [
    {
      id: 'name',
      type: 'text',
      props: { label: 'Your name', placeholder: 'Ada Lovelace' },
      validation: { rules: ['required'] },
    },
    {
      id: 'email',
      type: 'email',
      props: { label: 'Email', placeholder: 'ada@example.com' },
      validation: { rules: ['required', 'email'] },
    },
  ],
};

// Turn 2 (emitted after the contact form resolves): a short booking flow.
const BOOKING_FLOW = {
  id: 'booking',
  name: 'Book a demo',
  steps: [
    {
      id: 'when',
      title: 'When',
      form: {
        id: 'when',
        fields: [
          {
            id: 'slot',
            type: 'select',
            props: {
              label: 'Preferred slot',
              options: [
                { value: 'mon-am', label: 'Monday morning' },
                { value: 'wed-pm', label: 'Wednesday afternoon' },
                { value: 'fri-am', label: 'Friday morning' },
              ],
            },
            validation: { rules: ['required'] },
          },
        ],
      },
    },
    {
      id: 'topic',
      title: 'Topic',
      form: {
        id: 'topic',
        fields: [
          {
            id: 'area',
            type: 'select',
            props: {
              label: 'What should we focus on?',
              options: [
                { value: 'forms', label: 'Dynamic forms' },
                { value: 'workflows', label: 'Multi-step workflows' },
                { value: 'agent', label: 'Agentic UI' },
              ],
            },
            validation: { rules: ['required'] },
          },
          {
            id: 'notes',
            type: 'textarea',
            props: { label: 'Anything else?', placeholder: 'Optional' },
          },
        ],
      },
    },
  ],
};

const INITIAL_TRANSCRIPT: Part[] = [
  {
    type: 'text',
    text: 'Hi! I can book you a product demo. First, who are you?',
    state: 'done',
  },
  {
    type: 'tool',
    toolCallId: 'call_contact',
    name: 'show_form',
    state: 'ready',
    input: { schema: CONTACT_FORM },
  },
];

export function AgentMultiTurnPage() {
  const [transcript, setTranscript] = useState<Part[]>(INITIAL_TRANSCRIPT);

  // Each resolve advances the conversation by a turn. Which follow-up the agent
  // emits depends on WHICH tool call resolved — turn 1 (contact) → a booking
  // flow; turn 2 (booking) → the confirmation. Resolves stay id-isolated.
  const handleResolve = (toolCallId: string, output: unknown) => {
    const result = output as { status?: string; values?: Record<string, unknown> };
    let followUp: Part[] = [];

    if (toolCallId === 'call_contact' && result.status === 'submitted') {
      const name = String((result.values ?? {}).name ?? 'there');
      followUp = [
        { type: 'text', text: `Great, thanks ${name}! Now pick a time and topic:`, state: 'done' },
        {
          type: 'tool',
          toolCallId: 'call_booking',
          name: 'show_flow',
          state: 'ready',
          input: { schema: BOOKING_FLOW },
        },
      ];
    } else if (toolCallId === 'call_booking' && result.status === 'submitted') {
      const when = (result.values ?? {}).when as { slot?: string } | undefined;
      followUp = [
        {
          type: 'text',
          text: `You're booked${when?.slot ? ` for ${when.slot}` : ''}. See you then! That was two tool turns resolving through one transcript.`,
          state: 'done',
        },
      ];
    } else {
      followUp = [{ type: 'text', text: 'Cancelled — no worries.', state: 'done' }];
    }

    setTranscript((prev) => advanceTranscript(prev, toolCallId, output, followUp));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Multi-turn conversation"
        description="A real agentic conversation: the assistant emits a show_form, the user submits, and the agent's NEXT turn (a show_flow) is appended to the same transcript — resolves stay isolated per toolCallId, and each prior turn settles as the next arrives. No LLM, no API key."
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
