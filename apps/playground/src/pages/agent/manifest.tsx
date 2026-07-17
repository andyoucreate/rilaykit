import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { agentCatalog } from '@/lib/agent-catalog';
import { manifest } from 'rilaykit';
import { tools } from 'rilaykit/ai-sdk';

// Both are pure and isomorphic (server-safe): the same calls a route handler makes.
const systemPrompt = manifest(agentCatalog);
const toolNames = Object.keys(tools(agentCatalog));

export function AgentManifestPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Manifest / system prompt"
        description="manifest(catalog) generates the Markdown a model receives — which components and tools exist, their props, and when to show UI. tools(catalog) emits the matching AI SDK tool set. This is exactly what you'd put in your system prompt and pass to streamText()."
      />
      <Card>
        <CardHeader>
          <CardTitle>manifest(catalog)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
            {systemPrompt}
          </pre>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Emitted AI SDK tools</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            <code>tools(catalog)</code> returns the tool set you spread into{' '}
            <code>streamText(&#123; tools &#125;)</code>. Only provider-callable tools are emitted.
          </p>
          <ul className="space-y-1 text-sm">
            {toolNames.map((name) => (
              <li key={name}>
                <code className="rounded bg-muted px-1.5 py-0.5">{name}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
