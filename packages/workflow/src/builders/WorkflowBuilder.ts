import type {
  CompletionConfig,
  ConditionalBranch,
  DynamicStepConfig,
  FormConfiguration,
  NavigationConfig,
  PersistenceStrategy,
  StepConfig,
  StepLifecycleHooks,
  StepPermissions,
  StreamlineConfig,
  WorkflowAnalytics,
  WorkflowConfig,
  WorkflowOptimizations,
  WorkflowPlugin,
  WorkflowVersion,
} from '@streamline/core';

/**
 * Workflow builder class for creating complex multi-step workflows
 * Supports async hooks, dynamic steps, conditional branches, and much more
 */
export class WorkflowBuilder {
  private config: StreamlineConfig;
  private workflowId: string;
  private workflowName: string;
  private workflowDescription?: string;
  private steps: StepConfig[] = [];
  private branches: ConditionalBranch[] = [];
  private navigation: NavigationConfig = {};
  private persistence?: PersistenceStrategy;
  private completion?: CompletionConfig;
  private analytics?: WorkflowAnalytics;
  private optimizations?: WorkflowOptimizations;
  private version?: WorkflowVersion;
  private plugins: WorkflowPlugin[] = [];

  constructor(
    config: StreamlineConfig,
    workflowId: string,
    workflowName: string,
    description?: string
  ) {
    this.config = config;
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.workflowDescription = description;
  }

