import * as core from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';

describe('core public surface after de-renderer-ification', () => {
  it.each([
    'ComponentRendererWrapper',
    'ComponentBuilderMetadata',
    'PropertyEditorDefinition',
    'FieldSchemaDefinition',
  ])('does not export %s', (name) => {
    expect(name in core).toBe(false);
  });

  it('ril has no configure/addComponent anymore', () => {
    const r = ril.create();
    expect('configure' in r).toBe(false);
    expect('addComponent' in r).toBe(false);
  });

  it('getStats counts entries by kind', () => {
    const r = ril
      .create()
      .component('text', {})
      .tool('show_form', {})
      .part('text', { renderer: () => null as never });
    expect(r.getStats()).toEqual({ total: 3, components: 1, tools: 1, parts: 1 });
  });

  it('validate() accepts renderer-less blueprint entries', () => {
    const r = ril.create().component('text', { description: 'blueprint only' });
    expect(r.validate()).toEqual([]);
  });
});
