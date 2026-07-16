import { z } from 'zod';

/**
 * Recursive via z.lazy — `z.toJSONSchema()` emits a `$ref`/`$defs` cycle that both
 * Anthropic and the AI SDK accept. Depth is bounded at render time by
 * `MAX_NODE_DEPTH` (see react/fallbacks/ShowComponent.tsx), not here.
 */
export const componentNodeSchema: z.ZodType<{
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}> = z.lazy(() =>
  z.object({
    type: z.string().describe('The component type, from the catalog listed in the system prompt'),
    props: z.record(z.string(), z.unknown()).optional().describe("The component's props"),
    children: z.array(componentNodeSchema).optional().describe('Nested components'),
  })
);
