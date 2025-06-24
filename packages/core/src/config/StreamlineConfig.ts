import type {
  ComponentConfig,
  ComponentType,
  FormBodyRenderer,
  FormRenderConfig,
  FormRowRenderer,
  FormSubmitButtonRenderer,
  InputType,
  LayoutType,
} from "../types";

/**
 * Main configuration class for Streamline form components
 * Manages component registration, retrieval, and configuration
 */
export class StreamlineConfig {
  private components = new Map<string, ComponentConfig>();
  private formRenderConfig: FormRenderConfig = {};

  /**
   * Add a component to the configuration
   * @param subType - The component subtype (e.g., 'text', 'email', 'heading')
   * @param config - Component configuration without id and subType
   * @returns The StreamlineConfig instance for chaining
   */
  addComponent<TProps = any>(
    subType: InputType | LayoutType,
    config: Omit<ComponentConfig<TProps>, "id" | "subType"> & { id?: string }
  ): this {
    const componentId = config.id || `${config.type}-${subType}-${Date.now()}`;

    const fullConfig: ComponentConfig<TProps> = {
      id: componentId,
      subType,
      ...config,
    };

    this.components.set(componentId, fullConfig as ComponentConfig);
    return this;
  }

  /**
   * Set custom row renderer
   * @param renderer - Custom row renderer function
   * @returns The StreamlineConfig instance for chaining
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
   * @returns The StreamlineConfig instance for chaining
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
   * @returns The StreamlineConfig instance for chaining
   */
  setSubmitButtonRenderer(renderer: FormSubmitButtonRenderer): this {
    this.formRenderConfig = {
      ...this.formRenderConfig,
      submitButtonRenderer: renderer,
    };
    return this;
  }

  /**
   * Set complete render configuration
   * @param config - Form render configuration
   * @returns The StreamlineConfig instance for chaining
   */
  setRenderConfig(config: FormRenderConfig): this {
    this.formRenderConfig = config;
    return this;
  }

  /**
   * Get current render configuration
   * @returns Current form render configuration
   */
  getRenderConfig(): FormRenderConfig {
    return { ...this.formRenderConfig };
  }

  /**
   * Get a component by its ID
   * @param id - Component ID
   * @returns Component configuration or undefined
   */
  getComponent(id: string): ComponentConfig | undefined {
    return this.components.get(id);
  }

  /**
   * List components by type (input or layout)
   * @param type - Component type
   * @returns Array of matching components
   */
  getComponentsByType(type: ComponentType): ComponentConfig[] {
    return Array.from(this.components.values()).filter(
      (comp) => comp.type === type
    );
  }

  /**
   * List components by sub-type
   * @param subType - Component sub-type
   * @returns Array of matching components
   */
  getComponentsBySubType(subType: InputType | LayoutType): ComponentConfig[] {
    return Array.from(this.components.values()).filter(
      (comp) => comp.subType === subType
    );
  }

  /**
   * Get components by category
   * @param category - Component category
   * @returns Array of matching components
   */
  getComponentsByCategory(category: string): ComponentConfig[] {
    return Array.from(this.components.values()).filter(
      (comp) => comp.category === category
    );
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
   * Export configuration as a plain object
   * @returns Object with component configurations
   */
  export(): Record<string, ComponentConfig> {
    return Object.fromEntries(this.components);
  }

  /**
   * Import configuration from a plain object
   * @param config - Object with component configurations
   * @returns The StreamlineConfig instance for chaining
   */
  import(config: Record<string, ComponentConfig>): this {
    Object.entries(config).forEach(([id, componentConfig]) => {
      this.components.set(id, componentConfig);
    });
    return this;
  }

  /**
   * Get statistics about registered components
   * @returns Object with component statistics
   */
  getStats(): {
    total: number;
    byType: Record<ComponentType, number>;
    bySubType: Record<string, number>;
    byCategory: Record<string, number>;
    hasCustomRenderers: {
      row: boolean;
      body: boolean;
      submitButton: boolean;
    };
  } {
    const components = Array.from(this.components.values());

    return {
      total: components.length,
      byType: components.reduce((acc, comp) => {
        acc[comp.type] = (acc[comp.type] || 0) + 1;
        return acc;
      }, {} as Record<ComponentType, number>),
      bySubType: components.reduce((acc, comp) => {
        acc[comp.subType] = (acc[comp.subType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byCategory: components.reduce((acc, comp) => {
        const category = comp.category || "uncategorized";
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      hasCustomRenderers: {
        row: Boolean(this.formRenderConfig.rowRenderer),
        body: Boolean(this.formRenderConfig.bodyRenderer),
        submitButton: Boolean(this.formRenderConfig.submitButtonRenderer),
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
      errors.push(`Duplicate component IDs found: ${duplicateIds.join(", ")}`);
    }

    // Check for components without renderers
    const componentsWithoutRenderer = components.filter(
      (comp) => !comp.renderer
    );
    if (componentsWithoutRenderer.length > 0) {
      errors.push(
        `Components without renderer: ${componentsWithoutRenderer
          .map((comp) => comp.id)
          .join(", ")}`
      );
    }

    return errors;
  }
}
