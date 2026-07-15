import { describe, expect, it } from 'vitest';
import { createWorkflowStore } from '../../src/stores';

/**
 * `stepData` is the CURRENT step's mirror, and `allData` is the source of truth.
 *
 * A cross-step write — `helper.setStepFields('one', ...)` from step 'two' — used
 * to publish the other step's slice as the current step's mirror. Usually
 * self-healing, because `goToStep` re-seeds the mirror from the target slice;
 * but `onAfterValidation` on the LAST step has no navigation behind it, so the
 * mirror stayed wrong. `stepData` is host-visible AND is the override layer for
 * field conditions, so the current step's bare field names then resolved
 * against another step's values.
 */
describe('workflowStore — a cross-step write leaves the current step mirror alone', () => {
  it('does not publish another step slice as stepData', () => {
    const store = createWorkflowStore({
      defaultValues: { one: { a: 'A' }, two: { b: 'B' } },
      defaultStepIndex: 1,
      currentStepId: 'two',
    });

    store.getState()._setStepData({ b: 'B', seen: true }, 'two');
    expect(store.getState().stepData).toEqual({ b: 'B', seen: true });

    store.getState()._setStepData({ a: 'A', computed: 'from-two' }, 'one');

    // allData records the write...
    expect(store.getState().allData.one).toEqual({ a: 'A', computed: 'from-two' });
    // ...and the current step's mirror is untouched.
    expect(store.getState().stepData).toEqual({ b: 'B', seen: true });
  });

  it('follows the current step as navigation moves it', () => {
    const store = createWorkflowStore({
      defaultValues: { one: { a: 'A' }, two: { b: 'B' } },
      currentStepId: 'one',
    });

    store.getState()._setCurrentStep(1, 'two');
    store.getState()._setStepData({ b: 'B2' }, 'two');

    expect(store.getState().stepData).toEqual({ b: 'B2' });
  });
});
