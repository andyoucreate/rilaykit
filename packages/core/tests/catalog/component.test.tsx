import { DuplicateError, ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { entriesOf } from '../helpers/entries';

const textEntry = {
  description: 'Text input',
  propsSchema: z.object({ label: z.string() }),
  renderer: ({ id, props }: { id: string; props: { label: string } }) => (
    <input aria-label={props.label} data-id={id} />
  ),
  meta: { icon: 'text' },
};

describe('ril.component()', () => {
  it('registers a component retrievable by type', () => {
    const r = ril.create().component('text', textEntry);
    const entry = r.getComponent('text');
    expect(entry?.kind).toBe('component');
    expect(entry?.type).toBe('text');
    expect(entry?.description).toBe('Text input');
    expect(entry?.meta).toEqual({ icon: 'text' });
  });

  it('is immutable — the original instance is untouched', () => {
    const base = ril.create();
    const extended = base.component('text', textEntry);
    expect(base.hasComponent('text')).toBe(false);
    expect(extended.hasComponent('text')).toBe(true);
  });

  it('throws DuplicateError on double registration', () => {
    const r = ril.create().component('text', textEntry);
    expect(() => r.component('text', textEntry)).toThrowError(DuplicateError);
    try {
      r.component('text', textEntry);
    } catch (e) {
      expect((e as DuplicateError).code).toBe('DUPLICATE');
      expect((e as DuplicateError).meta).toEqual({ key: 'component:text' });
    }
  });

  it('replaces the whole entry with replace: true', () => {
    const r = ril
      .create()
      .component('text', textEntry)
      .component('text', { ...textEntry, description: 'Replaced', replace: true });
    expect(r.getComponent('text')?.description).toBe('Replaced');
  });

  it('keeps addComponent working as a delegate during migration', () => {
    const r = ril.create().addComponent('legacy', {
      name: 'Legacy',
      renderer: () => <span />,
    });
    expect(r.hasComponent('legacy')).toBe(true);
    expect(r.getComponent('legacy')?.name).toBe('Legacy');
  });

  it('excludes non-component entries from getAllComponents and getStats', () => {
    const empty = ril.create();
    entriesOf(empty).set('tool:x', { kind: 'tool', name: 'x' });
    expect(empty.getAllComponents()).toHaveLength(0);
    expect(empty.getStats().total).toBe(0);

    const mixed = ril.create().component('text', textEntry);
    entriesOf(mixed).set('tool:search', { kind: 'tool', name: 'search' });
    expect(mixed.getAllComponents()).toHaveLength(1);
    expect(mixed.getAllComponents()[0]?.type).toBe('text');
    expect(mixed.getStats().total).toBe(1);
  });
});
