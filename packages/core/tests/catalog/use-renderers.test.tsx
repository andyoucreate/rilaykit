import { NotFoundError, ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';

describe('ril.use()', () => {
  it('applies a plugin that registers entries', () => {
    const plugin = <R extends ril<Record<string, unknown>>>(r: R): R =>
      r.tool('show_form', { description: 'from plugin' }) as R;
    const r = ril.create().use(plugin);
    expect(r.getTool('show_form')?.description).toBe('from plugin');
  });
});

describe('ril.renderers()', () => {
  it('attaches renderers to existing entries without touching schemas', () => {
    const base = ril
      .create()
      .component('text', { description: 'kept' })
      .tool('show_form', { description: 'kept too' });
    const r = base.renderers({
      components: { text: ({ id }) => <input data-id={id} /> },
      tools: { show_form: ({ state }) => <div data-state={state} /> },
    });
    expect(typeof r.getComponent('text')?.renderer).toBe('function');
    expect(r.getComponent('text')?.description).toBe('kept');
    expect(() =>
      // @ts-expect-error — unknown component key is rejected statically
      base.renderers({ components: { nope: () => <i /> } })
    ).toThrowError(NotFoundError);
    expect(typeof r.getTool('show_form')?.renderer).toBe('function');
    expect(r.getTool('show_form')?.description).toBe('kept too');
    // immutability
    expect(base.getComponent('text')?.renderer).toBeUndefined();
  });

  it('throws NotFoundError for an unknown key', () => {
    const r = ril.create();
    expect(() => r.renderers({ components: { ghost: () => <i /> } })).toThrowError(NotFoundError);
    try {
      r.renderers({ tools: { ghost: () => <i /> } });
    } catch (e) {
      expect((e as NotFoundError).meta).toEqual({ key: 'tool:ghost' });
    }
  });
});
