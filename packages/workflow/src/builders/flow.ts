import type {
  CompletionConfig,
  ConditionalBranch,
  CustomStepRenderer,
  DynamicStepConfig,
  FormConfiguration,
  NavigationConfig,
  PersistenceConfig,
  StepConfig,
  StepLifecycleHooks,
  StepPermissions,
  WorkflowAnalytics,
  WorkflowConfig,
  WorkflowOptimizations,
  WorkflowPlugin,
  WorkflowVersion,
  ril,
} from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { RilayLicenseManager } from '../licensing/RilayLicenseManager';

// Enhanced step configuration interface for better type safety and simplicity
export interface StepDefinition {
  id: string;
  title: string;
  description?: string;
  formConfig: FormConfiguration | form;
  allowSkip?: boolean;
  requiredToComplete?: boolean;
  hooks?: StepLifecycleHooks;
  permissions?: StepPermissions;
  renderer?: CustomStepRenderer;
  dynamicConfig?: DynamicStepConfig;
}

/**
 * Workflow builder class for creating complex multi-step workflows
 * Simplified API with auto-build capability
 */
export class flow {
  private config: ril;
  private workflowId: string;
  private workflowName: string;
  private workflowDescription?: string;
  private steps: StepConfig[] = [];
  private branches: ConditionalBranch[] = [];
  private navigation: NavigationConfig = { allowBackNavigation: true }; // Default to true
  private persistence?: PersistenceConfig;
  private completion?: CompletionConfig;
  private analytics?: WorkflowAnalytics;
  private optimizations?: WorkflowOptimizations;
  private version?: WorkflowVersion;
  private plugins: WorkflowPlugin[] = [];

  constructor(config: ril, workflowId: string, workflowName: string, description?: string) {
    this.config = config;
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.workflowDescription = description;

    RilayLicenseManager.logLicenseStatus();
  }

  static create(config: ril, workflowId: string, workflowName: string, description?: string): flow {
    return new flow(config, workflowId, workflowName, description);
  }

  /**
   * Helper method to create a step configuration from StepDefinition
   */
  private createStepFromDefinition(stepDef: StepDefinition): StepConfig {
    return {
      id: stepDef.id,
      title: stepDef.title,
      description: stepDef.description,
      formConfig:
        stepDef.formConfig instanceof form ? stepDef.formConfig.build() : stepDef.formConfig,
      allowSkip: stepDef.allowSkip || false,
      requiredToComplete: stepDef.requiredToComplete !== false,
      hooks: stepDef.hooks,
      permissions: stepDef.permissions,
      isDynamic: Boolean(stepDef.dynamicConfig),
      dynamicConfig: stepDef.dynamicConfig,
      renderer: stepDef.renderer,
    };
  }

  /**
   * Add a step using simplified StepDefinition object
   */
  addStep(stepDefinition: StepDefinition): this {
    const step = this.createStepFromDefinition(stepDefinition);
    this.steps.push(step);
    return this;
  }

  /**
   * Add a dynamic step using StepDefinition with dynamicConfig
   */
  addDynamicStep(stepDefinition: StepDefinition & { dynamicConfig: DynamicStepConfig }): this {
    return this.addStep(stepDefinition);
  }

  /**
   * Add multiple steps at once
   */
  addSteps(stepDefinitions: StepDefinition[]): this {
    for (const stepDef of stepDefinitions) {
      this.addStep(stepDef);
    }
    return this;
  }

  /**
   * Conditional branches management
   */
  addConditionalBranch(branch: ConditionalBranch): this {
    this.branches.push(branch);
    return this;
  }

  addConditionalBranches(branches: ConditionalBranch[]): this {
    this.branches.push(...branches);
    return this;
  }

  /**
   * Configuration setters with fluent interface
   */
  setNavigation(navigation: NavigationConfig): this {
    this.navigation = { ...this.navigation, ...navigation };
    return this;
  }

  enableBackNavigation(enabled = true): this {
    this.navigation = { ...this.navigation, allowBackNavigation: enabled };
    return this;
  }

  enableStepSkipping(enabled = true): this {
    this.navigation = { ...this.navigation, allowStepSkipping: enabled };
    return this;
  }

  setPersistence(persistence: PersistenceConfig): this {
    this.persistence = persistence;
    return this;
  }

  setAnalytics(analytics: WorkflowAnalytics): this {
    this.analytics = analytics;
    return this;
  }

  setOptimizations(optimizations: WorkflowOptimizations): this {
    this.optimizations = optimizations;
    return this;
  }

  setVersion(version: WorkflowVersion): this {
    this.version = version;
    return this;
  }

  setCompletion(completion: CompletionConfig): this {
    this.completion = completion;
    return this;
  }

  /**
   * Plugin management
   */
  use(plugin: WorkflowPlugin): this {
    this.validatePluginDependencies(plugin);
    this.plugins.push(plugin);

    try {
      plugin.install(this);
    } catch (error) {
      throw new Error(
        `Failed to install plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return this;
  }

  private validatePluginDependencies(plugin: WorkflowPlugin): void {
    if (!plugin.dependencies) return;

    const missingDeps = plugin.dependencies.filter(
      (dep) => !this.plugins.some((p) => p.name === dep)
    );

    if (missingDeps.length > 0) {
      throw new Error(
        `Plugin "${plugin.name}" requires missing dependencies: ${missingDeps.join(', ')}`
      );
    }
  }

  removePlugin(pluginName: string): this {
    this.plugins = this.plugins.filter((plugin) => plugin.name !== pluginName);
    return this;
  }

  /**
   * Step management
   */
  updateStep(stepId: string, updates: Partial<Omit<StepConfig, 'id'>>): this {
    const stepIndex = this.steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step with ID "${stepId}" not found`);
    }

    this.steps[stepIndex] = { ...this.steps[stepIndex], ...updates };
    return this;
  }

  removeStep(stepId: string): this {
    this.steps = this.steps.filter((step) => step.id !== stepId);
    return this;
  }

  getStep(stepId: string): StepConfig | undefined {
    return this.steps.find((step) => step.id === stepId);
  }

  getSteps(): StepConfig[] {
    return [...this.steps];
  }

  clearSteps(): this {
    this.steps = [];
    return this;
  }

  /**
   * Clone the workflow builder
   */
  clone(newWorkflowId?: string, newWorkflowName?: string): flow {
    const cloned = new flow(
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
   */
  validate(): string[] {
    const errors: string[] = [];

    if (this.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check for duplicate step IDs
    const stepIds = this.steps.map((step) => step.id);
    const duplicateStepIds = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
    if (duplicateStepIds.length > 0) {
      errors.push(`Duplicate step IDs: ${duplicateStepIds.join(', ')}`);
    }

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
   */
  getStats() {
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
      allowBackNavigation: this.navigation.allowBackNavigation !== false,
    };
  }

  /**
   * Build the final workflow configuration
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
   * Export/Import functionality
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

/**
 * Factory function to create a workflow builder directly
 */
export function createFlow(
  config: ril,
  workflowId: string,
  workflowName: string,
  description?: string
): flow {
  return flow.create(config, workflowId, workflowName, description);
}
