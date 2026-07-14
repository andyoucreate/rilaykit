import { type ComponentEntry, ril as OriginalRil, type RilayInstance } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';

/**
 * Enhanced RilayKit interface with convenience .form() and .flow() methods.
 * Available when using the all-in-one `rilaykit` package.
 */
export interface RilayKit<C extends Record<string, any>> {
  component<NewType extends string, TProps = Record<string, unknown>>(
    type: NewType,
    entry: Omit<ComponentEntry<TProps>, 'kind' | 'type'>
  ): RilayKit<C & { [K in NewType]: TProps }>;

  getComponent: RilayInstance<C>['getComponent'];
  getAllComponents(): ComponentEntry[];
  hasComponent(id: string): boolean;

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

    getComponent: inner.getComponent.bind(inner),
    getAllComponents: inner.getAllComponents.bind(inner),
    hasComponent: inner.hasComponent.bind(inner),
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
