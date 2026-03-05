import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText,
  GitBranch,
  Layers,
  Repeat,
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
  category: 'Forms' | 'Workflows';
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
    title: 'Cross-field Validation',
    description: 'Form-level rules — password match, date ordering, "at least one" constraints.',
    href: '/forms/cross-validation',
    icon: <ShieldCheck className="size-5" />,
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
