import type { RilayPlugin } from '@rilaykit/core';
import { z } from 'zod';
import { componentNodeSchema } from './component-node-schema';

/**
 * Registers the premium UI tools as PURE SCHEMAS — this module is imported by
 * `lib/catalog.ts`, which the server imports. It must never pull React.
 *
 * Renderers come from <Parts>' built-in fallbacks or the app's `.renderers()`.
 *
 * Tool names use intention verbs (`show_*`, not `render_*`): the agent *shows*
 * something to a human. Proven to steer models better (cf. stndrds `ask_questions`).
 */
export function uiTools(): RilayPlugin {
  return (r) =>
    r
      .tool('show_form', {
        description:
          'Show an interactive form to the user and wait for their answers. Use for collecting structured input.',
        // `z.looseObject` (not `z.unknown()`): the native projection is object-typed
        // on BOTH adapter paths, so models emit a nested object instead of a
        // stringified JSON (issue #23). All keys optional + extra keys allowed keeps
        // validation permissive — every valid FormSchema passes and `compileForm`
        // still owns the real validation and its retry channel.
        inputSchema: z.object({
          schema: z
            .looseObject({
              id: z.string().optional(),
              fields: z.array(z.unknown()).optional(),
            })
            .describe('A FormSchema: { id, fields: [{ id, type, props }] }'),
        }),
      })
      .tool('show_flow', {
        description:
          'Show a multi-step flow to the user. Use when input is long enough to warrant steps.',
        inputSchema: z.object({
          schema: z
            .looseObject({
              id: z.string().optional(),
              name: z.string().optional(),
              steps: z.array(z.unknown()).optional(),
            })
            .describe('A FlowSchema: { id, name, steps: [{ id, title, form }] }'),
        }),
      })
      .tool('show_component', {
        description:
          'Show a component, or a tree of components, from the catalog. Use for display — not for collecting input.',
        inputSchema: z.object({ node: componentNodeSchema }),
      });
}
