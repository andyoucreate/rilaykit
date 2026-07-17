import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { manifest } from '../../src/manifest/manifest';
import { uiTools } from '../../src/tools/ui-tools';

/**
 * Round 24: manifest UI guidance must be gated on tool EMITTABILITY, not mere
 * registration. A show_* tool registered renderer-only (no inputSchema) is not
 * advertised in "Available tools" and is excluded by both adapters — so guiding
 * the model to call it produces an undispatchable tool call.
 */
describe('Round 24: manifest guidance follows emittability, not registration', () => {
  it('does not guide a show_form that is registered renderer-only (no inputSchema)', () => {
    const catalog = ril
      .create()
      .component('note', {
        description: 'A note',
        propsSchema: z.object({ text: z.string() }),
      })
      // Renderer-only show_form: registered (getTool is truthy) but NOT emittable.
      .tool('show_form', { description: 'custom chrome', renderer: () => null });

    const output = manifest(catalog);

    expect(output).not.toContain('Use `show_form`');
    expect(output).not.toContain('- **show_form**');
  });

  it('does guide a show_form that uiTools() registers with an inputSchema (control)', () => {
    const catalog = ril
      .create()
      .component('note', {
        description: 'A note',
        propsSchema: z.object({ text: z.string() }),
      })
      .use(uiTools());

    const output = manifest(catalog);

    expect(output).toContain('Use `show_form`');
  });
});
