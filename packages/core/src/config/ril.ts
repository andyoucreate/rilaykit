import type { ComponentConfig, FormRenderConfig, WorkflowRenderConfig } from '../types';
import { ensureUnique } from '../utils/builderHelpers';

/**
 * Structured error hierarchy for Rilay
 */
export class RilayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly meta?: Record<string, any>
  ) {
    super(message);
    this.name = 'RilayError';
  }
}

export class ValidationError extends RilayError {
  constructor(message: string, meta?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', meta);
    this.name = 'ValidationError';
  }
}

export class DuplicateIdError extends RilayError {
  constructor(message: string, meta?: Record<string, any>) {
    super(message, 'DUPLICATE_ID_ERROR', meta);
    this.name = 'DuplicateIdError';
  }
}

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
 * Validation result for async operations
 */
export interface AsyncValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Public interface for Rilay instances
 * Exposes only the methods necessary for the public API
 */
export interface RilayInstance<C> {
  // Configuration methods
  addComponent<NewType extends string, TProps = any>(
    type: NewType,
    config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
  ): RilayInstance<C & { [K in NewType]: TProps }>;

  configure(config: Partial<FormRenderConfig & WorkflowRenderConfig>): RilayInstance<C>;

  // Component access methods
  getComponent<T extends keyof C & string>(id: T): ComponentConfig<C[T]> | undefined;
  getComponent(id: string): ComponentConfig | undefined;
  getAllComponents(): ComponentConfig[];
  hasComponent(id: string): boolean;

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
 * Manages component registration, retrieval, and configuration with immutable API
 */
export class ril<C> implements RilayInstance<C> {
  private components = new Map<string, ComponentConfig>();
  private formRenderConfig: FormRenderConfig = {};
  private workflowRenderConfig: WorkflowRenderConfig = {};

  /**
   * Static factory method to create a new ril instance
   */
  static create<CT>(): ril<CT> {
    return new ril<CT>();
  }

  /**
   * Add a component to the configuration (immutable)
   * Returns a new instance with the added component
   *
   * @param type - The component type (e.g., 'text', 'email', 'heading'), used as a unique identifier.
   * @param config - Component configuration without id and type
   * @returns A new ril instance with the added component
   *
   * @example
   * ```typescript
   * // Component with default validation
   * const factory = ril.create()
   *   .addComponent('email', {
   *     name: 'Email Input',
   *     renderer: EmailInput,
   *     validation: {
   *       validators: [email('Format email invalide')],
   *       validateOnBlur: true,
   *     }
   *   });
   * ```
   */
  addComponent<NewType extends string, TProps = any>(
    type: NewType,
    config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
  ): ril<C & { [K in NewType]: TProps }> {
    const fullConfig: ComponentConfig<TProps> = {
      id: type,
      type,
      ...config,
    };

    // Create new instance (immutable)
    const newInstance = new ril<C & { [K in NewType]: TProps }>();

    // Copy existing components
    newInstance.components = new Map(this.components);
    newInstance.formRenderConfig = { ...this.formRenderConfig };
    newInstance.workflowRenderConfig = { ...this.workflowRenderConfig };

    // Add new component
    newInstance.components.set(type, fullConfig as ComponentConfig);

    return newInstance;
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
   *     // Deep nested configuration example
   *     formStyles: {
   *       layout: {
   *         spacing: 'large',
   *         alignment: 'center'
   *       }
   *     }
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

    // Create new instance (immutable)
    const newInstance = new ril<C>();

    // Copy existing state
    newInstance.components = new Map(this.components);

    // Apply configurations using deep merge strategy
    newInstance.formRenderConfig = deepMerge(this.formRenderConfig, formRenderers);
    newInstance.workflowRenderConfig = deepMerge(this.workflowRenderConfig, workflowRenderers);

    return newInstance;
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
  getComponent<T extends keyof C & string>(id: T): ComponentConfig<C[T]> | undefined;
  getComponent(id: string): ComponentConfig | undefined {
    return this.components.get(id);
  }

  getAllComponents(): ComponentConfig[] {
    return Array.from(this.components.values());
  }

  hasComponent(id: string): boolean {
    return this.components.has(id);
  }

  /**
   * Remove a component from the configuration (immutable)
   * Returns a new instance without the specified component
   *
   * @param id - The component ID to remove
   * @returns A new ril instance without the component
   */
  removeComponent(id: string): ril<C> {
    const newInstance = new ril<C>();

    // Copy existing state
    newInstance.components = new Map(this.components);
    newInstance.formRenderConfig = { ...this.formRenderConfig };
    newInstance.workflowRenderConfig = { ...this.workflowRenderConfig };

    // Remove component
    newInstance.components.delete(id);

    return newInstance;
  }

  /**
   * Clear all components from the configuration (immutable)
   * Returns a new instance with no components
   *
   * @returns A new empty ril instance
   */
  clear(): ril<C> {
    const newInstance = new ril<C>();
    // Keep render configurations but clear components
    newInstance.formRenderConfig = { ...this.formRenderConfig };
    newInstance.workflowRenderConfig = { ...this.workflowRenderConfig };
    // components map is already empty in new instance
    return newInstance;
  }

  /**
   * Create a deep copy of the current ril instance
   */
  clone(): ril<C> {
    const newInstance = new ril<C>();
    newInstance.components = new Map(this.components);
    newInstance.formRenderConfig = deepMerge({}, this.formRenderConfig);
    newInstance.workflowRenderConfig = deepMerge({}, this.workflowRenderConfig);
    return newInstance;
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
      stepper: boolean;
      workflowNextButton: boolean;
      workflowPreviousButton: boolean;
      workflowSkipButton: boolean;
    };
  } {
    const components = Array.from(this.components.values());

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
    const components = Array.from(this.components.values());

    // Check for duplicate IDs using shared utility
    const ids = components.map((comp) => comp.id);
    try {
      ensureUnique(ids, 'component');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    // Check for components without renderers
    const componentsWithoutRenderer = components.filter((comp) => !comp.renderer);
    if (componentsWithoutRenderer.length > 0) {
      errors.push(
        `Components without renderer: ${componentsWithoutRenderer
          .map((comp) => comp.id)
          .join(', ')}`
      );
    }

    // Check for invalid renderer configurations
    const formRendererKeys = Object.keys(this.formRenderConfig);
    const workflowRendererKeys = Object.keys(this.workflowRenderConfig);

    const validFormKeys = ['rowRenderer', 'bodyRenderer', 'submitButtonRenderer', 'fieldRenderer'];
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
    const components = Array.from(this.components.values());

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
          return `Component "${comp.id}" has invalid renderer type: ${typeof comp.renderer}`;
        }

        // Check for potential naming conflicts
        if (comp.id.includes(' ') || comp.id.includes('-')) {
          warnings.push(
            `Component "${comp.id}" uses non-standard naming (contains spaces or dashes)`
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
