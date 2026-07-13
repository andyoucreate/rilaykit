import type React from 'react';
import { DuplicateError, NotFoundError, ValidationError } from '../errors';
import type { ComponentConfig, FormRenderConfig, WorkflowRenderConfig } from '../types';
import type {
  ComponentEntry,
  ComponentRenderContext,
  PartEntry,
  ToolEntry,
} from '../types/catalog';
import { ensureUnique } from '../utils/builderHelpers';

/**
 * Deep merge utility for nested configuration objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Builds a type guard matching catalog entries of the given kind
 * stored in the namespaced catalog map
 */
function isEntryOfKind<TEntry extends { kind: string }>(kind: TEntry['kind']) {
  return (entry: unknown): entry is TEntry =>
    typeof entry === 'object' && entry !== null && (entry as { kind?: unknown }).kind === kind;
}

/**
 * Validation result for async operations
 */
export interface AsyncValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * A plugin is a function that receives a ril instance and returns an
 * extended one (registering components, tools, parts...)
 */
export type RilayPlugin = (r: ril<Record<string, unknown>>) => ril<Record<string, unknown>>;

/**
 * Renderer bags accepted by `.renderers()` — component keys are constrained
 * to the instance's registered component map `C` with per-component ctx
 * typing; tools/parts stay string-keyed in P1 (runtime NotFoundError covers them)
 */
export interface RendererAttachments<C> {
  readonly components?: {
    readonly [K in keyof C & string]?: (ctx: ComponentRenderContext<C[K]>) => React.ReactElement;
  };
  readonly tools?: Record<string, NonNullable<ToolEntry['renderer']>>;
  readonly parts?: Record<string, PartEntry['renderer']>;
}

/**
 * Public interface for Rilay instances
 * Exposes only the methods necessary for the public API
 */
export interface RilayInstance<C> {
  // Catalog registration methods
  component<NewType extends string, TProps = Record<string, unknown>>(
    type: NewType,
    entry: Omit<ComponentEntry<TProps>, 'kind' | 'type'>
  ): RilayInstance<C & { [K in NewType]: TProps }>;

  /** @deprecated Use .component() — removed in Task 16 */
  addComponent<NewType extends string, TProps = Record<string, unknown>>(
    type: NewType,
    config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
  ): RilayInstance<C & { [K in NewType]: TProps }>;

  tool<TInput = unknown, TOutput = unknown>(
    name: string,
    entry: Omit<ToolEntry<TInput, TOutput>, 'kind' | 'name'>
  ): RilayInstance<C>;

  part<TPart = unknown>(
    type: string,
    entry: Omit<PartEntry<TPart>, 'kind' | 'type'>
  ): RilayInstance<C>;

  use(plugin: RilayPlugin): RilayInstance<C>;

  renderers(attachments: RendererAttachments<C>): RilayInstance<C>;

  configure(config: Partial<FormRenderConfig & WorkflowRenderConfig>): RilayInstance<C>;

  // Component access methods
  getComponent<T extends string>(
    id: T
  ): ComponentEntry<T extends keyof C ? C[T] : Record<string, unknown>> | undefined;
  getAllComponents(): ComponentEntry[];
  hasComponent(id: string): boolean;

  // Tool and part access methods
  getTool(name: string): ToolEntry | undefined;
  getPart(type: string): PartEntry | undefined;
  getAllTools(): ToolEntry[];
  getAllParts(): PartEntry[];

  // Configuration getters
  getFormRenderConfig(): FormRenderConfig;
  getWorkflowRenderConfig(): WorkflowRenderConfig;

  // Utility methods
  getStats(): {
    total: number;
    byType: Record<string, number>;
    hasCustomRenderers: {
      row: boolean;
      body: boolean;
      submitButton: boolean;
      field: boolean;
      repeatable: boolean;
      repeatableItem: boolean;
      stepper: boolean;
      workflowNextButton: boolean;
      workflowPreviousButton: boolean;
      workflowSkipButton: boolean;
    };
  };

