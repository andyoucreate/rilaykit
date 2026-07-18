import { describe, expect, it } from 'vitest';
import { isEmptyValue } from '../../src/validation/utils';
import { required } from '../../src/validation/validators';

describe('isEmptyValue - non-plain objects are never empty', () => {
  it('treats a filled Date as non-empty', () => {
    expect(isEmptyValue(new Date())).toBe(false);
  });

  it('treats a non-empty Map as non-empty', () => {
    expect(isEmptyValue(new Map([['a', 1]]))).toBe(false);
  });

  it('treats a non-empty Set as non-empty', () => {
    expect(isEmptyValue(new Set([1]))).toBe(false);
  });

  it('treats an empty plain object as empty', () => {
    expect(isEmptyValue({})).toBe(true);
  });

  it('treats a non-empty plain object as non-empty', () => {
    expect(isEmptyValue({ a: 1 })).toBe(false);
  });

  it('treats an empty string as empty', () => {
    expect(isEmptyValue('')).toBe(true);
  });

  it('treats an empty array as empty', () => {
    expect(isEmptyValue([])).toBe(true);
  });
});

describe('required() with non-plain objects', () => {
  it('accepts a filled Date value', () => {
    const value = new Date();
    const result = required()['~standard'].validate(value);
    expect(result).toEqual({ value });
  });
});
