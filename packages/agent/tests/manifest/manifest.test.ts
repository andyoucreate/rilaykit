import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tools as anthropicTools } from '../../src/anthropic';
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
  .component('badge', {
    description: 'A small status badge',
    propsSchema: z.object({ label: z.string() }),
  })
  .tool('search_flights', {
    description: 'Search flights',
    inputSchema: z.object({ from: z.string() }),
  })
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

  // Pins: the remaining degrade arms, one per guard in `describeProps`/`manifest`.
  it('degrades a NON-OBJECT propsSchema (JSON Schema without `properties`) to description-only', () => {
    const scalarProps = ril.create().component('plain', {
      description: 'Takes a bare string, not an object',
      propsSchema: z.string(),
    });
    const output = manifest(scalarProps);
    expect(output).toContain('- **plain** — Takes a bare string, not an object');
    expect(output).not.toMatch(/^\s{4}- /m);
  });

  it('renders a prop whose JSON Schema carries no `type` (a union) as `unknown`, and an all-optional object without a required list', () => {
    const unionProps = ril.create().component('mixed', {
      description: 'Union-typed prop',
      propsSchema: z.object({ value: z.union([z.string(), z.number()]).optional() }),
    });
    const output = manifest(unionProps);
    expect(output).toContain('    - value: unknown (optional)');
  });

  it('lists a description-less component and a description-less tool by bare name', () => {
    const bare = ril
      .create()
      .component('divider', {})
      .tool('bare_tool', { inputSchema: z.object({}) });
    const output = manifest(bare);
    expect(output).toContain('- **divider**\n');
    expect(output).toContain('- **bare_tool**\n');
    expect(output).not.toContain('- **divider** —');
    expect(output).not.toContain('- **bare_tool** —');
  });

  // RED before the fix: manifest() advertised every tool that carried an
  // inputSchema, while the anthropic adapter DROPS tools whose schema cannot
  // convert to JSON Schema. The model was told about tools it could never
  // call. These tests pin the symmetry: a tool appears in the manifest if and
  // only if the adapters can emit a definition for it.
  describe('advertises a tool only when it is actually callable (manifest ↔ adapter symmetry)', () => {
    it('omits a tool whose inputSchema is not JSON-projectable and has no inputJsonSchema — absent from manifest() AND anthropic tools()', () => {
      const catalog = ril
        .create()
        .tool('search_flights', {
          description: 'Search flights',
          inputSchema: z.object({ from: z.string() }),
        })
        .tool('t_custom', {
          description: 'z.custom() cannot be represented in JSON Schema',
          inputSchema: z.custom(() => true),
        });

      const output = manifest(catalog);
      expect(output).toContain('- **search_flights** — Search flights');
      expect(output).not.toContain('t_custom');
      expect(anthropicTools(catalog).map((tool) => tool.name)).toEqual(['search_flights']);
    });

    it('omits a z.date() tool (another unrepresentable zod type) from the manifest', () => {
      const catalog = ril.create().tool('t_date', {
        description: 'Takes a date',
        inputSchema: z.object({ when: z.date() }),
      });
      expect(manifest(catalog)).not.toContain('t_date');
      expect(anthropicTools(catalog)).toEqual([]);
    });

    it('lists an unprojectable tool that supplies a manual inputJsonSchema — present in manifest() AND anthropic tools()', () => {
      const catalog = ril.create().tool('t_custom', {
        description: 'Unprojectable schema with a manual JSON Schema escape hatch',
        inputSchema: z.custom(() => true),
        inputJsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
      });

      expect(manifest(catalog)).toContain(
        '- **t_custom** — Unprojectable schema with a manual JSON Schema escape hatch'
      );
      expect(anthropicTools(catalog).map((tool) => tool.name)).toEqual(['t_custom']);
    });

    it('omits a non-zod Standard Schema without the jsonSchema extension and without inputJsonSchema', () => {
      const catalog = ril.create().tool('vendor_tool', {
        description: 'Non-zod vendor, no extension, no escape hatch',
        inputSchema: {
          '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) },
        } as never,
      } as never);
      expect(manifest(catalog)).not.toContain('vendor_tool');
      expect(anthropicTools(catalog)).toEqual([]);
    });
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

// RED before the fix: the "How to show UI" block was appended unconditionally,
// telling the model to call show_form/show_flow/show_component even when the
// catalog never registered them. Guidance must follow the registered tools.
describe('manifest() — "How to show UI" guidance follows the registered show_* tools', () => {
  it('omits the section entirely for a catalog without uiTools()', () => {
    const catalog = ril.create().tool('search_flights', {
      description: 'Search flights',
      inputSchema: z.object({ from: z.string() }),
    });
    const output = manifest(catalog);
    expect(output).not.toContain('How to show UI');
    expect(output).not.toContain('show_form');
    expect(output).not.toContain('show_flow');
    expect(output).not.toContain('show_component');
  });

  it('mentions all three show_* tools when uiTools() is registered', () => {
    const output = manifest(ril.create().use(uiTools()));
    expect(output).toContain('## How to show UI');
    expect(output).toContain('Use `show_form`');
    expect(output).toContain('Use `show_flow`');
    expect(output).toContain('Use `show_component`');
  });

  it('mentions only the registered subset when a single show_* tool exists', () => {
    const catalog = ril.create().tool('show_component', {
      description: 'Show a component from the catalog.',
      inputSchema: z.object({ node: z.unknown() }),
    });
    const output = manifest(catalog);
    expect(output).toContain('## How to show UI');
    expect(output).toContain('Use `show_component`');
    expect(output).not.toContain('show_form');
    expect(output).not.toContain('show_flow');
  });
});
