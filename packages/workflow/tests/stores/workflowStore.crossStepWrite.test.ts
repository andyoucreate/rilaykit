import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { describe, expect, it } from 'vitest';
import { flow } from '../../src/builders/flow';
import { createWorkflowStore } from '../../src/stores';

/**
 * The store names the mirror's owner from its OWN steps, so a test that wants a
 * store able to tell a cross-step write from a current-step one hands it steps —
 * the same configuration the provider builds. A store without `steps` cannot
 * enforce either of its invariants and would make these assertions vacuous.
 */
const catalog = ril.create();
const STEPS = flow
  .create(catalog, 'wf', 'W')
  .addStep({ id: 'one', title: 'One', formConfig: form.create(catalog, 'f1') })
  .addStep({ id: 'two', title: 'Two', formConfig: form.create(catalog, 'f2') })
  .build().steps;

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
      getSteps: () => STEPS,
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
      getSteps: () => STEPS,
    });

    store.getState()._setCurrentStep(1);
    store.getState()._setStepData({ b: 'B2' }, 'two');

    expect(store.getState().stepData).toEqual({ b: 'B2' });
  });
});
