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
 * Enhanced RilayKit interface with convenience .form() and .flow() methods.
 * Available when using the all-in-one `rilaykit` package.
 */
export interface RilayKit<C extends Record<string, any>> {
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

  // Component access
  getComponent: RilayInstance<C>['getComponent'];
  getAllComponents(): ComponentEntry[];
  hasComponent(id: string): boolean;

  // Tool and part access
  getTool(name: string): ToolEntry | undefined;
  getPart(type: string): PartEntry | undefined;
  getAllTools(): ToolEntry[];
  getAllParts(): PartEntry[];

  // Props validation
  validateProps: RilayInstance<C>['validateProps'];

  getStats(): ReturnType<RilayInstance<C>['getStats']>;

  validate(): string[];
  validateAsync(): Promise<{ isValid: boolean; errors: string[]; warnings?: string[] }>;

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
