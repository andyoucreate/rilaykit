import type { StandardSchemaV1 } from '@standard-schema/spec';
import type React from 'react';
import type { FieldConditions, FieldError, FieldValidationConfig } from './index';

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
