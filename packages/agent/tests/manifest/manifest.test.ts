import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { manifest } from '../../src/manifest/manifest';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('select', {
    description: 'Dropdown selection with predefined options',
    propsSchema: z.object({
      label: z.string().describe('Visible field label'),
      placeholder: z.string().optional(),
    }),
  })
  .component('badge', { description: 'A small status badge', propsSchema: z.object({ label: z.string() }) })
  .tool('search_flights', { description: 'Search flights', inputSchema: z.object({ from: z.string() }) })
  .use(uiTools());

describe('manifest()', () => {
  const output = manifest(catalog);

  it('lists every component with its description', () => {
    expect(output).toContain('select');
    expect(output).toContain('Dropdown selection with predefined options');
    expect(output).toContain('badge');
  });

  it("lists each component's props so the model can emit them", () => {
    expect(output).toContain('label');
    expect(output).toContain('Visible field label');
  });

  it('marks optional props as optional', () => {
    expect(output).toMatch(/placeholder.*optional/i);
  });

  it('teaches when to use show_form vs show_component', () => {
    expect(output).toContain('show_form');
    expect(output).toContain('show_component');
  });

  it('is deterministic — same catalog, same string', () => {
    expect(manifest(catalog)).toBe(output);
  });

  it('does not list host tools that are renderer-only (no inputSchema)', () => {
    const withRendererOnly = ril.create().tool('internal_only', { description: 'Host executed' });
    expect(manifest(withRendererOnly)).not.toContain('internal_only');
  });

  it('handles an empty catalog without crashing', () => {
    expect(typeof manifest(ril.create())).toBe('string');
  });
});
