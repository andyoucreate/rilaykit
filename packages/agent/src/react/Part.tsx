import { ConfigurationError, type RilayInstance, getOwn } from '@rilaykit/core';
import { Catalog, useCatalogOrNull } from '@rilaykit/core/react';
import type React from 'react';
import { Fragment, useCallback } from 'react';
import { parsePartialJson } from '../streaming/parse-partial-json';
import { type Part as PartType, type ToolPart, isToolPart } from '../types/part';
import { DefaultTool } from './fallbacks/DefaultTool';
import { ShowComponent } from './fallbacks/ShowComponent';
import { ShowFlow } from './fallbacks/ShowFlow';
import { ShowForm } from './fallbacks/ShowForm';

/** Bound for {@link sameJsonValue}: past it the comparison answers false, which
 * only keeps the submit lock CLOSED — never crashes on pathological nesting. */
const MAX_COMPARE_DEPTH = 64;

/**
 * Structural equality over JSON-shaped values (the only shapes both emission
 * carriers can hold: JSON.parse output and the adapter's deep-partial parse).
 * Used to prove that `rawInput`'s completeness signal speaks for the SAME data
 * `input` renders — a mismatch keeps the streaming submit lock closed.
 */
function sameJsonValue(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (depth >= MAX_COMPARE_DEPTH) return false;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameJsonValue(item, b[index], depth + 1))
    );
  }
  // Entries (own, enumerable) rather than bare property reads: a hostile key
  // like `__proto__` must compare as data, never walk the prototype chain.
  const aEntries = Object.entries(a);
  const bEntries = new Map(Object.entries(b));
  return (
    aEntries.length === bEntries.size &&
    aEntries.every(
      ([key, value]) => bEntries.has(key) && sameJsonValue(value, bEntries.get(key), depth + 1)
    )
  );
}

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
 * both answers stay LOCKED until the RENDERED content is provably complete —
 * `rawInput` parses as complete JSON AND is (or structurally equals) what is
 * being rendered, or the part reaches `ready`. A deep-partial `input` alone
 * carries no completeness signal, so the lock then holds until `ready`.
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
  show_component: ({ input, state }, resolve) =>
    state === 'streaming' ? null : (
      // `?.` — an adapter can hand `input: null` (output-error with no input,
      // a torn emission); ShowComponent degrades `node: undefined` to a
      // structured EmissionErrorView, so the null must reach it instead of
      // throwing here, INSIDE the dispatcher, where it would collapse the
      // whole <Parts> list (spec §8: never a render crash).
      //
      // `resolve` is armed at `ready` ONLY: display-only success never
      // resolves, but an emission ERROR at `ready` must deliver its
      // EmissionResult as a tool result so the model can retry (spec §8). At
      // `done`/`error` the call is already settled (rehydration) — no re-fire.
      <ShowComponent
        node={(input as { node?: unknown } | null | undefined)?.node}
        resolve={state === 'ready' ? resolve : undefined}
      />
    ),
  show_form: (part, resolve) => {
    if (part.state === 'streaming') {
      // The adapter normally hands a deep-partial `input`; when only the raw
      // JSON text has arrived, recover what it holds so far. Both carriers are
      // checked — `input` wins when present, `rawInput` alone still mounts.
      const parsed =
        typeof part.rawInput === 'string' ? parsePartialJson(part.rawInput) : undefined;
      const contentFromRaw = part.input === undefined || part.input === null;
      const input = contentFromRaw ? parsed?.value : part.input;
      // The submit lock may only open when completeness is proven for the SAME
      // data being rendered: `parsed.complete` speaks for `rawInput`, so it
      // unlocks only when that parse IS the content (or structurally equals
      // it). A deep-partial `input` disagreeing with a complete `rawInput`
      // stays locked until `ready` — never a half-asked form with Submit live.
      const complete =
        parsed?.complete === true && (contentFromRaw || sameJsonValue(part.input, parsed.value));
      return (
        <ShowForm
          schema={(input as { schema?: unknown } | undefined)?.schema}
          resolve={resolve}
          pending={!complete}
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

export interface PartProps<C = Record<string, unknown>> {
  readonly part: PartType;
  /** `toolName` (the part's `name`) rides third so `addToolResult({ toolCallId,
   * tool: toolName, output })` compiles against the AI SDK, which REQUIRES the
   * tool name — additive, so 2-arg handlers keep type-checking. */
  readonly onResolve?: (toolCallId: string, output: unknown, toolName: string) => void;
  /** Explicit override; defaults to the nearest <Catalog value={...}>.
   * Generic over the catalog's component map — `RilayInstance` is invariant
   * in `C`, so a fixed map type would reject every fluently built catalog. */
  readonly catalog?: RilayInstance<C>;
  readonly fallback?: React.ComponentType<{ part: PartType }>;
}

/**
 * Single-part dispatcher: resolves a `Part` against the catalog's `tool:*` /
 * `part:*` namespaces and renders the matching entry.
 *
 * A tool's `resolve()` is wired straight to `onResolve(toolCallId, output,
 * toolName)` — the HITL mirror that lets a consumer post the tool result back
 * upstream (the AI SDK's `addToolResult` requires all three) without the
 * renderer knowing anything about transport.
 */
export function Part<C>({ part, onResolve, catalog, fallback: Fallback }: PartProps<C>) {
  const contextCatalog = useCatalogOrNull();
  // Only C-independent reads (getTool/getPart) happen below, so the union of
  // the caller's RilayInstance<C> and the context's erased AnyCatalog is fine.
  const resolved = catalog ?? contextCatalog;
  if (!resolved) {
    throw new ConfigurationError(
      'Part requires either a catalog prop or a nearest <Catalog value={...}> provider'
    );
  }

  const resolve = useCallback(
    (output: unknown) => {
      if (isToolPart(part)) onResolve?.(part.toolCallId, output, part.name);
    },
    [onResolve, part]
  );

  let content: React.ReactNode;
  if (isToolPart(part)) {
    const entry = resolved.getTool(part.name);
    const Renderer = entry?.renderer;
    if (Renderer) {
      content = (
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
    } else {
      const builtIn = getOwn(BUILT_IN_TOOLS, part.name);
      // Keyed by toolCallId: the interactive built-ins hold per-CALL state (a
      // ShowForm instance's `settled` ref is its one-answer-per-call latch, its
      // pinned form identity is per-call too). <Parts> keys its list the same
      // way, but a STANDALONE <Part> re-rendered with a new toolCallId would
      // otherwise reuse the instance — and an already-settled latch would
      // swallow the new call's answer forever.
      if (builtIn) content = <Fragment key={part.toolCallId}>{builtIn(part, resolve)}</Fragment>;
      else content = Fallback ? <Fallback part={part} /> : <DefaultTool part={part} />;
    }
  } else {
    const entry = resolved.getPart(part.type);
    const Renderer = entry?.renderer;
    content = Renderer ? (
      <Renderer part={part} meta={entry.meta} />
    ) : Fallback ? (
      <Fallback part={part} />
    ) : null;
  }

  // Provide the resolved catalog to the rendered subtree. `resolved` reaches
  // dispatch (getTool/getPart) here, but the built-in renderers (ShowForm/
  // ShowFlow/ShowComponent) and any custom renderer read useCatalog() from
  // CONTEXT — so a consumer who passed `catalog` as a PROP instead of mounting a
  // <Catalog> provider (both are documented) would otherwise crash every one of
  // them. Re-providing the context value when it is the source is a no-op.
  return <Catalog value={resolved as RilayInstance<Record<string, unknown>>}>{content}</Catalog>;
}
