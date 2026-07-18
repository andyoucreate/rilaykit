import {
  ConfigurationError,
  NotFoundError,
  combine,
  minLength,
  required,
  ril,
} from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const r = ril.create().component('select', {
  propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
});

describe('ril.validateProps()', () => {
  it('returns success with the parsed value, not the raw input', () => {
    const result = r.validateProps('select', { label: 'Country', options: ['fr'], extra: 1 });
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
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'nope' }] }),
      },
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

  it('throws NotFoundError with entry-key meta for an unknown component', () => {
    let caught: unknown;
    try {
      r.validateProps('ghost', {});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotFoundError);
    expect((caught as NotFoundError).message).toBe('Component "ghost" not found in catalog');
    expect((caught as NotFoundError).meta).toEqual({ key: 'component:ghost' });
  });

  it('accepts a synchronous combine() propsSchema without throwing (Bug 3)', () => {
    const combined = ril
      .create()
      .component('combined', { propsSchema: combine(required(), minLength(3)) as never });
    expect(combined.validateProps('combined', 'hello')).toEqual({
      success: true,
      value: 'hello',
    });
    const invalid = combined.validateProps('combined', 'ab');
    expect(invalid.success).toBe(false);
  });

  it('throws ConfigurationError for async schemas', () => {
    const asyncSchema = {
      '~standard': { version: 1, vendor: 'test', validate: () => Promise.resolve({ value: {} }) },
    };
    const bad = ril.create().component('async', {
      propsSchema: asyncSchema as never,
    });
    let caught: unknown;
    try {
      bad.validateProps('async', {});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigurationError);
    expect((caught as ConfigurationError).message).toBe(
      'propsSchema of "async" is async — props schemas must validate synchronously'
    );
    expect((caught as ConfigurationError).meta).toEqual({ key: 'component:async' });
  });
});
