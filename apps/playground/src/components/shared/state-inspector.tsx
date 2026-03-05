import { useState } from 'react';
import { cn } from '@/lib/utils';

interface StateInspectorProps {
  data: Record<string, unknown>;
  label?: string;
}

export function StateInspector({ data, label }: StateInspectorProps) {
  return (
    <div>
      {label && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>}
      <div className="rounded-md bg-muted/50 p-3 font-mono text-xs">
        <JsonTree data={data} />
      </div>
    </div>
  );
}

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (data === null || data === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-chart-1">{String(data)}</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-chart-2">{data}</span>;
  }

  if (typeof data === 'string') {
    return <span className="text-chart-3">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground">[]</span>;
    if (collapsed) {
      return (
        <span className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(false)}>
          [...] <span className="text-muted-foreground/60">{data.length} items</span>
        </span>
      );
    }
    return (
      <span>
        <span className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(true)}>[</span>
        <div className="ml-4">
          {data.map((item, i) => (
            <div key={i}>
              <JsonTree data={item} depth={depth + 1} />
              {i < data.length - 1 && ','}
            </div>
          ))}
        </div>
        <span>]</span>
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">{'{}'}</span>;
    if (collapsed) {
      return (
        <span className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(false)}>
          {'{'} ... {'}'} <span className="text-muted-foreground/60">{entries.length} keys</span>
        </span>
      );
    }
    return (
      <span>
        <span className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(true)}>{'{'}</span>
        <div className="ml-4">
          {entries.map(([key, val], i) => (
            <div key={key}>
              <span className="text-primary">{key}</span>
              <span className="text-muted-foreground">: </span>
              <JsonTree data={val} depth={depth + 1} />
              {i < entries.length - 1 && ','}
            </div>
          ))}
        </div>
        <span>{'}'}</span>
      </span>
    );
  }

  return <span>{String(data)}</span>;
}
