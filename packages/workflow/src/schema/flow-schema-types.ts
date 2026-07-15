import type { StepAllowSkip, StepConditionalBehavior, StepConfig } from '@rilaykit/core';
import type { Bindings, FormSchema } from '@rilaykit/forms';

// =================================================================
// FLOW SCHEMA — the JSON-serializable workflow definition
// =================================================================

/** Predicate deciding whether a step may be skipped, given the collected data. */
export type AllowSkipPredicate = Exclude<StepAllowSkip, boolean>;

/** Handler run after a step's validation succeeds. */
export type AfterValidationHandler = NonNullable<StepConfig['onAfterValidation']>;

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
  readonly allowSkip?: Extract<StepAllowSkip, boolean> | { readonly binding: string };
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
};
