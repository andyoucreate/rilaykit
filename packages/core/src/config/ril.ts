import type {
  ComponentConfig,
  FieldRenderer,
  FormBodyRenderer,
  FormRenderConfig,
  FormRowRenderer,
  FormSubmitButtonRenderer,
  WorkflowNextButtonRenderer,
  WorkflowPreviousButtonRenderer,
  WorkflowRenderConfig,
  WorkflowSkipButtonRenderer,
  WorkflowStepperRenderer,
} from '../types';

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
   * Generic method to set any renderer type easily
   * @param rendererType - The type of renderer to set
   * @param renderer - The renderer function
   * @returns The ril instance for chaining
   */
  setRenderer<T extends keyof (FormRenderConfig & WorkflowRenderConfig)>(
    rendererType: T,
    renderer: (FormRenderConfig & WorkflowRenderConfig)[T]
  ): this {
    if (rendererType in this.formRenderConfig) {
      this.formRenderConfig = {
        ...this.formRenderConfig,
        [rendererType]: renderer,
      };
    } else if (rendererType in this.workflowRenderConfig) {
      this.workflowRenderConfig = {
        ...this.workflowRenderConfig,
        [rendererType]: renderer,
      };
    }
    return this;
  }

  /**
   * Set multiple renderers at once
   * @param renderers - Object with renderer configurations
   * @returns The ril instance for chaining
   */
  setRenderers(renderers: Partial<FormRenderConfig & WorkflowRenderConfig>): this {
    // Separate form and workflow renderers
    const formRenderers: Partial<FormRenderConfig> = {};
    const workflowRenderers: Partial<WorkflowRenderConfig> = {};

    for (const [key, value] of Object.entries(renderers)) {
      if (['rowRenderer', 'bodyRenderer', 'submitButtonRenderer', 'fieldRenderer'].includes(key)) {
        (formRenderers as any)[key] = value;
      } else {
        (workflowRenderers as any)[key] = value;
      }
    }

    this.formRenderConfig = { ...this.formRenderConfig, ...formRenderers };
    this.workflowRenderConfig = { ...this.workflowRenderConfig, ...workflowRenderers };

    return this;
  }

  /**
   * Set custom row renderer
   * @param renderer - Custom row renderer function
   * @returns The ril instance for chaining
   */
  setRowRenderer(renderer: FormRowRenderer): this {
    this.formRenderConfig = {
      ...this.formRenderConfig,
      rowRenderer: renderer,
    };
    return this;
  }

  /**
   * Set custom body renderer
   * @param renderer - Custom body renderer function
   * @returns The ril instance for chaining
   */
  setBodyRenderer(renderer: FormBodyRenderer): this {
    this.formRenderConfig = {
      ...this.formRenderConfig,
      bodyRenderer: renderer,
    };
    return this;
  }

  /**
   * Set custom submit button renderer
   * @param renderer - Custom submit button renderer function
   * @returns The ril instance for chaining
   */
  setSubmitButtonRenderer(renderer: FormSubmitButtonRenderer): this {
    this.formRenderConfig = {
      ...this.formRenderConfig,
      submitButtonRenderer: renderer,
    };
    return this;
  }

  /**
   * Set custom field renderer
   * @param renderer - Custom field renderer function
   * @returns The ril instance for chaining
   */
  setFieldRenderer(renderer: FieldRenderer): this {
    this.formRenderConfig = {
      ...this.formRenderConfig,
      fieldRenderer: renderer,
    };
    return this;
  }

  /**
   * Set complete form render configuration
   * @param config - Form render configuration
   * @returns The ril instance for chaining
   */
  setFormRenderConfig(config: FormRenderConfig): this {
    this.formRenderConfig = config;
    return this;
  }

  /**
   * Get current form render configuration
   * @returns Current form render configuration
   */
  getFormRenderConfig(): FormRenderConfig {
    return { ...this.formRenderConfig };
  }

  /**
   * Set custom stepper renderer for workflows
   * @param renderer - Custom stepper renderer function
   * @returns The ril instance for chaining
   */
  setStepperRenderer(renderer: WorkflowStepperRenderer): this {
    this.workflowRenderConfig = {
      ...this.workflowRenderConfig,
      stepperRenderer: renderer,
    };
    return this;
  }

  /**
   * Set custom workflow next button renderer
   * @param renderer - Custom workflow next button renderer function
   * @returns The ril instance for chaining
   */
  setWorkflowNextButtonRenderer(renderer: WorkflowNextButtonRenderer): this {
    this.workflowRenderConfig = {
      ...this.workflowRenderConfig,
      nextButtonRenderer: renderer,
    };
    return this;
  }

  /**
   * Set custom workflow previous button renderer
   * @param renderer - Custom workflow previous button renderer function
   * @returns The ril instance for chaining
   */
  setWorkflowPreviousButtonRenderer(renderer: WorkflowPreviousButtonRenderer): this {
    this.workflowRenderConfig = {
      ...this.workflowRenderConfig,
      previousButtonRenderer: renderer,
    };
    return this;
  }

  /**
   * Set custom workflow skip button renderer
   * @param renderer - Custom workflow skip button renderer function
   * @returns The ril instance for chaining
   */
  setWorkflowSkipButtonRenderer(renderer: WorkflowSkipButtonRenderer): this {
    this.workflowRenderConfig = {
      ...this.workflowRenderConfig,
      skipButtonRenderer: renderer,
    };
    return this;
  }

  /**
   * Set complete workflow render configuration
   * @param config - Workflow render configuration
   * @returns The ril instance for chaining
   */
  setWorkflowRenderConfig(config: WorkflowRenderConfig): this {
    this.workflowRenderConfig = config;
    return this;
  }

  /**
   * Get current workflow render configuration
   * @returns Current workflow render configuration
   */
  getWorkflowRenderConfig(): WorkflowRenderConfig {
    return { ...this.workflowRenderConfig };
  }

  /**
   * Get a component by its ID
   * @param id - Component ID (which is its type)
   * @returns Component configuration or undefined
   */
  getComponent<T extends keyof C & string>(id: T): ComponentConfig<C[T]> | undefined;
  getComponent(id: string): ComponentConfig | undefined {
    return this.components.get(id);
  }

  /**
   * List all registered components
   * @returns Array of all components
   */
  getAllComponents(): ComponentConfig[] {
    return Array.from(this.components.values());
  }

  /**
   * Check if a component exists
   * @param id - Component ID
   * @returns True if component exists
   */
  hasComponent(id: string): boolean {
    return this.components.has(id);
  }

  /**
   * Remove a component from the configuration
   * @param id - Component ID
   * @returns True if component was removed
   */
  removeComponent(id: string): boolean {
    return this.components.delete(id);
  }

  /**
   * Clear all components
   */
  clear(): void {
    this.components.clear();
  }

  /**
   * Get statistics about registered components and renderers
   * @returns Object with comprehensive statistics
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
   * Validate the configuration
   * @returns Array of validation errors
   */
  validate(): string[] {
    const errors: string[] = [];
    const components = Array.from(this.components.values());

    // Check for duplicate IDs (should not happen with Map, but good to check)
    const ids = components.map((comp) => comp.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate component IDs found: ${duplicateIds.join(', ')}`);
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
