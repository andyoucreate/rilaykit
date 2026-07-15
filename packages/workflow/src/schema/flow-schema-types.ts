import type { StepAllowSkip, StepConditionalBehavior, WorkflowConfig } from '@rilaykit/core';
import type { Bindings, FormSchema } from '@rilaykit/forms';
import type { StepDefinition } from '../builders/flow';

// =================================================================
// FLOW SCHEMA — the JSON-serializable workflow definition
// =================================================================

/** Predicate deciding whether a step may be skipped, given the collected data. */
export type AllowSkipPredicate = Exclude<StepAllowSkip, boolean>;

/**
 * Handler run after a step's validation succeeds.
 *
 * Typed from the builder's modern `after` input (a single `StepContext`), not
 * the deprecated 3-arg `onAfterValidation`: the builder owns the wrapping into
 * the legacy shape, so the schema layer never re-derives that transform.
 */
export type AfterValidationHandler = NonNullable<StepDefinition['after']>;

/**
 * A single step of a `FlowSchema`.
 *
 * Everything is JSON-serializable: non-serializable logic (skip predicates,
 * after-validation handlers) is referenced by string key and resolved from
 * consumer-supplied `FlowBindings` at compile time.
 */
export interface FlowSchemaStep {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** The step's form, compiled by `compileForm`. */
  readonly form: FormSchema;
  readonly conditions?: StepConditionalBehavior;
  /** Static boolean, or a `{ binding }` reference into `FlowBindings.allowSkip`. */
  readonly allowSkip?: boolean | { readonly binding: string };
  readonly metadata?: Record<string, unknown>;
  /** Binding key into `FlowBindings.after`. */
  readonly onAfterValidation?: string;
}

/** A JSON-serializable multi-step workflow definition. */
export interface FlowSchema {
  readonly version?: 1;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: FlowSchemaStep[];
}

/**
 * Consumer-supplied resolution for a `FlowSchema`'s string references.
 *
 * Extends the forms `Bindings`, so a single object resolves field-level
 * validators/effects AND step-level allowSkip/after handlers.
 */
export type FlowBindings = Bindings & {
  /** Skip predicates indexed by key. */
  readonly allowSkip?: Record<string, AllowSkipPredicate>;
  /** After-validation handlers indexed by key. */
  readonly after?: Record<string, AfterValidationHandler>;
};

/** Options accepted by `compileFlow`. */
export type CompileFlowOptions = {
  /** Resolution for the schema's allowSkip/after/validator/effect string references. */
  readonly bindings?: FlowBindings;
  /**
   * Check every step's field props against their component's `propsSchema`,
   * the mirror of `CompileFormOptions.validateProps`.
   *
   * Off by default, as for a form. On, a violation throws
   * `SchemaValidationError` carrying every offending prop across every step in
   * one `issues[]` — each with a `steps[i].form.fields[j].props.<key>` path and
   * the component's `expectedKeys` — so a schema's author, human or agent, can
   * correct the whole document in one round trip.
   */
  readonly validateProps?: boolean;
};

/**
 * Result of `compileFlow()` — the mirror of `FormSchemaResult`.
 *
 * `WorkflowConfig` has no defaults slot, so each step's compiled defaults come
 * back out of band, keyed by step id (`{ stepA: { field: value } }`) — exactly
 * the shape `<Flow defaults>` / `WorkflowProvider.defaultValues` consume.
 */
export interface FlowSchemaResult {
  readonly workflowConfig: WorkflowConfig;
  /** Per-step defaults keyed by step id; `undefined` when no step declares any. */
  readonly defaultValues?: Record<string, unknown>;
}
