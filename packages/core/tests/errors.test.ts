import {
  ConfigurationError,
  DuplicateError,
  InvalidSchemaError,
  NotFoundError,
  RilayError,
  ValidationError,
} from '@rilaykit/core';
import { describe, expect, it } from 'vitest';

describe('RilayError hierarchy', () => {
  it('carries code and meta', () => {
    const err = new RilayError('boom', 'CONFIGURATION', { key: 'x' });
    expect(err.code).toBe('CONFIGURATION');
    expect(err.meta).toEqual({ key: 'x' });
    expect(err.name).toBe('RilayError');
    expect(err).toBeInstanceOf(Error);
  });

  it.each([
    [ValidationError, 'VALIDATION', 'ValidationError'],
    [DuplicateError, 'DUPLICATE', 'DuplicateError'],
    [NotFoundError, 'NOT_FOUND', 'NotFoundError'],
    [InvalidSchemaError, 'INVALID_SCHEMA', 'InvalidSchemaError'],
    [ConfigurationError, 'CONFIGURATION', 'ConfigurationError'],
  ] as const)('%o has code %s', (Ctor, code, name) => {
    const err = new Ctor('msg', { a: 1 });
    expect(err.code).toBe(code);
    expect(err.name).toBe(name);
    expect(err.message).toBe('msg');
    expect(err.meta).toEqual({ a: 1 });
    expect(err).toBeInstanceOf(RilayError);
  });
});
