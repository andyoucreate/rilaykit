import { Parts } from '@rilaykit/agent/react';
import { describe, it } from 'vitest';
import type { Part as PartType } from '../../src/types/part';

/**
 * E2E-1: the documented client integration (spec §7) must compile against the
 * real AI SDK. `addToolResult` REQUIRES `tool` — the tool NAME — in every
 * shipped version (verified against ai@5.0.214 + @ai-sdk/react@4.0.32 and
 * ai@7.0.29: omitting it is `TS2345 Property 'tool' is missing`). The agent
 * package must not import `ai` itself, so the assertion runs against a
 * structural stand-in of `addToolResult` with the same required fields.
 *
 * The tripwire: `onResolve` must deliver the tool name as its third argument,
 * otherwise the documented one-liner cannot call `addToolResult` without a
 * cast or a manual `filter(isToolPart)` lookup.
 */
declare function addToolResult(args: {
  toolCallId: string;
  tool: string;
  output: unknown;
}): void | PromiseLike<void>;

const parts: readonly PartType[] = [];

describe('E2E-1: the documented onResolve → addToolResult integration compiles', () => {
  it('threads the tool name so addToolResult({ toolCallId, tool, output }) type-checks', () => {
    <Parts
      parts={parts}
      onResolve={(toolCallId, output, toolName) =>
        addToolResult({ toolCallId, tool: toolName, output })
      }
    />;
  });

  it('stays additive: existing 2-arg onResolve handlers still type-check', () => {
    const twoArgSink = (toolCallId: string, output: unknown): void => {
      void toolCallId;
      void output;
    };
    <Parts parts={parts} onResolve={twoArgSink} />;
  });
});