  // Validation methods
  validate(): string[];
  validateAsync(): Promise<AsyncValidationResult>;

  // Utility methods for immutability
  clone(): RilayInstance<C>;
  removeComponent(id: string): RilayInstance<C>;
  clear(): RilayInstance<C>;
}

/**
 * Main configuration class for Rilay form components and workflows
 * Manages catalog entry registration, retrieval, and configuration with immutable API
 */
export class ril<C> implements RilayInstance<C> {
  private entries = new Map<string, unknown>();
  private formRenderConfig: FormRenderConfig = {};
  private workflowRenderConfig: WorkflowRenderConfig = {};

  /**
   * Static factory method to create a new ril instance
   */
  static create<CT>(): ril<CT> {
    return new ril<CT>();
  }

  private static entryKey(kind: 'component' | 'tool' | 'part', id: string): string {
    return `${kind}:${id}`;
  }

  private cloneWith(mutate?: (entries: Map<string, unknown>) => void): ril<C> {
    const next = new ril<C>();
    next.entries = new Map(this.entries);
    next.formRenderConfig = { ...this.formRenderConfig };
    next.workflowRenderConfig = { ...this.workflowRenderConfig };
    mutate?.(next.entries);
    return next;
  }

  /**
   * Shared registration path for all catalog facades (immutable)
   * Enforces the DuplicateError/replace semantics in a single place
   *
   * @throws DuplicateError if the key is already registered and `replace` is not true
   */
  private register(
    key: string,
    label: string,
    replace: boolean | undefined,
    value: unknown
  ): ril<C> {
    if (this.entries.has(key) && replace !== true) {
      throw new DuplicateError(`${label} is already registered`, { key });
    }
    return this.cloneWith((entries) => {
      entries.set(key, value);
    });
  }

  /**
   * Register a component in the catalog (immutable)
   * Returns a new instance with the added component entry
   *
   * @param type - The component type (e.g., 'text', 'email', 'heading'), used as a unique identifier.
   * @param entry - Component entry without kind and type
   * @returns A new ril instance with the registered component
   * @throws DuplicateError if the type is already registered and `entry.replace` is not true
   *
   * @example
   * ```typescript
   * const factory = ril.create()
   *   .component('email', {
   *     description: 'Email input',
   *     propsSchema: z.object({ label: z.string() }),
   *     renderer: (ctx) => <input aria-label={ctx.props.label} />,
   *   });
   * ```
   */
  component<NewType extends string, TProps = Record<string, unknown>>(
    type: NewType,
    entry: Omit<ComponentEntry<TProps>, 'kind' | 'type'>
  ): ril<C & { [K in NewType]: TProps }> {
    return this.register(ril.entryKey('component', type), `Component "${type}"`, entry.replace, {
      ...entry,
      kind: 'component',
      type,
    } satisfies ComponentEntry<TProps>) as ril<C & { [K in NewType]: TProps }>;
  }

  /**
   * Register a tool in the catalog (immutable)
   * Returns a new instance with the added tool entry
   *
   * @param name - The tool name (e.g., 'search_flights'), used as a unique identifier.
   * @param entry - Tool entry without kind and name
   * @returns A new ril instance with the registered tool
   * @throws DuplicateError if the name is already registered and `entry.replace` is not true
   */
  tool<TInput = unknown, TOutput = unknown>(
    name: string,
    entry: Omit<ToolEntry<TInput, TOutput>, 'kind' | 'name'>
  ): ril<C> {
    return this.register(ril.entryKey('tool', name), `Tool "${name}"`, entry.replace, {
      ...entry,
      kind: 'tool',
      name,
    } satisfies ToolEntry<TInput, TOutput>);
  }

