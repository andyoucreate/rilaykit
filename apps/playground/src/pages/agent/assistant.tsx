import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { agentCatalog } from '@/lib/agent-catalog';
import { advanceTranscript } from '@/lib/agent-transcript';
import { useState } from 'react';
import type { Part } from 'rilaykit';
import { Catalog, Parts } from 'rilaykit/react';

// The scripted opening turn: assistant prose, then a `show_form` tool call the
// user fills in. A real agent would stream these parts from the model; here they
// are hand-authored so the demo is deterministic and needs no API key.
const SIGNUP_FORM = {
  id: 'signup',
  fields: [
    {
      id: 'name',
      type: 'text',
      props: { label: 'Full name', placeholder: 'Ada Lovelace' },
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

const INITIAL_TRANSCRIPT: Part[] = [
  {
    type: 'text',
    text: "Hi! I'll get your account set up. Just fill this in and hit submit:",
    state: 'done',
  },
  {
    type: 'tool',
    toolCallId: 'call_signup',
    name: 'show_form',
    state: 'ready',
    input: { schema: SIGNUP_FORM },
  },
];

export function AgentAssistantPage() {
  const [transcript, setTranscript] = useState<Part[]>(INITIAL_TRANSCRIPT);

  // The real HITL resolve loop: submitting the rendered show_form fires this with
  // `{ status: 'submitted', values }`. We flip the tool part to done and append
  // the assistant's scripted next turn — the pure `advanceTranscript` step.
  const handleResolve = (toolCallId: string, output: unknown) => {
    const values = (output as { values?: Record<string, unknown> }).values ?? {};
    const name = typeof values.name === 'string' && values.name ? values.name : 'there';
    const followUp: Part[] = [
      {
        type: 'text',
        text: `Thanks, ${name} — your account is ready. That's the show_form tool resolving through the real HITL loop.`,
        state: 'done',
      },
    ];
    setTranscript((prev) => advanceTranscript(prev, toolCallId, output, followUp));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Agent UI (simulated)"
        description="A hand-authored assistant transcript rendered through <Parts>/<Catalog> — the @rilaykit/agent render engine. The show_form tool mounts a real form and resolves through the actual HITL loop (no LLM, no API key)."
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
