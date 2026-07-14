import type React from 'react';
import { ConfigurationError, DuplicateError, NotFoundError, ValidationError } from '../errors';
import type {
  ComponentEntry,
  ComponentRenderContext,
  PartEntry,
  PropsValidationResult,
  ToolEntry,
} from '../types/catalog';
import { ensureUnique } from '../utils/builderHelpers';

/**
 * Canonical key of a catalog entry in the namespaced catalog map.
 * Shared with packages that reference entries in error payloads (e.g. forms'
 * FormField) so the key scheme never diverges from core lookups.
 */
export function catalogEntryKey(kind: 'component' | 'tool' | 'part', id: string): string {
  return `${kind}:${id}`;
}

/**
 * Determines whether a value is a plain data object (literal `{}` or
 * null-prototype). Class instances, RegExp, Date, functions, etc. are not.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-clones the plain-data payload of a catalog entry while PRESERVING
 * reference identity for functions and Standard Schema objects.
 *
 * Nested `meta`/`defaultProps` (and any plain object/array) are cloned so a
 * caller mutating the object it passed in cannot leak into the stored entry.
 * Functions (`renderer`), Standard Schema objects (`propsSchema`,
 * `inputSchema`, `validate`) and any non-plain object are passed through by
 * reference so their identity — and behaviour — is never disturbed.
 *
 * A `seen` map guards against cyclic plain input (e.g. `meta.self = meta`):
 * each source object/array maps to its clone, so a cycle is reproduced in the
 * output instead of recursing until the stack overflows.
 */
function clonePlainData<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing !== undefined) return existing as T;
    const clonedArray: unknown[] = [];
    seen.set(value, clonedArray);
    for (const item of value) {
      clonedArray.push(clonePlainData(item, seen));
    }
    return clonedArray as T;
  }
  if (isPlainObject(value)) {
    // Standard Schema objects carry a `~standard` marker — never clone them.
    if ('~standard' in value) {
      return value;
    }
    const existing = seen.get(value);
    if (existing !== undefined) return existing as T;
    const cloned: Record<string, unknown> = {};
    seen.set(value, cloned);
    for (const [key, item] of Object.entries(value)) {
      cloned[key] = clonePlainData(item, seen);
    }
    return cloned as T;
  }
  // Functions, non-plain objects and primitives keep their identity.
  return value;
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

  // Props validation
  validateProps(type: string, props: unknown): PropsValidationResult;

  // Utility methods
  getStats(): { total: number; components: number; tools: number; parts: number };

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

  /**
   * Static factory method to create a new ril instance
   */
  static create<CT>(): ril<CT> {
    return new ril<CT>();
  }

  private cloneWith(mutate?: (entries: Map<string, unknown>) => void): ril<C> {
    const next = new ril<C>();
    next.entries = new Map(this.entries);
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
      // Deep-clone plain data so external mutation of the caller's object
      // cannot leak into the stored (immutable) entry; functions and schemas
      // keep their reference identity.
      entries.set(key, clonePlainData(value));
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
    return this.register(catalogEntryKey('component', type), `Component "${type}"`, entry.replace, {
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
    return this.register(catalogEntryKey('tool', name), `Tool "${name}"`, entry.replace, {
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
    return this.register(catalogEntryKey('part', type), `Part "${type}"`, entry.replace, {
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
          const key = catalogEntryKey(prefix, name);
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

  /**
   * Component management methods
   */
  getComponent<T extends string>(
    id: T
  ): ComponentEntry<T extends keyof C ? C[T] : Record<string, unknown>> | undefined {
    return this.entries.get(catalogEntryKey('component', id)) as
      | ComponentEntry<T extends keyof C ? C[T] : Record<string, unknown>>
      | undefined;
  }

  getAllComponents(): ComponentEntry[] {
    return Array.from(this.entries.values()).filter(isEntryOfKind<ComponentEntry>('component'));
  }

  hasComponent(id: string): boolean {
    return this.entries.has(catalogEntryKey('component', id));
  }

  /**
   * Tool and part access methods
   */
  getTool(name: string): ToolEntry | undefined {
    return this.entries.get(catalogEntryKey('tool', name)) as ToolEntry | undefined;
  }

  getPart(type: string): PartEntry | undefined {
    return this.entries.get(catalogEntryKey('part', type)) as PartEntry | undefined;
  }

  getAllTools(): ToolEntry[] {
    return Array.from(this.entries.values()).filter(isEntryOfKind<ToolEntry>('tool'));
  }

  getAllParts(): PartEntry[] {
    return Array.from(this.entries.values()).filter(isEntryOfKind<PartEntry>('part'));
  }

  /**
   * Validate props against a registered component's propsSchema (synchronous)
   *
   * Components without a propsSchema pass through unchanged. On failure the
   * result carries the schema issues plus a best-effort `expectedKeys` list
   * (zod object schemas expose `.shape`; other vendors simply omit it).
   *
   * @param type - The registered component type
   * @param props - The props to validate
   * @returns A structured success/failure result
   * @throws NotFoundError if the component is not registered
   * @throws ConfigurationError if the propsSchema validates asynchronously
   */
  validateProps(type: string, props: unknown): PropsValidationResult {
    const entry = this.getComponent(type);
    if (!entry) {
      throw new NotFoundError(`Component "${type}" not found in catalog`, {
        key: catalogEntryKey('component', type),
      });
    }
    if (!entry.propsSchema) {
      return { success: true, value: props };
    }
    const outcome = entry.propsSchema['~standard'].validate(props);
    if (outcome instanceof Promise) {
      throw new ConfigurationError(
        `propsSchema of "${type}" is async — props schemas must validate synchronously`,
        { key: catalogEntryKey('component', type) }
      );
    }
    if (outcome.issues) {
      const shape = (entry.propsSchema as { shape?: Record<string, unknown> }).shape;
      return {
        success: false,
        issues: outcome.issues,
        expectedKeys: shape ? Object.keys(shape) : undefined,
      };
    }
    return { success: true, value: outcome.value };
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
      entries.delete(catalogEntryKey('component', id));
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
    return this.cloneWith();
  }

  /**
   * Flat catalog statistics: entry counts by kind
   */
  getStats(): { total: number; components: number; tools: number; parts: number } {
    const counts = { component: 0, tool: 0, part: 0 };
    for (const entry of this.entries.values()) {
      counts[(entry as { kind: 'component' | 'tool' | 'part' }).kind] += 1;
    }
    return {
      total: this.entries.size,
      components: counts.component,
      tools: counts.tool,
      parts: counts.part,
    };
  }

  /**
   * Synchronous validation using shared utilities
   *
   * Renderer-less components are legit blueprints and never error here;
   * validateAsync surfaces them as warnings instead.
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

      // Renderer-less entries are legit blueprints — surface them as warnings only
      const componentsWithoutRenderer = components.filter((comp) => !comp.renderer);
      if (componentsWithoutRenderer.length > 0) {
        warnings.push(
          `Components without renderer: ${componentsWithoutRenderer
            .map((comp) => comp.type)
            .join(', ')}`
        );
      }

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