  /**
   * Register a message part renderer in the catalog (immutable)
   * Returns a new instance with the added part entry
   *
   * @param type - The part type (e.g., 'text', 'reasoning'), used as a unique identifier.
   * @param entry - Part entry without kind and type
   * @returns A new ril instance with the registered part
   * @throws DuplicateError if the type is already registered and `entry.replace` is not true
   */
  part<TPart = unknown>(type: string, entry: Omit<PartEntry<TPart>, 'kind' | 'type'>): ril<C> {
    return this.register(ril.entryKey('part', type), `Part "${type}"`, entry.replace, {
      ...entry,
      kind: 'part',
      type,
    } satisfies PartEntry<TPart>);
  }

  /**
   * Apply a plugin to this instance (immutable)
   * The plugin receives the instance and returns an extended one
   *
   * @param plugin - Function that registers entries and returns the extended instance
   * @returns The instance returned by the plugin
   *
   * @example
   * ```typescript
   * const withSearch: RilayPlugin = (r) => r.tool('search', { description: 'Search' });
   * const config = ril.create().use(withSearch);
   * ```
   */
  use(plugin: RilayPlugin): ril<C> {
    return plugin(this as ril<Record<string, unknown>>) as ril<C>;
  }

  /**
   * Attach or override renderers on already-registered entries (immutable)
   * Only the renderer is touched — schemas, descriptions and meta are preserved
   *
   * @param attachments - Renderer bags keyed by entry name per namespace
   * @returns A new ril instance with the renderers attached
   * @throws NotFoundError if a key does not match a registered entry
   */
  renderers(attachments: RendererAttachments<C>): ril<C> {
    return this.cloneWith((entries) => {
      const attach = (
        bag: Record<string, unknown> | undefined,
        prefix: 'component' | 'tool' | 'part'
      ) => {
        for (const [name, renderer] of Object.entries(bag ?? {})) {
          const key = ril.entryKey(prefix, name);
          const existing = entries.get(key);
          if (!existing) {
            throw new NotFoundError(`Cannot attach renderer: no ${prefix} "${name}" registered`, {
              key,
            });
          }
          entries.set(key, { ...(existing as object), renderer });
        }
      };
      attach(attachments.components as Record<string, unknown> | undefined, 'component');
      attach(attachments.tools, 'tool');
      attach(attachments.parts, 'part');
    });
  }

  /** @deprecated Use .component() — removed in Task 16 */
  addComponent<NewType extends string, TProps = Record<string, unknown>>(
    type: NewType,
    config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
  ): ril<C & { [K in NewType]: TProps }> {
    const { renderer, ...rest } = config;
    // Legacy shim: keeps `id`, the flat renderer shape and overwrite semantics
    // of addComponent alive at runtime until Task 16 deletes it.
    const legacyEntry = {
      ...rest,
      id: type,
      replace: true,
      renderer: renderer as unknown as ComponentEntry<TProps>['renderer'],
    };
    return this.component<NewType, TProps>(
      type,
      legacyEntry as Omit<ComponentEntry<TProps>, 'kind' | 'type'>
    );
  }

  /**
   * Universal configuration method with deep merge support (immutable)
   *
   * This method provides a unified API to configure both form and workflow renderers
   * in a single call, automatically categorizing and applying the appropriate configurations
   * using recursive deep merge.
   *
   * @param config - Configuration object containing renderer settings
   * @returns A new ril instance with the updated configuration
   *
   * @example
   * ```typescript
   * // Configure with nested settings
   * const config = ril.create()
   *   .configure({
   *     rowRenderer: CustomRowRenderer,
   *     submitButtonRenderer: CustomSubmitButton,
   *   });
   * ```
   */
  configure(config: Partial<FormRenderConfig & WorkflowRenderConfig>): ril<C> {
    // Define renderer categories for automatic classification
    const formKeys: (keyof FormRenderConfig)[] = [
      'rowRenderer',
      'bodyRenderer',
      'submitButtonRenderer',
      'fieldRenderer',
      'repeatableRenderer',
      'repeatableItemRenderer',
    ];
    const workflowKeys: (keyof WorkflowRenderConfig)[] = [
      'stepperRenderer',
      'nextButtonRenderer',
      'previousButtonRenderer',
      'skipButtonRenderer',
    ];

    // Initialize configuration containers
    const formRenderers: Partial<FormRenderConfig> = {};
    const workflowRenderers: Partial<WorkflowRenderConfig> = {};

    // Categorize and extract renderers by type
    for (const [key, value] of Object.entries(config)) {
      if (formKeys.includes(key as keyof FormRenderConfig)) {
        (formRenderers as any)[key] = value;
      } else if (workflowKeys.includes(key as keyof WorkflowRenderConfig)) {
        (workflowRenderers as any)[key] = value;
      }
    }

    // Create new instance (immutable) and apply configurations using deep merge strategy
    const next = this.cloneWith();
    next.formRenderConfig = deepMerge(this.formRenderConfig, formRenderers);
    next.workflowRenderConfig = deepMerge(this.workflowRenderConfig, workflowRenderers);

    return next;
  }

