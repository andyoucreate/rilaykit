import type { StepConfig } from '@rilaykit/core';
import { describe, expect, it, vi } from 'vitest';
import { resolveAllowSkip } from '../../src/utils/resolveAllowSkip';

function makeStep(allowSkip?: StepConfig['allowSkip']): StepConfig {
  return { id: 's', title: 'S', allowSkip } as StepConfig;
}

describe('resolveAllowSkip', () => {
  it('returns true for a static allowSkip: true', () => {
    expect(resolveAllowSkip(makeStep(true), {})).toBe(true);
  });

  it('returns false for a static allowSkip: false', () => {
    expect(resolveAllowSkip(makeStep(false), {})).toBe(false);
  });

  it('returns false when allowSkip is undefined', () => {
    expect(resolveAllowSkip(makeStep(undefined), {})).toBe(false);
  });

  it('returns true when the predicate returns true', () => {
    expect(
      resolveAllowSkip(
        makeStep(() => true),
        {}
      )
    ).toBe(true);
  });

  it('returns false when the predicate returns false', () => {
    expect(
      resolveAllowSkip(
        makeStep(() => false),
        {}
      )
    ).toBe(false);
  });

  it('invokes the predicate with the exact { allData } context', () => {
    const predicate = vi.fn(() => true);
    const allData = { step1: { vip: true } };

    expect(resolveAllowSkip(makeStep(predicate), allData)).toBe(true);
    expect(predicate).toHaveBeenCalledTimes(1);
    expect(predicate).toHaveBeenCalledWith({ allData });
  });
});
