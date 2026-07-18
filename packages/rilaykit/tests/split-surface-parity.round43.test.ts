import * as kit from 'rilaykit';
import * as kitReact from 'rilaykit/react';
import { describe, expect, it } from 'vitest';

/**
 * Round 43 (bug hunt): the isomorphic-entry split hand-wrote SELECTIVE workflow
 * re-exports on both `rilaykit` (isomorphic) and `rilaykit/react`. A name present
 * on the pre-split `rilaykit` main but forgotten in BOTH new barrels is a silently
 * dropped public export — a breaking regression no other test would catch, because
 * the split was deliberately allowed to MOVE names. This pins that every runtime
 * value the old main exposed is still reachable from the union of the two entries.
 */

// Every VALUE (component / hook / function) the pre-split `rilaykit` main exposed
// from @rilaykit/workflow. Types are erased at runtime and checked in a .test-d.
const OLD_WORKFLOW_VALUES = [
  'Flow',
  'FlowBack',
  'FlowBody',
  'FlowNext',
  'FlowProgress',
  'FlowSkip',
  'useFlow',
  'useFlowActions',
  'useFlowData',
  'useFlowInitializing',
  'useFlowNavigationState',
  'useFlowStepIndex',
  'useFlowSteps',
  'useFlowStore',
  'useFlowStoreApi',
  'useFlowSubmitState',
  'useFlowSubmitting',
  'useFlowTransitioning',
  'useIsStepPassed',
  'useIsStepVisited',
  'usePassedSteps',
  'useStep',
  'useStepData',
  'useStepDataById',
  'useVisitedSteps',
  'usePersistence',
  'LocalStorageAdapter',
  'WorkflowPersistenceError',
  'debounce',
  'generateStorageKey',
  'mergePersistedState',
  'persistedToWorkflowState',
  'resolveAllowSkip',
  'resolveWorkflowConfig',
  'compileFlow',
  'isFlowSchema',
  'validateFlowSchema',
  'flow',
  'combineWorkflowDataForConditions',
  'flattenObject',
  'validatePersistedData',
  'workflowStateToPersisted',
] as const;

describe('Round 43: the split moved names without dropping any public export', () => {
  const union = new Set<string>([...Object.keys(kit), ...Object.keys(kitReact)]);

  it('every runtime value the pre-split rilaykit main exposed is still reachable', () => {
    const missing = OLD_WORKFLOW_VALUES.filter((name) => !union.has(name));
    expect(missing).toEqual([]);
  });

  it('isomorphic values stay on the main entry (not only /react)', () => {
    const isoValues = [
      'flow',
      'resolveWorkflowConfig',
      'compileFlow',
      'isFlowSchema',
      'validateFlowSchema',
      'LocalStorageAdapter',
      'WorkflowPersistenceError',
      'debounce',
      'generateStorageKey',
      'combineWorkflowDataForConditions',
      'flattenObject',
      'resolveAllowSkip',
    ];
    const missingFromMain = isoValues.filter((name) => !(name in kit));
    expect(missingFromMain).toEqual([]);
  });

  it('React values stay on the /react entry (not the isomorphic main)', () => {
    const reactValues = [
      'Flow',
      'FlowBody',
      'useFlow',
      'useFlowData',
      'useFlowStoreApi',
      'usePersistence',
      'useStep',
    ];
    const missingFromReact = reactValues.filter((name) => !(name in kitReact));
    expect(missingFromReact).toEqual([]);
    // ...and must NOT leak onto the isomorphic main (would re-poison RSC use).
    const leakedToMain = reactValues.filter((name) => name in kit);
    expect(leakedToMain).toEqual([]);
  });
});