  /**
   * Configuration getters
   */
  getFormRenderConfig(): FormRenderConfig {
    return { ...this.formRenderConfig };
  }

  getWorkflowRenderConfig(): WorkflowRenderConfig {
    return { ...this.workflowRenderConfig };
  }

  /**
   * Component management methods
   */
  getComponent<T extends string>(
    id: T
  ): ComponentEntry<T extends keyof C ? C[T] : Record<string, unknown>> | undefined {
    return this.entries.get(ril.entryKey('component', id)) as
      | ComponentEntry<T extends keyof C ? C[T] : Record<string, unknown>>
      | undefined;
  }

  getAllComponents(): ComponentEntry[] {
    return Array.from(this.entries.values()).filter(isEntryOfKind<ComponentEntry>('component'));
  }

  hasComponent(id: string): boolean {
    return this.entries.has(ril.entryKey('component', id));
  }

  /**
   * Tool and part access methods
   */
  getTool(name: string): ToolEntry | undefined {
    return this.entries.get(ril.entryKey('tool', name)) as ToolEntry | undefined;
  }

  getPart(type: string): PartEntry | undefined {
    return this.entries.get(ril.entryKey('part', type)) as PartEntry | undefined;
  }

  getAllTools(): ToolEntry[] {
    return Array.from(this.entries.values()).filter(isEntryOfKind<ToolEntry>('tool'));
  }

  getAllParts(): PartEntry[] {
    return Array.from(this.entries.values()).filter(isEntryOfKind<PartEntry>('part'));
  }

  /**
   * Remove a component from the configuration (immutable)
   * Returns a new instance without the specified component
   *
   * @param id - The component ID to remove
   * @returns A new ril instance without the component
   */
  removeComponent(id: string): ril<C> {
    return this.cloneWith((entries) => {
      entries.delete(ril.entryKey('component', id));
    });
  }

  /**
   * Clear all catalog entries from the configuration (immutable)
   * Returns a new instance with no entries
   *
   * @returns A new empty ril instance
   */
  clear(): ril<C> {
    return this.cloneWith((entries) => {
      entries.clear();
    });
  }

  /**
   * Create a deep copy of the current ril instance
   */
  clone(): ril<C> {
    const next = this.cloneWith();
    next.formRenderConfig = deepMerge({}, this.formRenderConfig);
    next.workflowRenderConfig = deepMerge({}, this.workflowRenderConfig);
    return next;
  }

