import type {
  AsyncValidationResult,
  ComponentConfig,
  FormRenderConfig,
  RilayInstance,
  WorkflowRenderConfig,
} from '@rilaykit/core';
import { ril as OriginalRil } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';

/**
 * Enhanced RilayKit interface with convenience .form() and .flow() methods.
 * Available when using the all-in-one `rilaykit` package.
 */
export interface RilayKit<C> {
  addComponent<NewType extends string, TProps = any>(
    type: NewType,
    config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
  ): RilayKit<C & { [K in NewType]: TProps }>;

  configure(config: Partial<FormRenderConfig & WorkflowRenderConfig>): RilayKit<C>;

  getComponent<T extends keyof C & string>(id: T): ComponentConfig<C[T]> | undefined;
  getComponent(id: string): ComponentConfig | undefined;
  getAllComponents(): ComponentConfig[];
  hasComponent(id: string): boolean;

  getFormRenderConfig(): FormRenderConfig;
  getWorkflowRenderConfig(): WorkflowRenderConfig;

  getStats(): ReturnType<RilayInstance<C>['getStats']>;

  validate(): string[];
  validateAsync(): Promise<AsyncValidationResult>;

  clone(): RilayKit<C>;
  removeComponent(id: string): RilayKit<C>;
  clear(): RilayKit<C>;

  form(formId?: string): form<C>;
  flow(workflowId?: string, name?: string, description?: string): flow;
}

function wrapRil<C>(inner: OriginalRil<C>): RilayKit<C> {
  return {
    addComponent<NewType extends string, TProps = any>(
      type: NewType,
      config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
    ): RilayKit<C & { [K in NewType]: TProps }> {
      return wrapRil(inner.addComponent<NewType, TProps>(type, config));
    },

    configure(config: Partial<FormRenderConfig & WorkflowRenderConfig>): RilayKit<C> {
      return wrapRil(inner.configure(config));
    },

    getComponent: inner.getComponent.bind(inner) as RilayKit<C>['getComponent'],
    getAllComponents: inner.getAllComponents.bind(inner),
    hasComponent: inner.hasComponent.bind(inner),
    getFormRenderConfig: inner.getFormRenderConfig.bind(inner),
    getWorkflowRenderConfig: inner.getWorkflowRenderConfig.bind(inner),
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
  create<CT = Record<string, never>>(): RilayKit<CT> {
    return wrapRil(OriginalRil.create<CT>());
  },
} as const;
