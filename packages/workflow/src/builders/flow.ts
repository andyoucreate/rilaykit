import type {
  CustomStepRenderer,
  FormConfiguration,
  StepConditionalBehavior,
  StepConfig,
  StepDataHelper,
  WorkflowAnalytics,
  WorkflowConfig,
  WorkflowContext,
  WorkflowPlugin,
} from '@rilaykit/core';
import { IdGenerator, deepClone, ensureUnique, normalizeToArray, type ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import type { StepContext, StepMetadata } from '../context/step-context';
import { createStepContext } from '../context/step-context';
import type { PersistenceOptions, WorkflowPersistenceAdapter } from '../persistence/types';

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
  formConfig: FormConfiguration<any> | form<any>;

  /**
   * Whether users can skip this step
   * @default false
   */
  allowSkip?: boolean;

  /**
   * Custom renderer for the step
   * Allows complete customization of step presentation
   */
  renderer?: CustomStepRenderer;

  /**
   * Conditional behavior configuration for this step
   * Controls visibility and skippable state
   */
  conditions?: StepConditionalBehavior;

  /**
   * Custom metadata for this step
   * Allows storing arbitrary information that can be accessed via hooks and context
   *
   * This is useful for:
   * - UI customization (icons, colors, themes)
   * - Analytics tracking (categories, priorities, custom events)
   * - Business logic flags (feature flags, permissions, workflow rules)
   * - Integration data (external IDs, API endpoints, configuration)
   *
   * @example
   * ```typescript
   * {
   *   metadata: {
   *     icon: 'user-circle',
   *     category: 'personal-info',
   *     tags: ['onboarding', 'required']
   *   }
   * }
   * ```
   */
  metadata?: StepMetadata;

  /**
   * Callback function that executes after successful validation and before moving to next step
   *
   * Simplified signature with a single StepContext parameter containing all necessary data and methods.
   *
   * @param step - Structured context with data, next-step controls, and workflow access
   *
   * @example
   * ```typescript
   * after: async (step) => {
   *   // Access current step data
   *   if (step.data.userType === 'business') {
   *     // Pre-fill next step
   *     step.next.prefill({
   *       companyName: '',
   *       taxId: ''
   *     });
   *   }
   *
   *   // Access other steps
   *   const basics = step.workflow.get('basics');
   *
   *   // Navigation
   *   if (step.data.skipPayment) {
   *     step.next.skip();
   *   }
   * }
   * ```
   */
  after?: (step: StepContext) => void | Promise<void>;

  /**
   * Legacy callback function with verbose 3-parameter signature
   *
   * @deprecated Use `after` instead for a simpler, more intuitive API.
   *
   * This callback is called after successful validation and before moving to the next step.
   * The new `after` callback provides the same functionality with a cleaner, single-parameter API.
   *
   * @param stepData - The validated data from the current step
   * @param helper - Helper object with methods to interact with workflow data
   * @param context - Workflow context with navigation state
   */
  onAfterValidation?: (
    stepData: Record<string, any>,
    helper: StepDataHelper,
    context: WorkflowContext
  ) => void | Promise<void>;
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
  /** Analytics and tracking configuration */
  analytics?: WorkflowAnalytics;
  /** Persistence configuration */
  persistence?: {
    adapter: WorkflowPersistenceAdapter;
    options?: PersistenceOptions;
    userId?: string;
  };
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
 * DX Notes:
 * - Recommended: use the explicit factory `flow.create(rilConfig, id, name)`; we do not augment ril with `.flow()`.
 * - Steps accept either a built `FormConfiguration` or a `form` builder; builders are built internally.
 * - Use `when('path')...build()` for step-level conditions in `StepConditionalBehavior`.
 *
 * @example
 * ```typescript
 * // With explicit ID and name
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
 *     analytics: { trackStepCompletion: true }
 *   })
 *   .build();
 *
 * // With auto-generated ID and default name
 * const workflow = flow.create(rilConfig)
 *   .addStep({ title: 'Step 1', formConfig: step1Form })
 *   .build();
 * ```
 *
 * @class flow
 */
export class flow {
  private config: ril<any>;
  private workflowId: string;
  private workflowName: string;
  private workflowDescription?: string;
  private steps: StepConfig[] = [];
  private analytics?: WorkflowAnalytics;
  private persistenceConfig?: {
    adapter: WorkflowPersistenceAdapter;
    options?: PersistenceOptions;
    userId?: string;
  };
  private plugins: WorkflowPlugin[] = [];
  private idGenerator = new IdGenerator();

  /**
   * Creates a new workflow builder instance
   *
   * @param config - The ril configuration instance
   * @param workflowId - Optional unique identifier for the workflow. Auto-generated if not provided
   * @param workflowName - Optional display name for the workflow. Defaults to "Workflow" if not provided
   * @param description - Optional description of the workflow purpose
   */
  constructor(config: ril<any>, workflowId?: string, workflowName?: string, description?: string) {
    this.config = config;
    this.workflowId = workflowId || `workflow-${Math.random().toString(36).substring(2, 15)}`;
    this.workflowName = workflowName || 'Workflow';
    this.workflowDescription = description;
  }

  /**
   * Static factory method to create a new workflow builder
   *
   * This is the preferred way to create workflow builders as it provides
   * better type inference and follows the factory pattern.
   *
   * DX Note: Prefer using this factory over `new flow(...)` for clarity and consistency.
   *
   * @param config - The ril configuration instance
   * @param workflowId - Optional unique identifier for the workflow. Auto-generated if not provided
   * @param workflowName - Optional display name for the workflow. Defaults to "Workflow" if not provided
   * @param description - Optional description of the workflow purpose
   * @returns A new flow builder instance
   *
   * @example
   * ```typescript
   * // With explicit ID and name
   * const workflow = flow.create(rilConfig, 'checkout', 'Checkout Process');
   *
   * // With auto-generated ID and default name
   * const workflow = flow.create(rilConfig);
   * ```
   */
  static create(
    config: ril<any>,
    workflowId?: string,
    workflowName?: string,
    description?: string
  ): flow {
    return new flow(config, workflowId, workflowName, description);
  }

  /**
   * Helper method to create a step configuration from StepDefinition
   *
   * This internal method handles the conversion from the user-friendly
   * StepDefinition interface to the internal StepConfig structure,
   * including ID generation, form configuration processing, and validation setup.
   *
   * @private
   * @param stepDef - The step definition to convert
   * @returns A complete StepConfig object
   */
  private createStepFromDefinition(stepDef: StepDefinition): StepConfig {
    // Transform new 'after' callback to legacy 'onAfterValidation' format
    // If 'after' is provided, use it (transformed). Otherwise, use legacy 'onAfterValidation'
    const onAfterValidation = stepDef.after
      ? (stepData: Record<string, any>, helper: StepDataHelper, context: WorkflowContext) => {
          const stepContext = createStepContext(stepData, helper, context, stepDef.metadata);
          return stepDef.after!(stepContext);
        }
      : stepDef.onAfterValidation;

    return {
      id: stepDef.id || this.idGenerator.next('step'),
      title: stepDef.title,
      description: stepDef.description,
      formConfig:
        stepDef.formConfig instanceof form ? stepDef.formConfig.build() : stepDef.formConfig,
      allowSkip: stepDef.allowSkip || false,
      renderer: stepDef.renderer,
      conditions: stepDef.conditions,
      metadata: stepDef.metadata,
      onAfterValidation,
    };
  }

  /**
   * Internal method to add steps - shared implementation for addStep() and step()
   * @private
   */
  private _addStepsInternal(input: StepDefinition | StepDefinition[]): this {
    const stepDefinitions = normalizeToArray(input);

    for (const stepDef of stepDefinitions) {
      const step = this.createStepFromDefinition(stepDef);
      this.steps.push(step);
    }

    return this;
  }

  /**
   * Universal add method - handles single steps or multiple steps
   *
   * This polymorphic method provides a clean API for adding steps to the workflow.
   * It can handle both single step definitions and arrays of step definitions,
   * making it easy to build workflows programmatically.
   *
   * **Note:** A shorter alias `.step()` is available for the same functionality.
   *
   * @param stepDefinition - Single step definition
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * // Add a single step
   * workflow.addStep({
   *   title: 'User Details',
   *   formConfig: userForm,
   *   after: async (step) => {
   *     // New simplified callback signature
   *     step.next.prefill({ field: 'value' });
   *   }
   * });
   *
   * // Or use the shorter .step() alias
   * workflow.step({
   *   title: 'User Details',
   *   formConfig: userForm
   * });
   * ```
   */
  addStep(stepDefinition: StepDefinition): this;

  /**
   * Universal add method - handles single steps or multiple steps
   *
   * **Note:** A shorter alias `.step()` is available for the same functionality.
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
    return this._addStepsInternal(input);
  }

  /**
   * Alias for addStep() - provides a shorter, more concise API
   *
   * This method is functionally identical to addStep() and exists purely
   * for developer experience. Use whichever you prefer - both are fully supported.
   *
   * @param input - Single step definition or array of step definitions
   * @returns The flow instance for method chaining
   *
   * @example
   * ```typescript
   * // Using the concise .step() alias
   * workflow.step({
   *   title: 'User Details',
   *   formConfig: userForm,
   *   after: async (step) => {
   *     step.next.prefill({ companyName: '' });
   *   }
   * });
   *
   * // Also supports arrays (same as addStep)
   * workflow.step([
   *   { title: 'Step 1', formConfig: form1 },
   *   { title: 'Step 2', formConfig: form2 }
   * ]);
   * ```
   */
  step(input: StepDefinition | StepDefinition[]): this {
    return this._addStepsInternal(input);
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
   *   analytics: {
   *     trackStepCompletion: true,
   *     trackFieldInteractions: false
   *   },
   *   persistence: {
   *     adapter: new LocalStorageAdapter(),
   *     options: { autoPersist: true, debounceMs: 1000 },
   *     userId: 'user123'
   *   }
   * });
   * ```
   */
  configure(options: WorkflowOptions): this {
    if (options.analytics) {
      this.analytics = options.analytics;
    }

    if (options.persistence) {
      this.persistenceConfig = options.persistence;
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
   * Adds conditions to a specific step by ID
   *
   * This method allows adding conditional behavior to a step after it has been created,
   * useful for dynamic conditional requirements.
   *
   * @param stepId - The ID of the step to add conditions to
   * @param conditions - Conditional behavior configuration
   * @returns The flow instance for method chaining
   * @throws Error if the step with the specified ID is not found
   *
   * @example
   * ```typescript
   * workflow.addStepConditions('payment-step', {
   *   visible: when('hasPayment').equals(true).build(),
   *   skippable: when('balance').equals(0).build()
   * });
   * ```
   */
  addStepConditions(stepId: string, conditions: StepConditionalBehavior): this {
    const stepIndex = this.steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step with ID "${stepId}" not found`);
    }

    const updatedConditions: StepConditionalBehavior = {
      ...this.steps[stepIndex].conditions,
      ...conditions,
    };

    this.steps[stepIndex] = { ...this.steps[stepIndex], conditions: updatedConditions };
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
      newWorkflowName || this.workflowName
    );
    cloned.steps = deepClone(this.steps);
    cloned.analytics = this.analytics ? deepClone(this.analytics) : undefined;
    cloned.persistenceConfig = this.persistenceConfig
      ? deepClone(this.persistenceConfig)
      : undefined;
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
    const errors: string[] = [];

    if (this.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check for duplicate step IDs using shared utility
    const stepIds = this.steps.map((step) => step.id);
    try {
      ensureUnique(stepIds, 'step');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
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
    const totalFields = this.steps.reduce(
      (total, step) => total + step.formConfig.allFields.length,
      0
    );
    const fieldCounts = this.steps.map((step) => step.formConfig.allFields.length);

    return {
      totalSteps: this.steps.length,
      totalFields,
      averageFieldsPerStep: this.steps.length > 0 ? totalFields / this.steps.length : 0,
      maxFieldsInStep: fieldCounts.length > 0 ? Math.max(...fieldCounts) : 0,
      minFieldsInStep: fieldCounts.length > 0 ? Math.min(...fieldCounts) : 0,
      hasAnalytics: Boolean(this.analytics),
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
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      throw new Error(`Workflow validation failed: ${validationErrors.join(', ')}`);
    }

    const finalConfig: WorkflowConfig = {
      id: this.workflowId,
      name: this.workflowName,
      description: this.workflowDescription,
      steps: this.steps,
      analytics: this.analytics,
      persistence: this.persistenceConfig,
      plugins: this.plugins,
      renderConfig: this.config.getWorkflowRenderConfig(),
    };

    return finalConfig;
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
      analytics: this.analytics,
      persistence: this.persistenceConfig,
      plugins: this.plugins.map((plugin) => ({ name: plugin.name, version: plugin.version })),
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
    this.workflowId = json.workflowId;
    this.workflowName = json.workflowName;
    this.workflowDescription = json.workflowDescription;
    this.steps = json.steps;
    this.analytics = json.analytics;
    this.persistenceConfig = json.persistence;
    this.plugins = json.plugins || [];
    return this;
  }
}