  /**
   * Add a standard step to the workflow
   * @param stepId - Unique step identifier
   * @param title - Step title
   * @param formConfig - Complete form configuration for this step
   * @param options - Additional step options
   * @returns WorkflowBuilder instance for chaining
   */
  addStep(
    stepId: string,
    title: string,
    formConfig: FormConfiguration,
    options?: {
      description?: string;
      allowSkip?: boolean;
      requiredToComplete?: boolean;
      hooks?: StepLifecycleHooks;
      permissions?: StepPermissions;
    }
  ): this {
    const step: StepConfig = {
      id: stepId,
      title,
      description: options?.description,
      formConfig,
      allowSkip: options?.allowSkip || false,
      requiredToComplete: options?.requiredToComplete !== false,
      hooks: options?.hooks,
      permissions: options?.permissions,
      isDynamic: false,
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a dynamic step that resolves form config based on previous data
   * @param stepId - Unique step identifier
   * @param title - Step title
   * @param dynamicConfig - Configuration for dynamic step resolution
   * @param fallbackFormConfig - Fallback form configuration if dynamic resolution fails
   * @param options - Additional step options
   * @returns WorkflowBuilder instance for chaining
   */
  addDynamicStep(
    stepId: string,
    title: string,
    dynamicConfig: DynamicStepConfig,
    fallbackFormConfig: FormConfiguration,
    options?: {
      description?: string;
      allowSkip?: boolean;
      requiredToComplete?: boolean;
      hooks?: StepLifecycleHooks;
      permissions?: StepPermissions;
    }
  ): this {
    const step: StepConfig = {
      id: stepId,
      title,
      description: options?.description,
      formConfig: fallbackFormConfig, // Will be replaced by dynamic resolution
      allowSkip: options?.allowSkip || false,
      requiredToComplete: options?.requiredToComplete !== false,
      hooks: options?.hooks,
      permissions: options?.permissions,
      isDynamic: true,
      dynamicConfig,
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add multiple steps at once
   * @param stepConfigs - Array of step configurations
   * @returns WorkflowBuilder instance for chaining
   */
  addSteps(
    stepConfigs: Array<{
      stepId: string;
      title: string;
      formConfig: FormConfiguration;
      description?: string;
      allowSkip?: boolean;
      requiredToComplete?: boolean;
      hooks?: StepLifecycleHooks;
      permissions?: StepPermissions;
    }>
  ): this {
    for (const config of stepConfigs) {
      this.addStep(config.stepId, config.title, config.formConfig, {
        description: config.description,
        allowSkip: config.allowSkip,
        requiredToComplete: config.requiredToComplete,
        hooks: config.hooks,
        permissions: config.permissions,
      });
    }
    return this;
  }

  /**
   * Add a conditional branch to the workflow
   * @param branch - Conditional branch configuration
   * @returns WorkflowBuilder instance for chaining
   */
  addConditionalBranch(branch: ConditionalBranch): this {
    this.branches.push(branch);
    return this;
  }

  /**
   * Add multiple conditional branches
   * @param branches - Array of conditional branches
   * @returns WorkflowBuilder instance for chaining
   */
  addConditionalBranches(branches: ConditionalBranch[]): this {
    this.branches.push(...branches);
    return this;
  }

  /**
   * Set navigation configuration
   * @param navigation - Navigation configuration
   * @returns WorkflowBuilder instance for chaining
   */
  setNavigation(navigation: NavigationConfig): this {
    this.navigation = navigation;
    return this;
  }

  /**
   * Set persistence strategy
   * @param persistence - Persistence configuration
   * @returns WorkflowBuilder instance for chaining
   */
  setPersistence(persistence: PersistenceStrategy): this {
    this.persistence = persistence;
    return this;
  }

  /**
   * Set analytics configuration
   * @param analytics - Analytics configuration
   * @returns WorkflowBuilder instance for chaining
   */
  setAnalytics(analytics: WorkflowAnalytics): this {
    this.analytics = analytics;
    return this;
  }

  /**
   * Set performance optimizations
   * @param optimizations - Optimization configuration
   * @returns WorkflowBuilder instance for chaining
   */
  setOptimizations(optimizations: WorkflowOptimizations): this {
    this.optimizations = optimizations;
    return this;
  }

  /**
   * Set workflow version
   * @param version - Version configuration
   * @returns WorkflowBuilder instance for chaining
   */
  setVersion(version: WorkflowVersion): this {
    this.version = version;
    return this;
  }

  /**
   * Set completion configuration
   * @param completion - Completion configuration
   * @returns WorkflowBuilder instance for chaining
   */
  setCompletion(completion: CompletionConfig): this {
    this.completion = completion;
    return this;
  }

  /**
   * Add a plugin to the workflow
   * @param plugin - Plugin to add
   * @returns WorkflowBuilder instance for chaining
   */
  use(plugin: WorkflowPlugin): this {
    // Check dependencies
    if (plugin.dependencies) {
      const missingDeps = plugin.dependencies.filter(
        (dep) => !this.plugins.some((p) => p.name === dep)
      );
      if (missingDeps.length > 0) {
        throw new Error(
          `Plugin "${plugin.name}" requires missing dependencies: ${missingDeps.join(', ')}`
        );
      }
    }

    this.plugins.push(plugin);

    // Install the plugin
    try {
      plugin.install(this);
    } catch (error) {
      throw new Error(
        `Failed to install plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return this;
  }

  /**
   * Remove a plugin from the workflow
   * @param pluginName - Name of the plugin to remove
   * @returns WorkflowBuilder instance for chaining
   */
  removePlugin(pluginName: string): this {
    this.plugins = this.plugins.filter((plugin) => plugin.name !== pluginName);
    return this;
  }

  /**
   * Update step configuration
   * @param stepId - Step identifier
   * @param updates - Updates to apply
   * @returns WorkflowBuilder instance for chaining
   */
  updateStep(stepId: string, updates: Partial<Omit<StepConfig, 'id'>>): this {
    const stepIndex = this.steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step with ID "${stepId}" not found`);
    }

    this.steps[stepIndex] = {
      ...this.steps[stepIndex],
      ...updates,
    };

    return this;
  }

  /**
   * Remove a step from the workflow
   * @param stepId - Step identifier
   * @returns WorkflowBuilder instance for chaining
   */
  removeStep(stepId: string): this {
    this.steps = this.steps.filter((step) => step.id !== stepId);
    return this;
  }

  /**
   * Get step configuration by ID
   * @param stepId - Step identifier
   * @returns Step configuration or undefined
   */
  getStep(stepId: string): StepConfig | undefined {
    return this.steps.find((step) => step.id === stepId);
  }

  /**
   * Get all steps
   * @returns Array of step configurations
   */
  getSteps(): StepConfig[] {
    return [...this.steps];
  }

  /**
   * Clear all steps
   * @returns WorkflowBuilder instance for chaining
   */
  clearSteps(): this {
    this.steps = [];
    return this;
  }

  /**
   * Clone the workflow builder
   * @param newWorkflowId - ID for the cloned workflow
   * @param newWorkflowName - Name for the cloned workflow
   * @returns New WorkflowBuilder instance
   */
  clone(newWorkflowId?: string, newWorkflowName?: string): WorkflowBuilder {
    const cloned = new WorkflowBuilder(
      this.config,
      newWorkflowId || `${this.workflowId}-clone`,
      newWorkflowName || `${this.workflowName} (Copy)`,
      this.workflowDescription
    );

    cloned.steps = this.steps.map((step) => ({ ...step }));
    cloned.branches = this.branches.map((branch) => ({ ...branch }));
    cloned.navigation = { ...this.navigation };
    cloned.persistence = this.persistence ? { ...this.persistence } : undefined;
    cloned.completion = this.completion ? { ...this.completion } : undefined;
    cloned.analytics = this.analytics ? { ...this.analytics } : undefined;
    cloned.optimizations = this.optimizations ? { ...this.optimizations } : undefined;
    cloned.version = this.version ? { ...this.version } : undefined;
    cloned.plugins = [...this.plugins];

    return cloned;
  }

  /**
   * Validate the workflow configuration
   * @returns Array of validation errors
   */
  validate(): string[] {
    const errors: string[] = [];

    // Check for empty workflow
    if (this.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check for duplicate step IDs
    const stepIds = this.steps.map((step) => step.id);
    const duplicateStepIds = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
    if (duplicateStepIds.length > 0) {
      errors.push(`Duplicate step IDs: ${duplicateStepIds.join(', ')}`);
    }

    // Check for circular dependencies in conditional branches
    // TODO: Implement cycle detection

    // Check plugin dependencies
    for (const plugin of this.plugins) {
      if (plugin.dependencies) {
        const missingDeps = plugin.dependencies.filter(
          (dep) => !this.plugins.some((p) => p.name === dep)
        );
        if (missingDeps.length > 0) {
          errors.push(
            `Plugin "${plugin.name}" requires missing dependencies: ${missingDeps.join(', ')}`
          );
        }
      }
    }

    return errors;
  }

  /**
   * Get workflow statistics
   * @returns Object with workflow statistics
   */
  getStats(): {
    totalSteps: number;
    dynamicSteps: number;
    conditionalBranches: number;
    pluginsInstalled: number;
    estimatedFields: number;
    hasPersistence: boolean;
    hasAnalytics: boolean;
  } {
    return {
      totalSteps: this.steps.length,
      dynamicSteps: this.steps.filter((step) => step.isDynamic).length,
      conditionalBranches: this.branches.length,
      pluginsInstalled: this.plugins.length,
      estimatedFields: this.steps.reduce(
        (total, step) => total + step.formConfig.allFields.length,
        0
      ),
      hasPersistence: Boolean(this.persistence),
      hasAnalytics: Boolean(this.analytics),
    };
  }

  /**
   * Build the final workflow configuration
   * @returns Complete workflow configuration
   */
  build(): WorkflowConfig {
    const errors = this.validate();

    if (errors.length > 0) {
      throw new Error(`Workflow validation failed: ${errors.join(', ')}`);
    }

    return {
      id: this.workflowId,
      name: this.workflowName,
      description: this.workflowDescription,
      steps: [...this.steps],
      branches: [...this.branches],
      navigation: this.navigation,
      persistence: this.persistence,
      completion: this.completion,
      analytics: this.analytics,
      optimizations: this.optimizations,
      version: this.version,
      plugins: [...this.plugins],
      renderConfig: this.config.getWorkflowRenderConfig(),
    };
  }

  /**
   * Export workflow configuration as JSON
   * @returns JSON representation of the workflow
   */
  toJSON(): any {
    return {
      id: this.workflowId,
      name: this.workflowName,
      description: this.workflowDescription,
      steps: this.steps,
      branches: this.branches,
      navigation: this.navigation,
      persistence: this.persistence,
      completion: this.completion,
      analytics: this.analytics,
      optimizations: this.optimizations,
      version: this.version,
      plugins: this.plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        dependencies: plugin.dependencies,
      })),
    };
  }

  /**
   * Import workflow configuration from JSON
   * @param json - JSON representation of the workflow
   * @returns WorkflowBuilder instance for chaining
   */
  fromJSON(json: any): this {
    if (json.id) this.workflowId = json.id;
    if (json.name) this.workflowName = json.name;
    if (json.description) this.workflowDescription = json.description;
    if (json.steps) this.steps = json.steps;
    if (json.branches) this.branches = json.branches;
    if (json.navigation) this.navigation = json.navigation;
    if (json.persistence) this.persistence = json.persistence;
    if (json.completion) this.completion = json.completion;
    if (json.analytics) this.analytics = json.analytics;
    if (json.optimizations) this.optimizations = json.optimizations;
    if (json.version) this.version = json.version;

    return this;
  }
}
