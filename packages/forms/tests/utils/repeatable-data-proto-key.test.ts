import type { RepeatableFieldConfig } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { flattenRepeatableValues } from '../../src/utils/repeatable-data';

/**
 * VERDICT (round 2): reachable, but an object-local prototype graft — NOT
 * prototype pollution and NOT exploitable, since the target is a fresh local
 * object that never reaches Object.prototype.
 *
 * It is still wrong: a `__proto__` default must be RECORDED as a real key, not
 * swallowed by Object.prototype's accessor and lost from the form's values.
 *
 * `JSON.parse` is the realistic source — and the only way to build the input,
 * since an object literal's `__proto__` sets the prototype instead of a key.
 */
describe('flattenRepeatableValues with a __proto__ key', () => {
  it('records a __proto__ field as a real own key instead of grafting a prototype', () => {
    const data = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;

    const { values } = flattenRepeatableValues(data, {});

    expect(Object.prototype.hasOwnProperty.call(values, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(values, '__proto__')?.value).toEqual({
      polluted: true,
    });
    // The graft must not have happened: the object keeps a normal prototype.
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
    expect((values as Record<string, unknown>).polluted).toBeUndefined();
    // And nothing leaked to the global prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('records a __proto__ repeatable as a real own key in values/order/nextKeys', () => {
    const data = JSON.parse('{"__proto__":[{"name":"Home"}]}') as Record<string, unknown>;
    const configs = JSON.parse('{"__proto__":{}}') as Record<string, RepeatableFieldConfig>;
    Object.defineProperty(configs, '__proto__', {
      value: { id: '__proto__', allFields: [{ id: 'name', type: 'text', props: {} }], rows: [] },
      writable: true,
      enumerable: true,
      configurable: true,
    });

    const { values, order, nextKeys } = flattenRepeatableValues(data, configs);

    expect(values['__proto__[k0].name']).toBe('Home');
    expect(Object.prototype.hasOwnProperty.call(order, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(order, '__proto__')?.value).toEqual(['k0']);
    expect(Object.getOwnPropertyDescriptor(nextKeys, '__proto__')?.value).toBe(1);
  });
});
