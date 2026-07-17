// Isomorphic TYPE exports the pre-split `rilaykit` main exposed from workflow —
// they must remain reachable from the isomorphic entry. A dropped type is a
// TS2305 here (the import fails to resolve), which the runtime parity test cannot
// see because types are erased.
import type {
  AfterValidationHandler,
  AllowSkipPredicate,
  CompileFlowOptions,
  FlowBindings,
  FlowSchema,
  FlowSchemaResult,
  FlowSchemaStep,
  LocalStorageAdapterConfig,
  PersistedWorkflowData,
  PersistenceOptions,
  StepContext,
  StepDefinition,
  StepMetadata,
  UsePersistenceReturn,
  WorkflowPersistenceAdapter,
  WorkflowStore,
  WorkflowStoreState,
} from 'rilaykit';
// React-only TYPE exports moved to the /react entry.
import type {
  FlowNavContext,
  FlowNavProps,
  FlowProgressProps,
  FlowStepsContext,
  StepContextValue,
  UseFlowActionsResult,
  UsePersistenceProps,
  WorkflowContextValue,
} from 'rilaykit/react';
import { describe, expectTypeOf, it } from 'vitest';

describe('Round 43: the split preserved every workflow TYPE export', () => {
  it('isomorphic types resolve from the main entry', () => {
    expectTypeOf<StepDefinition>().not.toBeAny();
    expectTypeOf<StepContext>().not.toBeAny();
    expectTypeOf<StepMetadata>().not.toBeAny();
    expectTypeOf<AfterValidationHandler>().not.toBeAny();
    expectTypeOf<AllowSkipPredicate>().not.toBeAny();
    expectTypeOf<CompileFlowOptions>().not.toBeAny();
    expectTypeOf<FlowBindings>().not.toBeAny();
    expectTypeOf<FlowSchema>().not.toBeAny();
    expectTypeOf<FlowSchemaResult>().not.toBeAny();
    expectTypeOf<FlowSchemaStep>().not.toBeAny();
    expectTypeOf<WorkflowStore>().not.toBeAny();
    expectTypeOf<WorkflowStoreState>().not.toBeAny();
    expectTypeOf<LocalStorageAdapterConfig>().not.toBeAny();
    expectTypeOf<PersistedWorkflowData>().not.toBeAny();
    expectTypeOf<PersistenceOptions>().not.toBeAny();
    expectTypeOf<UsePersistenceReturn>().not.toBeAny();
    expectTypeOf<WorkflowPersistenceAdapter>().not.toBeAny();
  });

  it('React types resolve from the /react entry', () => {
    expectTypeOf<FlowNavContext>().not.toBeAny();
    expectTypeOf<FlowNavProps>().not.toBeAny();
    expectTypeOf<FlowProgressProps>().not.toBeAny();
    expectTypeOf<WorkflowContextValue>().not.toBeAny();
    expectTypeOf<FlowStepsContext>().not.toBeAny();
    expectTypeOf<StepContextValue>().not.toBeAny();
    expectTypeOf<UseFlowActionsResult>().not.toBeAny();
    expectTypeOf<UsePersistenceProps>().not.toBeAny();
  });
});
