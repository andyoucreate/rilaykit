import type { ToolPart } from '../../types/part';

/** `search_hotels` → `Search hotels`. Bare but functional: no styles, no branding. */
export function humanizeToolName(name: string): string {
  const spaced = name.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function DefaultTool({ part }: { readonly part: ToolPart }) {
  return (
    <div data-part="tool" data-tool-name={part.name} data-tool-state={part.state}>
      {humanizeToolName(part.name)}
    </div>
  );
}
