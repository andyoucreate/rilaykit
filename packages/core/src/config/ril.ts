import type { ComponentConfig, FormRenderConfig, WorkflowRenderConfig } from '../types';
import { configureObject, ensureUnique } from '../utils/builderHelpers';

/**
 * Main configuration class for Rilay form components and workflows
 * Manages component registration, retrieval, and configuration
 */
export class ril<C> {
  private components = new Map<string, ComponentConfig>();
  private formRenderConfig: FormRenderConfig = {};
  private workflowRenderConfig: WorkflowRenderConfig = {};

  static create<CT>(): ril<CT> {
    return new ril<CT>();
  }

  /**
   * Add a component to the configuration
   * @param type - The component type (e.g., 'text', 'email', 'heading'), used as a unique identifier.
   * @param config - Component configuration without id and type
   * @returns The ril instance for chaining
   *
   * @example
   * ```typescript
   * // Component avec validation par défaut
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

    this.components.set(type, fullConfig as ComponentConfig);
    // Type cast to return new mapped ril with extended component map
    return this as unknown as ril<C & { [K in NewType]: TProps }>;
  }

  /**
   * Universal configuration method for all renderer types
   *
   * This method provides a unified API to configure both form and workflow renderers
   * in a single call, automatically categorizing and applying the appropriate configurations.
   *
   * @param config - Configuration object containing renderer settings
   * @param config.rowRenderer - Custom renderer for form rows (form-specific)
   * @param config.bodyRenderer - Custom renderer for form body container (form-specific)
   * @param config.submitButtonRenderer - Custom renderer for form submit buttons (form-specific)
   * @param config.fieldRenderer - Custom renderer for individual form fields (form-specific)
   * @param config.stepperRenderer - Custom renderer for workflow step navigation (workflow-specific)
   * @param config.nextButtonRenderer - Custom renderer for workflow next buttons (workflow-specific)
   * @param config.previousButtonRenderer - Custom renderer for workflow previous buttons (workflow-specific)
   * @param config.skipButtonRenderer - Custom renderer for workflow skip buttons (workflow-specific)
   *
   * @returns The ril instance for method chaining
   *
   * @example
   * ```typescript
   * // Configure form renderers only
   * const config = ril.create()
   *   .configure({
   *     rowRenderer: CustomRowRenderer,
   *     submitButtonRenderer: CustomSubmitButton
   *   });
   *
   * // Configure workflow renderers only
   * const config = ril.create()
   *   .configure({
   *     stepperRenderer: CustomStepper,
   *     nextButtonRenderer: CustomNextButton
   *   });
   *
   * // Configure both form and workflow renderers
   * const config = ril.create()
   *   .configure({
   *     // Form renderers
   *     rowRenderer: CustomRowRenderer,
   *     fieldRenderer: CustomFieldRenderer,
   *     // Workflow renderers
   *     stepperRenderer: CustomStepper,
   *     nextButtonRenderer: CustomNextButton
   *   });
   * ```
   *
   * @remarks
   * - Renderers are automatically categorized into form or workflow configurations
   * - Existing configurations are merged, not replaced entirely
   * - Invalid renderer keys are silently ignored
   * - This method replaces individual setter methods for better DX
   */
  configure(config: Partial<FormRenderConfig & WorkflowRenderConfig>): this {
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

    // Apply configurations using merge strategy (preserves existing settings)
    this.formRenderConfig = configureObject(this.formRenderConfig, formRenderers);
    this.workflowRenderConfig = configureObject(this.workflowRenderConfig, workflowRenderers);

    return this;
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

  removeComponent(id: string): boolean {
    return this.components.delete(id);
  }

  clear(): void {
    this.components.clear();
  }

  /**
   * Enhanced statistics with more detailed information
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    hasCustomRenderers: {
      // Form renderers
      row: boolean;
      body: boolean;
      submitButton: boolean;
      field: boolean;
      // Workflow renderers
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
        // Form renderers
        row: Boolean(this.formRenderConfig.rowRenderer),
        body: Boolean(this.formRenderConfig.bodyRenderer),
        submitButton: Boolean(this.formRenderConfig.submitButtonRenderer),
        field: Boolean(this.formRenderConfig.fieldRenderer),
        // Workflow renderers
        stepper: Boolean(this.workflowRenderConfig.stepperRenderer),
        workflowNextButton: Boolean(this.workflowRenderConfig.nextButtonRenderer),
        workflowPreviousButton: Boolean(this.workflowRenderConfig.previousButtonRenderer),
        workflowSkipButton: Boolean(this.workflowRenderConfig.skipButtonRenderer),
      },
    };
  }

  /**
   * Enhanced validation using shared utilities
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

    return errors;
  }
}
