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
    const tool = r.getTool('host_tool');
    expect(tool?.kind).toBe('tool');
    expect(tool?.name).toBe('host_tool');
    expect(tool?.renderer).toBeTypeOf('function');
    expect(tool?.inputSchema).toBeUndefined();
  });

  it('is immutable — the original instance is untouched', () => {
    const base = ril.create();
    const ext = base.tool('x', {}).part('p', { renderer: () => <p /> });
    expect(base.getTool('x')).toBeUndefined();
    expect(base.getPart('p')).toBeUndefined();
    expect(ext.getTool('x')?.kind).toBe('tool');
    expect(ext.getPart('p')?.kind).toBe('part');
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

  it('component, tool and part namespaces do not collide on the same identifier', () => {
    const r = ril
      .create()
      .component('x', { renderer: () => <input /> })
      .tool('x', {})
      .part('x', { renderer: () => <p /> });
    expect(r.getComponent('x')?.kind).toBe('component');
    expect(r.getTool('x')?.kind).toBe('tool');
    expect(r.getPart('x')?.kind).toBe('part');
  });

  it('throws DuplicateError on tool double registration without replace', () => {
    const r = ril.create().tool('x', {});
    expect(() => r.tool('x', {})).toThrowError(DuplicateError);
    try {
      r.tool('x', {});
    } catch (e) {
      expect((e as DuplicateError).code).toBe('DUPLICATE');
      expect((e as DuplicateError).meta).toEqual({ key: 'tool:x' });
    }
    expect(r.tool('x', { description: 'v2', replace: true }).getTool('x')?.description).toBe('v2');
  });

  it('throws DuplicateError on part double registration without replace', () => {
    const r = ril.create().part('text', { renderer: () => <p /> });
    expect(() => r.part('text', { renderer: () => <p /> })).toThrowError(DuplicateError);
    try {
      r.part('text', { renderer: () => <p /> });
    } catch (e) {
      expect((e as DuplicateError).code).toBe('DUPLICATE');
      expect((e as DuplicateError).meta).toEqual({ key: 'part:text' });
    }
    expect(
      r.part('text', { renderer: () => <p />, meta: { v: 2 }, replace: true }).getPart('text')?.meta
    ).toEqual({ v: 2 });
  });
});
