import { ConfigurationError, type RilayInstance, getOwn } from '@rilaykit/core';
import { useCatalogOrNull } from '@rilaykit/core/react';
import type React from 'react';
import { useCallback } from 'react';
import { parsePartialJson } from '../streaming/parse-partial-json';
import { type Part as PartType, type ToolPart, isToolPart } from '../types/part';
import { DefaultTool } from './fallbacks/DefaultTool';
import { ShowComponent } from './fallbacks/ShowComponent';
import { ShowFlow } from './fallbacks/ShowFlow';
import { ShowForm } from './fallbacks/ShowForm';

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
 * A built-in may return null: `show_component` and `show_flow` render nothing
 * while the part is still `streaming` — their `input` is then a deep-partial
 * parse, and compiling/validating a half-arrived tree would flash misleading
 * error views for every unfinished node. Flows render at `ready` ONLY by spec —
 * a deliberate scope cut, not a deferral.
 *
 * `show_form` streams PROGRESSIVELY instead: fields mount as their definitions
 * complete (lenient compilation), the user can start typing immediately, and
 * both answers stay LOCKED until the emitted JSON is provably complete —
 * `rawInput` parses as complete JSON, or the part reaches `ready`. Without a
 * `rawInput` there is no completeness signal, so the lock holds until `ready`.
 *
 * The interactive built-ins (`show_form`, `show_flow`) answer at `ready` ONLY:
 * at `done`/`error` they render the bare `DefaultTool` marker (its
 * `data-tool-name`/`data-tool-state` hooks carry the styling), because a
 * rehydrated conversation must not re-arm an already-answered tool call —
 * hosts override via `.renderers()` for richer settled UX.
 */
const BUILT_IN_TOOLS: Record<
  string,
  (part: ToolPart, resolve: (output: unknown) => void) => React.ReactElement | null
> = {
  show_component: ({ input, state }) =>
    state === 'streaming' ? null : <ShowComponent node={(input as { node?: unknown }).node} />,
  show_form: (part, resolve) => {
    if (part.state === 'streaming') {
      // The adapter normally hands a deep-partial `input`; when only the raw
      // JSON text has arrived, recover what it holds so far. Both carriers are
      // checked — `input` wins when present, `rawInput` alone still mounts.
      const parsed =
        typeof part.rawInput === 'string' ? parsePartialJson(part.rawInput) : undefined;
      const input = part.input ?? parsed?.value;
      return (
        <ShowForm
          schema={(input as { schema?: unknown } | undefined)?.schema}
          resolve={resolve}
          pending={parsed?.complete !== true}
        />
      );
    }
    if (part.state !== 'ready') return <DefaultTool part={part} />;
    return (
      <ShowForm
        schema={(part.input as { schema?: unknown } | undefined)?.schema}
        resolve={resolve}
      />
    );
  },
  show_flow: (part, resolve) => {
    if (part.state === 'streaming') return null;
    if (part.state !== 'ready') return <DefaultTool part={part} />;
    return (
      <ShowFlow
        schema={(part.input as { schema?: unknown } | undefined)?.schema}
        resolve={resolve}
      />
    );
  },
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
      if (builtIn) return builtIn(part, resolve);
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
