import React, { useCallback } from 'react';
import { ConfigurationError, getOwn, type RilayInstance } from '@rilaykit/core';
import { useCatalogOrNull } from '@rilaykit/core/react';
import { isToolPart, type Part as PartType, type PartState } from '../types/part';
import { DefaultTool } from './fallbacks/DefaultTool';
import { ShowComponent } from './fallbacks/ShowComponent';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

/**
 * Renderers the agent layer ships out of the box, keyed by tool name. Used only
 * when the catalog itself has no renderer registered for that tool — a
 * consumer's `.renderers({ tools: { show_component: ... } })` always wins.
 *
 * Looked up with `getOwn`, never `BUILT_IN_TOOLS[name]` or `name in
 * BUILT_IN_TOOLS` directly: a tool literally named `toString` or
 * `constructor` would otherwise resolve to an inherited `Object.prototype`
 * member. This exact class of bug escaped seven times in P1/P2.
 *
 * A built-in may return null: `show_component` renders nothing while the part is
 * still `streaming` — its `input` is then a deep-partial parse, and validating a
 * half-arrived tree would flash misleading error views for every unfinished node.
 */
const BUILT_IN_TOOLS: Record<
  string,
  (input: unknown, state: PartState, resolve: (output: unknown) => void) => React.ReactElement | null
> = {
  show_component: (input, state) =>
    state === 'streaming' ? null : <ShowComponent node={(input as { node?: unknown }).node} />,
};

export interface PartProps {
  readonly part: PartType;
  readonly onResolve?: (toolCallId: string, output: unknown) => void;
  /** Explicit override; defaults to the nearest <Catalog value={...}>. */
  readonly catalog?: AnyCatalog;
  readonly fallback?: React.ComponentType<{ part: PartType }>;
}

/**
 * Single-part dispatcher: resolves a `Part` against the catalog's `tool:*` /
 * `part:*` namespaces and renders the matching entry.
 *
 * A tool's `resolve()` is wired straight to `onResolve(toolCallId, output)` —
 * the HITL mirror that lets a consumer post the tool result back upstream
 * without the renderer knowing anything about transport.
 */
export function Part({ part, onResolve, catalog, fallback: Fallback }: PartProps) {
  const contextCatalog = useCatalogOrNull();
  const resolved = catalog ?? contextCatalog;
  if (!resolved) {
    throw new ConfigurationError(
      'Part requires either a catalog prop or a nearest <Catalog value={...}> provider'
    );
  }

  const resolve = useCallback(
    (output: unknown) => {
      if (isToolPart(part)) onResolve?.(part.toolCallId, output);
    },
    [onResolve, part]
  );

  if (isToolPart(part)) {
    const entry = resolved.getTool(part.name);
    const Renderer = entry?.renderer;
    if (!Renderer) {
      const builtIn = getOwn(BUILT_IN_TOOLS, part.name);
      if (builtIn) return builtIn(part.input, part.state, resolve);
      return Fallback ? <Fallback part={part} /> : <DefaultTool part={part} />;
    }
    return (
      <Renderer
        toolCallId={part.toolCallId}
        name={part.name}
        state={part.state}
        input={part.input}
        rawInput={part.rawInput}
        output={part.output}
        errorText={part.errorText}
        resolve={resolve}
        meta={entry.meta}
      />
    );
  }

  const entry = resolved.getPart(part.type);
  const Renderer = entry?.renderer;
  if (!Renderer) {
    return Fallback ? <Fallback part={part} /> : null;
  }
  return <Renderer part={part} meta={entry.meta} />;
}
