import {
  type ComponentEntry,
  ril as OriginalRil,
  type PartEntry,
  type RendererAttachments,
  type RilayInstance,
  type RilayPlugin,
  type ToolEntry,
} from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';

/**
 * Methods whose return type must be narrowed from RilayInstance to RilayKit
 * so chaining keeps the enhanced .form()/.flow() surface.
 */
type ChainingKeys =
  | 'component'
  | 'tool'
  | 'part'
  | 'use'
  | 'renderers'
  | 'clone'
  | 'removeComponent'
  | 'clear';

/**
 * Enhanced RilayKit interface with convenience .form() and .flow() methods.
 * Available when using the all-in-one `rilaykit` package.
 *
 * All accessors (getComponent, getTool, validateProps, getStats, validate...)
 * are inherited from core's RilayInstance so the facade never drifts out of
 * sync; only the chaining methods are re-declared to return RilayKit.
 */
export interface RilayKit<C extends Record<string, any>>
  extends Omit<RilayInstance<C>, ChainingKeys> {
  // Catalog registration facades (each preserves the enhanced instance)
  component<NewType extends string, TProps = Record<string, unknown>>(
    type: NewType,
    entry: Omit<ComponentEntry<TProps>, 'kind' | 'type'>
  ): RilayKit<C & { [K in NewType]: TProps }>;

  tool<TInput = unknown, TOutput = unknown>(
    name: string,
    entry: Omit<ToolEntry<TInput, TOutput>, 'kind' | 'name'>
  ): RilayKit<C>;

  part<TPart = unknown>(type: string, entry: Omit<PartEntry<TPart>, 'kind' | 'type'>): RilayKit<C>;

  use(plugin: RilayPlugin): RilayKit<C>;

  renderers(attachments: RendererAttachments<C>): RilayKit<C>;

  clone(): RilayKit<C>;
  removeComponent(id: string): RilayKit<C>;
  clear(): RilayKit<C>;

  form(formId?: string): form<C>;
  flow(workflowId?: string, name?: string, description?: string): flow;
}

function wrapRil<C extends Record<string, any>>(inner: OriginalRil<C>): RilayKit<C> {
  return {
    component<NewType extends string, TProps = Record<string, unknown>>(
      type: NewType,
      entry: Omit<ComponentEntry<TProps>, 'kind' | 'type'>
    ): RilayKit<C & { [K in NewType]: TProps }> {
      return wrapRil(inner.component<NewType, TProps>(type, entry));
    },

    tool<TInput = unknown, TOutput = unknown>(
      name: string,
      entry: Omit<ToolEntry<TInput, TOutput>, 'kind' | 'name'>
    ): RilayKit<C> {
      return wrapRil(inner.tool<TInput, TOutput>(name, entry));
    },

    part<TPart = unknown>(
      type: string,
      entry: Omit<PartEntry<TPart>, 'kind' | 'type'>
    ): RilayKit<C> {
      return wrapRil(inner.part<TPart>(type, entry));
    },

    use(plugin: RilayPlugin): RilayKit<C> {
      return wrapRil(inner.use(plugin));
    },

    renderers(attachments: RendererAttachments<C>): RilayKit<C> {
      return wrapRil(inner.renderers(attachments));
    },

    getComponent: inner.getComponent.bind(inner),
    getAllComponents: inner.getAllComponents.bind(inner),
    hasComponent: inner.hasComponent.bind(inner),
    getTool: inner.getTool.bind(inner),
    getPart: inner.getPart.bind(inner),
    getAllTools: inner.getAllTools.bind(inner),
    getAllParts: inner.getAllParts.bind(inner),
    validateProps: inner.validateProps.bind(inner),
    getStats: inner.getStats.bind(inner),
    validate: inner.validate.bind(inner),
    validateAsync: inner.validateAsync.bind(inner),

    clone(): RilayKit<C> {
      return wrapRil(inner.clone());
    },

    removeComponent(id: string): RilayKit<C> {
      return wrapRil(inner.removeComponent(id));
    },

    clear(): RilayKit<C> {
      return wrapRil(inner.clear());
    },

    form(formId?: string): form<C> {
      return form.create<C>(inner, formId);
    },

    flow(workflowId?: string, name?: string, description?: string): flow {
      return flow.create(inner, workflowId, name, description);
    },
  };
}

/**
 * Enhanced ril with .form() and .flow() convenience methods.
 *
 * Drop-in replacement for `ril` from `@rilaykit/core`.
 * Usage is identical: `ril.create()` — but returned instances
 * also have `.form()` and `.flow()` methods.
 */
export const ril = {
  create<CT extends Record<string, any> = Record<string, never>>(): RilayKit<CT> {
    return wrapRil(OriginalRil.create<CT>());
  },
} as const;
