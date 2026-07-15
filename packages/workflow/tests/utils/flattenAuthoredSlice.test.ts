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

    expect(flat).toEqual({ note: 'kept', 'lines[k0].label': 'gamma' });
  });

  it('leaves the composite keys of an untouched repeatable alone', () => {
    const slice = { 'lines[k0].label': 'alpha', note: 'kept' };
    expect(flattenAuthoredSlice(slice, LINES)).toBe(slice);
  });
});
