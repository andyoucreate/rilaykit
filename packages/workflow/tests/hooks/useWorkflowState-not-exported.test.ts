import * as wf from '@rilaykit/workflow';
import { describe, expect, it } from 'vitest';

/**
 * `useWorkflowState` was a SECOND, parallel implementation of the workflow
 * store — a reducer superseded by `createWorkflowStore`, kept exported and
 * never called by anything.
 *
 * A second store is by construction a place the store's invariants do not
 * reach: it wiped a step's untouched defaults on the user's first edit (the
 * round-5 CRITICAL, fixed in `createWorkflowStore` only), it crashed on
 * `Should have a queue` when a persistence adapter appeared between renders
 * (Rules of Hooks — WorkflowProvider fixed this for itself with
 * NOOP_PERSISTENCE_ADAPTER and the fix never came here), its reset discarded
 * the seeded defaults, and it knows nothing of the repeatable shape boundary.
 * The all-in-one already refused to re-export it
 * (packages/rilaykit/tests/surface.test.ts).
 *
 * `WorkflowState` — the TYPE — survives it: six modules describe the provider's
 * state with it. This pins the runtime gone and the type kept.
 */
describe('@rilaykit/workflow public surface', () => {
  it('does not ship the superseded useWorkflowState hook', () => {
    expect('useWorkflowState' in wf).toBe(false);
  });

  it('still ships the store that replaced it', () => {
    expect(typeof wf.createWorkflowStore).toBe('function');
  });
});
