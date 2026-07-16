import React, { useCallback } from 'react';
import { ConfigurationError, type RilayInstance } from '@rilaykit/core';
import { useCatalogOrNull } from '@rilaykit/core/react';
import { isToolPart, type Part as PartType } from '../types/part';
import { DefaultTool } from './fallbacks/DefaultTool';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

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
