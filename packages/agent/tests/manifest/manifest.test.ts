import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
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

describe('manifest() — never-throws degrade paths', () => {
  // RED before the fix: `describeProps` accessed `schema['~standard'].jsonSchema`
  // unguarded, so a truthy propsSchema lacking the `~standard` key threw
  // `TypeError: Cannot read properties of undefined (reading 'jsonSchema')`
  // instead of degrading. This pins the fix.
  it('degrades a malformed propsSchema (missing `~standard`) to description-only instead of throwing', () => {
    const malformedSchema = { foo: 'bar' } as unknown as StandardSchemaV1;
    const catalogWithMalformedSchema = ril.create().component('gauge', {
      description: 'A malformed-schema component',
      propsSchema: malformedSchema,
    });

    let output = '';
    expect(() => {
      output = manifest(catalogWithMalformedSchema);
    }).not.toThrow();

    expect(output).toContain('- **gauge** — A malformed-schema component');
    expect(output).not.toMatch(/^\s{4}- /m);
  });

  // Already-correct behavior (pin, not a bugfix): a component with no
  // propsSchema at all lists its description with no prop lines.
  it('lists a component with no propsSchema at all, description-only', () => {
    const catalogWithoutPropsSchema = ril.create().component('spinner', {
      description: 'A schema-less component',
    });

    const output = manifest(catalogWithoutPropsSchema);

    expect(output).toContain('- **spinner** — A schema-less component');
    expect(output).not.toMatch(/^\s{4}- /m);
  });

  // Already-correct behavior (pin, not a bugfix): the try/catch around
  // `~standard.jsonSchema.output(...)` already degrades a throwing converter
  // to description-only instead of propagating.
  it('degrades a Standard Schema whose `~standard.jsonSchema.output()` throws to description-only', () => {
    const throwingSchema = {
      '~standard': {
        version: 1,
        vendor: 'test-vendor',
        validate: () => ({ value: undefined }),
        jsonSchema: {
          output: () => {
            throw new Error('conversion not supported');
          },
        },
      },
    } as unknown as StandardSchemaV1;
    const catalogWithThrowingSchema = ril.create().component('meter', {
      description: 'A throwing-converter component',
      propsSchema: throwingSchema,
    });

    let output = '';
    expect(() => {
      output = manifest(catalogWithThrowingSchema);
    }).not.toThrow();

    expect(output).toContain('- **meter** — A throwing-converter component');
    expect(output).not.toMatch(/^\s{4}- /m);
  });
});
