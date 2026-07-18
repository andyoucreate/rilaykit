import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bot,
  Calculator,
  Database,
  FileText,
  GitBranch,
  Layers,
  Repeat,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface DemoCard {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  category: 'Forms' | 'Workflows' | 'Agent';
}

const DEMOS: DemoCard[] = [
  {
    title: 'Simple Form',
    description:
      'Contact form with field validation — required, email, minLength. The basics of the builder API.',
    href: '/forms/simple',
    icon: <FileText className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Conditional Fields',
    description: 'Fields that appear based on other values using when().equals().build().',
    href: '/forms/conditional',
    icon: <ToggleLeft className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Field Effects',
    description: 'Reactive cascading — Country → City options, Price × Qty → Total auto-calc.',
    href: '/forms/effects',
    icon: <Sparkles className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Repeatable Fields',
    description: 'Dynamic add/remove groups with min/max constraints. Build a team roster.',
    href: '/forms/repeatable',
    icon: <Repeat className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Global-watch Fan-out',
    description:
      'Invoice lines whose totals all recompute when one shared tax rate changes — a per-row effect watching a global field.',
    href: '/forms/invoice-fanout',
    icon: <Calculator className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Cross-field Validation',
    description: 'Form-level rules — password match, date ordering, "at least one" constraints.',
    href: '/forms/cross-validation',
    icon: <ShieldCheck className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Server-Driven Form',
    description:
      'Form generated from a JSON schema using fromSchema(). Validation, conditions, and effects — all from JSON.',
    href: '/forms/server-driven',
    icon: <Server className="size-5" />,
    category: 'Forms',
  },
  {
    title: 'Multi-step Onboarding',
    description: '4-step workflow with stepper, navigation, and localStorage persistence.',
    href: '/workflows/onboarding',
    icon: <Layers className="size-5" />,
    category: 'Workflows',
  },
  {
    title: 'Conditional Steps',
    description:
      'Workflow steps that show/hide based on previous answers. Dynamic step visibility.',
    href: '/workflows/conditional',
    icon: <GitBranch className="size-5" />,
    category: 'Workflows',
  },
  {
    title: 'Persistence: Special Values',
    description:
      'Date, NaN, Infinity, and BigInt survive a save→load round trip through the persistence adapter — values plain JSON would corrupt.',
    href: '/workflows/special-values',
    icon: <Database className="size-5" />,
    category: 'Workflows',
  },
  {
    title: 'Agent UI (simulated)',
    description:
      'An assistant transcript rendered through <Parts>/<Catalog>. A show_form tool mounts a real form and resolves through the HITL loop — no LLM needed.',
    href: '/agent/assistant',
    icon: <Bot className="size-5" />,
    category: 'Agent',
  },
  {
    title: 'Manifest / System Prompt',
    description:
      'What manifest(catalog) feeds the model, and the AI SDK tool set tools(catalog) emits for streamText().',
    href: '/agent/manifest',
    icon: <ScrollText className="size-5" />,
    category: 'Agent',
  },
  {
    title: 'Agentic KYC (show_flow)',
    description:
      'The assistant emits one show_flow whose schema is a full KYC flow — conditional steps, conditional fields, a repeatable of beneficial owners with a PEP field, validation — compiled to a live workflow and driven through HITL.',
    href: '/agent/kyc',
    icon: <ShieldCheck className="size-5" />,
    category: 'Agent',
  },
  {
    title: 'Multi-turn conversation',
    description:
      'A real agentic loop: show_form → the user submits → the agent appends its next turn (a show_flow) to the same transcript. Resolves stay isolated per toolCallId.',
    href: '/agent/multi-turn',
    icon: <Sparkles className="size-5" />,
    category: 'Agent',
  },
];

export function HomePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">RilayKit Playground</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Interactive demos showcasing RilayKit's form builder, workflow engine, and reactive
          features — powered by shadcn/ui.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEMOS.map((demo) => (
          <Link key={demo.href} to={demo.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className="rounded-md bg-muted p-2">{demo.icon}</div>
                <div>
                  <CardTitle className="text-base">{demo.title}</CardTitle>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {demo.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{demo.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
