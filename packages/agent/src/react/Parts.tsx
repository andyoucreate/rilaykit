import type { RilayInstance } from '@rilaykit/core';
import type React from 'react';
import type { Part as PartType } from '../types/part';
import { Part } from './Part';

export interface PartsProps<C = Record<string, unknown>> {
  readonly parts: readonly PartType[];
  /** `toolName` (the part's `name`) rides third so `addToolResult({ toolCallId,
   * tool: toolName, output })` compiles against the AI SDK, which REQUIRES the
   * tool name — additive, so 2-arg handlers keep type-checking. */
  readonly onResolve?: (toolCallId: string, output: unknown, toolName: string) => void;
  /** Generic over the catalog's component map — `RilayInstance` is invariant
   * in `C`, so a fixed map type would reject every fluently built catalog. */
  readonly catalog?: RilayInstance<C>;
  readonly fallback?: React.ComponentType<{ part: PartType }>;
}

/**
 * Dispatches a message's parts. Message-thread concerns (grouping consecutive tool
 * parts, scrolling, composers) are the host's — this renders a list and nothing else.
 */
export function Parts<C>({ parts, onResolve, catalog, fallback }: PartsProps<C>) {
  return (
    <>
      {parts.map((part, index) => (
        <Part
          key={part.type === 'tool' ? part.toolCallId : `${part.type}-${index}`}
          part={part}
          onResolve={onResolve}
          catalog={catalog}
          fallback={fallback}
        />
      ))}
    </>
  );
}
