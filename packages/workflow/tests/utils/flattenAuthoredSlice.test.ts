import type { RepeatableFieldConfig } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { flattenAuthoredSlice } from '../../src/utils/normalizeRepeatableSlices';

const LINES: Record<string, RepeatableFieldConfig> = {
  lines: {
    id: 'lines',
    fields: [{ id: 'label', type: 'text', props: {} }],
  } as unknown as RepeatableFieldConfig,
};

describe('flattenAuthoredSlice — re-authoring a repeatable REPLACES its rows', () => {
  it('drops the composite keys of rows the authored array no longer has', () => {
    // A helper merge (`setStepFields`) layers an authored array over a slice
    // that already holds the flat truth. Fewer rows means fewer rows: a stale
    // key surviving here is a row the user cannot see but the backend receives.
    const flat = flattenAuthoredSlice(
      {
        'lines[k0].label': 'alpha',
        'lines[k1].label': 'beta',
        note: 'kept',
        lines: [{ label: 'gamma' }],
      },
      LINES
    );

    expect(flat.slice).toEqual({ note: 'kept', 'lines[k0].label': 'gamma' });
  });

  it('leaves the composite keys of an untouched repeatable alone', () => {
    const slice = { 'lines[k0].label': 'alpha', note: 'kept' };
    expect(flattenAuthoredSlice(slice, LINES).slice).toBe(slice);
  });
});

describe('flattenAuthoredSlice — reporting the row keys it assigned', () => {
  // The order mirror cannot be kept honest by a caller that does not know which
  // rows were re-keyed, and only this function knows: it is the one that decides
  // whether the mirror still describes the rows it is handed. See
  // `reconcileRepeatableOrders`.
  it('reports the mirrored keys when it honours the mirror', () => {
    const flat = flattenAuthoredSlice({ lines: [{ label: 'a' }, { label: 'b' }] }, LINES, {
      lines: ['k1', 'k0'],
    });

    expect(flat.rowKeys).toEqual({ lines: ['k1', 'k0'] });
    expect(flat.slice).toEqual({ 'lines[k1].label': 'a', 'lines[k0].label': 'b' });
  });

  it('reports the fresh keys when the mirror cannot be describing these rows', () => {
    // Three rows against an arrangement of two: the mirror is stale, so the rows
    // are re-indexed — and saying so is what lets the store retire the claim.
    const flat = flattenAuthoredSlice(
      { lines: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] },
      LINES,
      { lines: ['k1', 'k0'] }
    );

    expect(flat.rowKeys).toEqual({ lines: ['k0', 'k1', 'k2'] });
  });

  it('reports nothing when the slice re-authors no rows', () => {
    expect(flattenAuthoredSlice({ 'lines[k0].label': 'a' }, LINES).rowKeys).toEqual({});
  });
});
