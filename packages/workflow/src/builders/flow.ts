import type {
  CompletionConfig,
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
  WorkflowPlugin,
} from '@rilaykit/core';
import {
  IdGenerator,
  ValidationErrorBuilder,
  configureObject,
  deepClone,
  ensureUnique,
  normalizeToArray,
  ril,
} from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { RilayLicenseManager } from '../licensing/RilayLicenseManager';

/**
 * Enhanced step configuration interface for better type safety and simplicity
 *
 * This interface defines the structure for creating workflow steps with all
 * necessary configuration options. It provides a clean API for step definition
 * while maintaining flexibility for complex workflows.
 *
 * @interface StepDefinition
 */
export interface StepDefinition {
  /**
   * Unique identifier for the step
   * If not provided, will be auto-generated using the internal ID generator
   */
  id?: string;

  /**
   * Display title for the step
   * This will be shown to users in the workflow interface
   */
  title: string;

  /**
   * Optional description providing additional context about the step
   * Useful for complex workflows where steps need explanation
   */
  description?: string;

  /**
   * Form configuration for the step
   * Can be either a built FormConfiguration or a form builder instance
   */
  formConfig: FormConfiguration | form;

  /**
   * Whether users can skip this step
   * @default false
   */
  allowSkip?: boolean;

  /**
   * Whether this step is required to complete the workflow
   * @default true
   */
  requiredToComplete?: boolean;

  /**
   * Lifecycle hooks for step events
   * Allows custom logic at different points in the step lifecycle
   */
  hooks?: StepLifecycleHooks;

  /**
   * Permission configuration for step access control
   * Defines who can view, edit, or complete this step
   */
  permissions?: StepPermissions;

  /**
   * Custom renderer for the step
   * Allows complete customization of step presentation
   */
  renderer?: CustomStepRenderer;

  /**
   * Dynamic step configuration
   * Enables conditional step behavior based on previous step data
   */
  dynamicConfig?: DynamicStepConfig;
}

/**
 * Configuration options for workflow behavior and features
 *
 * This interface consolidates all workflow-level configuration options
 * into a single, easy-to-use structure for the configure() method.
 *
 * @interface WorkflowOptions
 */
interface WorkflowOptions {
  /** Navigation behavior configuration */
  navigation?: NavigationConfig;

  /** Data persistence settings */
  persistence?: PersistenceConfig;

  /** Workflow completion handling */
  completion?: CompletionConfig;

  /** Analytics and tracking configuration */
  analytics?: WorkflowAnalytics;
}

/**
 * Workflow builder class for creating complex multi-step workflows
 *
 * The flow class provides a comprehensive API for building multi-step workflows
 * with form-based steps. It follows the builder pattern with method chaining
 * and includes advanced features like dynamic steps, plugins, and analytics.
 *
 * Key Features:
 * - Polymorphic step addition (single or multiple steps)
 * - Plugin system for extensibility
 * - Built-in validation and error handling
 * - Clone and export/import functionality
 * - Comprehensive statistics and analytics
 * - Type-safe configuration management
 *
 * @example
 * ```typescript
 * const workflow = flow.create(rilConfig, 'user-onboarding', 'User Onboarding')
 *   .addStep({
 *     title: 'Personal Information',
 *     formConfig: personalInfoForm
 *   })
 *   .addStep({
 *     title: 'Account Setup',
 *     formConfig: accountForm,
 *     allowSkip: true
 *   })
 *   .configure({
 *     navigation: { allowBackNavigation: true },
 *     persistence: { saveOnStepComplete: true }
 *   })
 *   .build();
 * ```
 *
 * @class flow
 */
export class flow {
  private config: ril;
  private workflowId: string;
  private workflowName: string;
  private workflowDescription?: string;
  private steps: StepConfig[] = [];
  private navigation: NavigationConfig = { allowBackNavigation: true };
  private persistence?: PersistenceConfig;
  private completion?: CompletionConfig;
  private analytics?: WorkflowAnalytics;
  private plugins: WorkflowPlugin[] = [];
  private idGenerator = new IdGenerator();

