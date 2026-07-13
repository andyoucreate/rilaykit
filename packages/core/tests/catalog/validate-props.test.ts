import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfigurationError, NotFoundError, ril } from '@rilaykit/core';

const r = ril.create().component('select', {
  propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
});

describe('ril.validateProps()', () => {
  it('returns success with the parsed value', () => {
    const result = r.validateProps('select', { label: 'Country', options: ['fr'] });
    expect(result).toEqual({ success: true, value: { label: 'Country', options: ['fr'] } });
  });

  it('returns issues and expectedKeys on invalid props', () => {
    const result = r.validateProps('select', { label: 42 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toContain('expected string');
      expect(result.issues[0]?.path).toEqual(['label']);
      expect(result.expectedKeys).toEqual(['label', 'options']);
    }
  });

  it('omits expectedKeys for non-zod schemas without a shape', () => {
    const syncFail = {
      '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [{ message: 'nope' }] }) },
    };
    const custom = ril.create().component('custom', { propsSchema: syncFail as never });
    expect(custom.validateProps('custom', {})).toEqual({
      success: false,
      issues: [{ message: 'nope' }],
      expectedKeys: undefined,
    });
  });

  it('passes through when the component has no propsSchema', () => {
    const loose = ril.create().component('free', {});
    expect(loose.validateProps('free', { anything: true })).toEqual({
      success: true,
      value: { anything: true },
    });
  });

  it('throws NotFoundError for an unknown component', () => {
    expect(() => r.validateProps('ghost', {})).toThrowError(NotFoundError);
    expect(() => r.validateProps('ghost', {})).toThrowError(
      'Component "ghost" not found in catalog'
    );
  });

  it('throws ConfigurationError for async schemas', () => {
    const asyncSchema = {
      '~standard': { version: 1, vendor: 'test', validate: () => Promise.resolve({ value: {} }) },
    };
    const bad = ril.create().component('async', {
      propsSchema: asyncSchema as never,
    });
    expect(() => bad.validateProps('async', {})).toThrowError(ConfigurationError);
    expect(() => bad.validateProps('async', {})).toThrowError(
      'propsSchema of "async" is async — props schemas must validate synchronously'
    );
  });
});
