import { DuplicateError, ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('ril.tool() / ril.part()', () => {
  it('registers a tool with schema and retrieves it', () => {
    const r = ril.create().tool('search_flights', {
      description: 'Search flights',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
    });
    const tool = r.getTool('search_flights');
    expect(tool?.kind).toBe('tool');
    expect(tool?.name).toBe('search_flights');
    expect(tool?.description).toBe('Search flights');
  });

  it('registers a renderer-only tool (no schema)', () => {
    const r = ril.create().tool('host_tool', {
      renderer: ({ state }) => <div data-state={state} />,
    });
    expect(r.getTool('host_tool')?.inputSchema).toBeUndefined();
  });

  it('registers a part and lists entries by kind', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => <input /> })
      .tool('t1', {})
      .part('text', { renderer: ({ part }) => <p>{String(part)}</p> });
    expect(r.getAllTools().map((t) => t.name)).toEqual(['t1']);
    expect(r.getAllParts().map((p) => p.type)).toEqual(['text']);
    expect(r.getAllComponents().map((c) => c.type)).toEqual(['text']);
    expect(r.getPart('text')?.kind).toBe('part');
  });

  it('component and part namespaces do not collide', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => <input /> })
      .part('text', { renderer: () => <p /> });
    expect(r.getComponent('text')?.kind).toBe('component');
    expect(r.getPart('text')?.kind).toBe('part');
  });

  it('throws DuplicateError on tool double registration without replace', () => {
    const r = ril.create().tool('x', {});
    expect(() => r.tool('x', {})).toThrowError(DuplicateError);
    expect(r.tool('x', { description: 'v2', replace: true }).getTool('x')?.description).toBe('v2');
  });
});