  /**
   * Creates a new workflow builder instance
   *
   * @param config - The ril configuration instance
   * @param workflowId - Unique identifier for the workflow
   * @param workflowName - Display name for the workflow
   * @param description - Optional description of the workflow purpose
   */
  constructor(config: ril, workflowId: string, workflowName: string, description?: string) {
    this.config = config;
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.workflowDescription = description;

    RilayLicenseManager.logLicenseStatus();
  }

  /**
   * Static factory method to create a new workflow builder
   *
   * This is the preferred way to create workflow builders as it provides
   * better type inference and follows the factory pattern.
   *
   * @param config - The ril configuration instance
   * @param workflowId - Unique identifier for the workflow
   * @param workflowName - Display name for the workflow
   * @param description - Optional description of the workflow purpose
   * @returns A new flow builder instance
   *
   * @example
   * ```typescript
   * const workflow = flow.create(rilConfig, 'checkout', 'Checkout Process');
   * ```
   */
  static create(config: ril, workflowId: string, workflowName: string, description?: string): flow {
    return new flow(config, workflowId, workflowName, description);
  }

  /**
   * Helper method to create a step configuration from StepDefinition
   *
   * This internal method handles the conversion from the user-friendly
   * StepDefinition interface to the internal StepConfig structure,
   * including ID generation and form configuration processing.
   *
   * @private
   * @param stepDef - The step definition to convert
   * @returns A complete StepConfig object
   */
  private createStepFromDefinition(stepDef: StepDefinition): StepConfig {
    return {
      id: stepDef.id || this.idGenerator.next('step'),
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
   * Universal add method - handles single steps or multiple steps
   *
   * This polymorphic method provides a clean API for adding steps to the workflow.
   * It can handle both single step definitions and arrays of step definitions,
   * making it easy to build workflows programmatically.
   *
   * @param stepDefinition - Single step definition
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * // Add a single step
   * workflow.addStep({
   *   title: 'User Details',
   *   formConfig: userForm
   * });
   * ```
   */
  addStep(stepDefinition: StepDefinition): this;

  /**
   * Universal add method - handles single steps or multiple steps
   *
   * @param stepDefinitions - Array of step definitions
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * // Add multiple steps at once
   * workflow.addStep([
   *   { title: 'Step 1', formConfig: form1 },
   *   { title: 'Step 2', formConfig: form2 }
   * ]);
   * ```
   */
  addStep(stepDefinitions: StepDefinition[]): this;

  addStep(input: StepDefinition | StepDefinition[]): this {
    const stepDefinitions = normalizeToArray(input);

    for (const stepDef of stepDefinitions) {
      const step = this.createStepFromDefinition(stepDef);
      this.steps.push(step);
    }

    return this;
  }

  /**
   * Add a dynamic step using StepDefinition with dynamicConfig
   *
   * Dynamic steps can change their behavior, visibility, or configuration
   * based on data from previous steps. This method is a convenience wrapper
   * around addStep() with enhanced type safety for dynamic configurations.
   *
   * @param stepDefinition - Step definition with required dynamicConfig
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * workflow.addDynamicStep({
   *   title: 'Conditional Step',
   *   formConfig: conditionalForm,
   *   dynamicConfig: {
   *     condition: (data) => data.userType === 'premium',
   *     generator: (data) => generatePremiumForm(data)
   *   }
   * });
   * ```
   */
  addDynamicStep(stepDefinition: StepDefinition & { dynamicConfig: DynamicStepConfig }): this {
    return this.addStep(stepDefinition);
  }

  /**
   * Universal configuration method for all workflow options
   *
   * This method replaces individual setter methods with a single consolidated API
   * for configuring all aspects of workflow behavior. It uses deep merging to
   * preserve existing configurations while applying new settings.
   *
   * @param options - Configuration options to apply
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * workflow.configure({
   *   navigation: {
   *     allowBackNavigation: true,
   *     showProgressBar: true
   *   },
   *   persistence: {
   *     saveOnStepComplete: true,
   *     storageKey: 'my-workflow'
   *   },
   *   analytics: {
   *     trackStepCompletion: true,
   *     trackFieldInteractions: false
   *   }
   * });
   * ```
   */
  configure(options: WorkflowOptions): this {
    if (options.navigation) {
      this.navigation = configureObject(this.navigation, options.navigation);
    }
    if (options.persistence) {
      this.persistence = options.persistence;
    }
    if (options.completion) {
      this.completion = options.completion;
    }
    if (options.analytics) {
      this.analytics = options.analytics;
    }

    return this;
  }

  /**
   * Plugin management with enhanced validation
   *
   * Installs a plugin into the workflow with dependency validation.
   * Plugins can extend workflow functionality, add custom renderers,
   * or integrate with external services.
   *
   * @param plugin - The plugin to install
   * @returns The flow instance for method chaining
   * @throws Error if plugin installation fails or dependencies are missing
   *
   * @example
   * ```typescript
   * workflow.use(customPlugin)
   *         .use(anotherPlugin);
   * ```
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

  /**
   * Validates plugin dependencies before installation
   *
   * @private
   * @param plugin - The plugin to validate
   * @throws Error if required dependencies are missing
   */
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

  /**
   * Remove a plugin from the workflow
   *
   * @param pluginName - Name of the plugin to remove
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * workflow.removePlugin('analytics-plugin');
   * ```
   */
  removePlugin(pluginName: string): this {
    this.plugins = this.plugins.filter((plugin) => plugin.name !== pluginName);
    return this;
  }

  /**
   * Update an existing step configuration
   *
   * Allows modification of step properties after the step has been added.
   * Useful for dynamic workflows or configuration updates based on user input.
   *
   * @param stepId - ID of the step to update
   * @param updates - Partial step configuration updates
   * @returns The flow instance for method chaining
   * @throws Error if step with given ID is not found
   *
   * @example
   * ```typescript
   * workflow.updateStep('step-1', {
   *   title: 'Updated Title',
   *   allowSkip: true
   * });
   * ```
   */
  updateStep(stepId: string, updates: Partial<Omit<StepConfig, 'id'>>): this {
    const stepIndex = this.steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step with ID "${stepId}" not found`);
    }

    this.steps[stepIndex] = { ...this.steps[stepIndex], ...updates };
    return this;
  }

  /**
   * Remove a step from the workflow
   *
   * @param stepId - ID of the step to remove
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * workflow.removeStep('optional-step');
   * ```
   */
  removeStep(stepId: string): this {
    this.steps = this.steps.filter((step) => step.id !== stepId);
    return this;
  }

  /**
   * Get a specific step by ID
   *
   * @param stepId - ID of the step to retrieve
   * @returns The step configuration or undefined if not found
   *
   * @example
   * ```typescript
   * const step = workflow.getStep('user-details');
   * if (step) {
   *   console.log(step.title);
   * }
   * ```
   */
  getStep(stepId: string): StepConfig | undefined {
    return this.steps.find((step) => step.id === stepId);
  }

  /**
   * Get all steps in the workflow
   *
   * Returns a copy of the steps array to prevent external modification.
   *
   * @returns Array of all step configurations
   *
   * @example
   * ```typescript
   * const allSteps = workflow.getSteps();
   * console.log(`Workflow has ${allSteps.length} steps`);
   * ```
   */
  getSteps(): StepConfig[] {
    return [...this.steps];
  }

  /**
   * Clear all steps from the workflow
   *
   * Removes all steps and resets the ID generator. Useful for rebuilding
   * workflows or creating templates.
   *
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * workflow.clearSteps()
   *         .addStep(newStep1)
   *         .addStep(newStep2);
   * ```
   */
  clearSteps(): this {
    this.steps = [];
    this.idGenerator.reset();
    return this;
  }

  /**
   * Clone the workflow builder
   *
   * Creates a deep copy of the workflow builder with optional new ID and name.
   * All configuration, steps, and plugins are copied to the new instance.
   *
   * @param newWorkflowId - Optional new workflow ID
   * @param newWorkflowName - Optional new workflow name
   * @returns A new flow instance with copied configuration
   *
   * @example
   * ```typescript
   * const template = workflow.clone('new-workflow', 'New Workflow');
   * template.addStep(additionalStep);
   * ```
   */
  clone(newWorkflowId?: string, newWorkflowName?: string): flow {
    const cloned = new flow(
      this.config,
      newWorkflowId || `${this.workflowId}-clone`,
      newWorkflowName || `${this.workflowName} (Copy)`,
      this.workflowDescription
    );

    cloned.steps = deepClone(this.steps);
    cloned.navigation = deepClone(this.navigation);
    cloned.persistence = this.persistence ? deepClone(this.persistence) : undefined;
    cloned.completion = this.completion ? deepClone(this.completion) : undefined;
    cloned.analytics = this.analytics ? deepClone(this.analytics) : undefined;
    cloned.plugins = [...this.plugins];

    return cloned;
  }

  /**
   * Enhanced validation using shared utilities
   *
   * Performs comprehensive validation of the workflow configuration,
   * checking for common issues like missing steps, duplicate IDs,
   * and plugin dependency problems.
   *
   * @returns Array of validation error messages (empty if valid)
   *
   * @example
   * ```typescript
   * const errors = workflow.validate();
   * if (errors.length > 0) {
   *   console.error('Validation errors:', errors);
   * }
   * ```
   */
  validate(): string[] {
    const errorBuilder = new ValidationErrorBuilder();

    errorBuilder.addIf(this.steps.length === 0, 'NO_STEPS', 'Workflow must have at least one step');

    // Check for duplicate step IDs using shared utility
    const stepIds = this.steps.map((step) => step.id);
    try {
      ensureUnique(stepIds, 'step');
    } catch (error) {
      errorBuilder.add(
        'DUPLICATE_STEP_IDS',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Check plugin dependencies
    for (const plugin of this.plugins) {
      if (plugin.dependencies) {
        const missingDeps = plugin.dependencies.filter(
          (dep) => !this.plugins.some((p) => p.name === dep)
        );
        errorBuilder.addIf(
          missingDeps.length > 0,
          'MISSING_PLUGIN_DEPENDENCIES',
          `Plugin "${plugin.name}" requires missing dependencies: ${missingDeps.join(', ')}`
        );
      }
    }

    return errorBuilder.build().map((err) => err.message);
  }

  /**
   * Get comprehensive workflow statistics
   *
   * Provides detailed analytics about the workflow structure and configuration.
   * Useful for monitoring, optimization, and reporting purposes.
   *
   * @returns Object containing various workflow statistics
   *
   * @example
   * ```typescript
   * const stats = workflow.getStats();
   * console.log(`Workflow has ${stats.totalSteps} steps`);
   * console.log(`Estimated ${stats.estimatedFields} total fields`);
   * ```
   */
  getStats() {
    return {
      /** Total number of steps in the workflow */
      totalSteps: this.steps.length,
      /** Number of dynamic steps */
      dynamicSteps: this.steps.filter((step) => step.isDynamic).length,
      /** Number of installed plugins */
      pluginsInstalled: this.plugins.length,
      /** Estimated total number of form fields across all steps */
      estimatedFields: this.steps.reduce(
        (total, step) => total + step.formConfig.allFields.length,
        0
      ),
      /** Whether persistence is configured */
      hasPersistence: Boolean(this.persistence),
      /** Whether analytics is configured */
      hasAnalytics: Boolean(this.analytics),
      /** Whether back navigation is allowed */
      allowBackNavigation: this.navigation.allowBackNavigation !== false,
    };
  }

  /**
   * Build the final workflow configuration
   *
   * Validates the workflow and creates the final configuration object
   * that can be used by the workflow runtime. This method should be
   * called after all configuration is complete.
   *
   * @returns Complete workflow configuration
   * @throws Error if validation fails
   *
   * @example
   * ```typescript
   * try {
   *   const workflowConfig = workflow.build();
   *   // Use workflowConfig with workflow runtime
   * } catch (error) {
   *   console.error('Workflow build failed:', error.message);
   * }
   * ```
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
      navigation: this.navigation,
      persistence: this.persistence,
      completion: this.completion,
      analytics: this.analytics,
      plugins: [...this.plugins],
      renderConfig: this.config.getWorkflowRenderConfig(),
    };
  }

  /**
   * Export workflow configuration to JSON
   *
   * Serializes the workflow configuration to a JSON-compatible object.
   * Useful for saving workflows, creating templates, or transferring
   * configurations between systems.
   *
   * @returns JSON-serializable workflow configuration
   *
   * @example
   * ```typescript
   * const json = workflow.toJSON();
   * localStorage.setItem('workflow-template', JSON.stringify(json));
   * ```
   */
  toJSON(): any {
    return {
      id: this.workflowId,
      name: this.workflowName,
      description: this.workflowDescription,
      steps: this.steps,
      navigation: this.navigation,
      persistence: this.persistence,
      completion: this.completion,
      analytics: this.analytics,
      plugins: this.plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        dependencies: plugin.dependencies,
      })),
    };
  }

  /**
   * Import workflow configuration from JSON
   *
   * Loads workflow configuration from a JSON object. This method
   * performs partial updates, only modifying properties that are
   * present in the JSON object.
   *
   * @param json - JSON object containing workflow configuration
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * const json = JSON.parse(localStorage.getItem('workflow-template'));
   * workflow.fromJSON(json);
   * ```
   */
  fromJSON(json: any): this {
    if (json.id) this.workflowId = json.id;
    if (json.name) this.workflowName = json.name;
    if (json.description) this.workflowDescription = json.description;
    if (json.steps) this.steps = json.steps;
    if (json.navigation) this.navigation = json.navigation;
    if (json.persistence) this.persistence = json.persistence;
    if (json.completion) this.completion = json.completion;
    if (json.analytics) this.analytics = json.analytics;

    return this;
  }
}

/**
 * Factory function to create a workflow builder directly
 *
 * This is a convenience function that provides an alternative to using
 * the class constructor or static create method. It's particularly useful
 * for functional programming styles or when you prefer function calls
 * over class instantiation.
 *
 * @param config - The ril configuration instance
 * @param workflowId - Unique identifier for the workflow
 * @param workflowName - Display name for the workflow
 * @param description - Optional description of the workflow purpose
 * @returns A new flow builder instance
 *
 * @example
 * ```typescript
 * const workflow = createFlow(rilConfig, 'onboarding', 'User Onboarding');
 * ```
 */
export function createFlow(
  config: ril,
  workflowId: string,
  workflowName: string,
  description?: string
): flow {
  return flow.create(config, workflowId, workflowName, description);
}

/**
 * Module augmentation to add createFlow method to ril instances
 *
 * This declaration extends the ril interface to include the createFlow
 * method, allowing for a more integrated API experience where workflows
 * can be created directly from ril configuration instances.
 */
declare module '@rilaykit/core' {
  interface ril {
    /**
     * Creates a new workflow builder using this ril configuration
     *
     * @param workflowId - Unique identifier for the workflow
     * @param workflowName - Display name for the workflow
     * @param description - Optional description of the workflow purpose
     * @returns A new flow builder instance
     *
     * @example
     * ```typescript
     * const workflow = rilConfig.createFlow('checkout', 'Checkout Process');
     * ```
     */
    flow(workflowId: string, workflowName: string, description?: string): flow;
  }
}

/**
 * Extend ril prototype with the createFlow method
 *
 * This implementation adds the createFlow method to all ril instances,
 * maintaining type safety and providing a convenient API for workflow creation
 * that integrates seamlessly with the existing ril configuration system.
 */
(ril as any).prototype.flow = function (
  workflowId: string,
  workflowName: string,
  description?: string
) {
  return flow.create(this, workflowId, workflowName, description);
};
