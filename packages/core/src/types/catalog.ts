import type { StandardSchemaV1 } from '@standard-schema/spec';
import type React from 'react';
import type {
  ConditionalBehavior,
  FieldConditions,
  FieldEffects,
  FieldError,
  FieldValidationConfig,
} from './index';

export type ToolState = 'streaming' | 'ready' | 'done' | 'error';

export interface FieldBinding {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly onBlur: () => void;
  readonly error?: FieldError[];
  readonly disabled?: boolean;
  readonly isValidating?: boolean;
  readonly touched?: boolean;
}

export interface ComponentRenderContext<TProps = Record<string, unknown>> {
  readonly id: string;
  readonly props: TProps;
  readonly field?: FieldBinding;
  readonly conditions?: FieldConditions;
  readonly children?: React.ReactNode;
  readonly meta?: Record<string, unknown>;
}

export interface ComponentEntry<TProps = Record<string, unknown>> {
  readonly kind: 'component';
  readonly type: string;
  readonly name?: string;
  readonly description?: string;
  readonly propsSchema?: StandardSchemaV1<unknown, TProps>;
  readonly propsJsonSchema?: Record<string, unknown>;
  readonly renderer?: (ctx: ComponentRenderContext<TProps>) => React.ReactElement;
  readonly defaultProps?: Partial<TProps>;
  readonly validation?: FieldValidationConfig;
  readonly meta?: Record<string, unknown>;
  readonly replace?: boolean;
}

export interface ToolRenderContext<TInput = unknown, TOutput = unknown> {
  readonly toolCallId: string;
  readonly name: string;
  readonly state: ToolState;
  readonly input: TInput;
  readonly rawInput?: string;
  readonly output?: TOutput;
  readonly errorText?: string;
  readonly resolve: (output: TOutput) => void;
  readonly meta?: Record<string, unknown>;
}

export interface ToolEntry<TInput = unknown, TOutput = unknown> {
  readonly kind: 'tool';
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: StandardSchemaV1<unknown, TInput>;
  readonly inputJsonSchema?: Record<string, unknown>;
  readonly renderer?: (ctx: ToolRenderContext<TInput, TOutput>) => React.ReactElement;
  readonly meta?: Record<string, unknown>;
  readonly replace?: boolean;
}

export interface PartRenderContext<TPart = unknown> {
  readonly part: TPart;
  readonly meta?: Record<string, unknown>;
}

export interface PartEntry<TPart = unknown> {
  readonly kind: 'part';
  readonly type: string;
  readonly renderer: (ctx: PartRenderContext<TPart>) => React.ReactElement;
  readonly meta?: Record<string, unknown>;
  readonly replace?: boolean;
}

export type CatalogEntry = ComponentEntry<never> | ToolEntry<never, never> | PartEntry<never>;

/**
 * The discriminated union of valid field configs for a catalog `C` (the map
 * `{ componentType → propsType }`). Enables fully-typed dynamic/runtime field
 * building against the registered component types — no `any`.
 *
 * Each union member pins `type` to one registered key `K` and narrows `props`
 * to that component's own props, so an unregistered `type` or a prop of the
 * wrong shape is a compile error:
 *
 * ```typescript
 * type Cat = { text: { label?: string }; num: { min?: number } };
 * const ok: FieldConfigFor<Cat> = { id: 'a', type: 'text', props: { label: 'L' } };
 * const bad: FieldConfigFor<Cat> = { type: 'ghost' };                  // ✗ unknown type
 * const alsoBad: FieldConfigFor<Cat> = { type: 'text', props: { label: 42 } }; // ✗ wrong prop
 * ```
 *
 * The `validation` / `conditions` / `effects` slots use the core types the form
 * builder's own `FieldConfig<C, T>` uses, so a `FieldConfigFor<C>` is directly
 * assignable to the builder's `.add(...)` — no cast at the builder boundary.
 */
export type FieldConfigFor<C> = {
  [K in keyof C & string]: {
    readonly id?: string;
    readonly type: K;
    readonly props?: Partial<C[K]>;
    readonly validation?: FieldValidationConfig;
    readonly conditions?: ConditionalBehavior;
    readonly effects?: FieldEffects;
    readonly default?: unknown;
  };
}[keyof C & string];

export type PropsValidationResult =
  | { readonly success: true; readonly value: unknown }
  | {
      readonly success: false;
      readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;
      readonly expectedKeys?: string[];
    };