  /**
   * Enhanced statistics with more detailed information
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    hasCustomRenderers: {
      row: boolean;
      body: boolean;
      submitButton: boolean;
      field: boolean;
      repeatable: boolean;
      repeatableItem: boolean;
      stepper: boolean;
      workflowNextButton: boolean;
      workflowPreviousButton: boolean;
      workflowSkipButton: boolean;
    };
  } {
    const components = this.getAllComponents();

    return {
      total: components.length,
      byType: components.reduce(
        (acc, comp) => {
          acc[comp.type] = (acc[comp.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      hasCustomRenderers: {
        row: Boolean(this.formRenderConfig.rowRenderer),
        body: Boolean(this.formRenderConfig.bodyRenderer),
        submitButton: Boolean(this.formRenderConfig.submitButtonRenderer),
        field: Boolean(this.formRenderConfig.fieldRenderer),
        repeatable: Boolean(this.formRenderConfig.repeatableRenderer),
        repeatableItem: Boolean(this.formRenderConfig.repeatableItemRenderer),
        stepper: Boolean(this.workflowRenderConfig.stepperRenderer),
        workflowNextButton: Boolean(this.workflowRenderConfig.nextButtonRenderer),
        workflowPreviousButton: Boolean(this.workflowRenderConfig.previousButtonRenderer),
        workflowSkipButton: Boolean(this.workflowRenderConfig.skipButtonRenderer),
      },
    };
  }

  /**
   * Synchronous validation using shared utilities
   */
  validate(): string[] {
    const errors: string[] = [];
    const components = this.getAllComponents();

    // Check for duplicate types using shared utility
    const types = components.map((comp) => comp.type);
    try {
      ensureUnique(types, 'component');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    // Check for components without renderers
    const componentsWithoutRenderer = components.filter((comp) => !comp.renderer);
    if (componentsWithoutRenderer.length > 0) {
      errors.push(
        `Components without renderer: ${componentsWithoutRenderer
          .map((comp) => comp.type)
          .join(', ')}`
      );
    }

    // Check for invalid renderer configurations
    const formRendererKeys = Object.keys(this.formRenderConfig);
    const workflowRendererKeys = Object.keys(this.workflowRenderConfig);

    const validFormKeys = [
      'rowRenderer',
      'bodyRenderer',
      'submitButtonRenderer',
      'fieldRenderer',
      'repeatableRenderer',
      'repeatableItemRenderer',
    ];
    const validWorkflowKeys = [
      'stepperRenderer',
      'nextButtonRenderer',
      'previousButtonRenderer',
      'skipButtonRenderer',
    ];

    const invalidFormKeys = formRendererKeys.filter((key) => !validFormKeys.includes(key));
    const invalidWorkflowKeys = workflowRendererKeys.filter(
      (key) => !validWorkflowKeys.includes(key)
    );

    if (invalidFormKeys.length > 0) {
      errors.push(`Invalid form renderer keys: ${invalidFormKeys.join(', ')}`);
    }

    if (invalidWorkflowKeys.length > 0) {
      errors.push(`Invalid workflow renderer keys: ${invalidWorkflowKeys.join(', ')}`);
    }

    return errors;
  }

  /**
   * Asynchronous validation with structured error handling
   * Ideal for CI/CD pipelines and advanced validation scenarios
   */
  async validateAsync(): Promise<AsyncValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const components = this.getAllComponents();

    try {
      // Basic synchronous validations
      const syncErrors = this.validate();
      errors.push(...syncErrors);

      // Advanced asynchronous validations
      const componentValidationPromises = components.map(async (comp) => {
        // Check if component renderer is actually callable/renderable
        if (
          comp.renderer &&
          typeof comp.renderer !== 'function' &&
          typeof comp.renderer !== 'object'
        ) {
          return `Component "${comp.type}" has invalid renderer type: ${typeof comp.renderer}`;
        }

        // Check for potential naming conflicts
        if (comp.type.includes(' ') || comp.type.includes('-')) {
          warnings.push(
            `Component "${comp.type}" uses non-standard naming (contains spaces or dashes)`
          );
        }

        return null;
      });

      const validationResults = await Promise.all(componentValidationPromises);
      const asyncErrors = validationResults.filter((result): result is string => result !== null);
      errors.push(...asyncErrors);

      // Check for circular dependencies or configuration conflicts
      if (components.length > 50) {
        warnings.push('Large number of components detected. Consider splitting configuration.');
      }

      const result: AsyncValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      if (!result.isValid) {
        throw new ValidationError('Ril configuration validation failed', {
          errors,
          warnings,
          componentCount: components.length,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new ValidationError('Unexpected error during async validation', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Type alias for public API
export type RilayConfig<C> = RilayInstance<C>;
