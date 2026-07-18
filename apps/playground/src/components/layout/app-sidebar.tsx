import { cn } from '@/lib/utils';
import {
  Bot,
  Calculator,
  Database,
  FileText,
  GitBranch,
  Home,
  Layers,
  List,
  MessagesSquare,
  Repeat,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Getting Started',
    items: [{ title: 'Home', href: '/', icon: <Home className="size-4" /> }],
  },
  {
    label: 'Forms',
    items: [
      { title: 'Simple Form', href: '/forms/simple', icon: <FileText className="size-4" /> },
      {
        title: 'Conditional Fields',
        href: '/forms/conditional',
        icon: <ToggleLeft className="size-4" />,
      },
      { title: 'Field Effects', href: '/forms/effects', icon: <Sparkles className="size-4" /> },
      {
        title: 'Repeatable Fields',
        href: '/forms/repeatable',
        icon: <Repeat className="size-4" />,
      },
      {
        title: 'Global-watch Fan-out',
        href: '/forms/invoice-fanout',
        icon: <Calculator className="size-4" />,
      },
      {
        title: 'Cross-field Validation',
        href: '/forms/cross-validation',
        icon: <ShieldCheck className="size-4" />,
      },
      {
        title: 'Server-Driven Form',
        href: '/forms/server-driven',
        icon: <Server className="size-4" />,
      },
    ],
  },
  {
    label: 'Workflows',
    items: [
      {
        title: 'Multi-step Onboarding',
        href: '/workflows/onboarding',
        icon: <Layers className="size-4" />,
      },
      {
        title: 'Conditional Steps',
        href: '/workflows/conditional',
        icon: <GitBranch className="size-4" />,
      },
      {
        title: 'Special Values',
        href: '/workflows/special-values',
        icon: <Database className="size-4" />,
      },
    ],
  },
  {
    label: 'Agent',
    items: [
      { title: 'Agent UI', href: '/agent/assistant', icon: <Bot className="size-4" /> },
      { title: 'Agentic KYC', href: '/agent/kyc', icon: <ShieldCheck className="size-4" /> },
      {
        title: 'Multi-turn',
        href: '/agent/multi-turn',
        icon: <MessagesSquare className="size-4" />,
      },
      { title: 'Manifest', href: '/agent/manifest', icon: <ScrollText className="size-4" /> },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b px-4">
        <List className="mr-2 size-5" />
        <span className="text-lg font-semibold">RilayKit</span>
        <span className="ml-1 text-sm text-muted-foreground">Playground</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-6">
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      location.pathname === item.href &&
                        'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    )}
                  >
                    {item.icon}
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">v0.1.5</div>
    </aside>
  );
}
