// Builders
export { WorkflowBuilder } from "./builders/WorkflowBuilder";

// Components
export { WorkflowNavigation } from "./components/WorkflowNavigation";
export {
  useWorkflowContext,
  WorkflowProvider
} from "./components/WorkflowProvider";
export { WorkflowStep } from "./components/WorkflowStep";
export { WorkflowStepper } from "./components/WorkflowStepper";

// Plugins
export {
  AnalyticsPlugin,
  createAnalyticsPlugin
} from "./plugins/AnalyticsPlugin";
export {
  createValidationPlugin,
  ValidationPlugin
} from "./plugins/ValidationPlugin";

// Plugin types
export type { AnalyticsPluginConfig } from "./plugins/AnalyticsPlugin";

export type { ValidationPluginConfig } from "./plugins/ValidationPlugin";

// Re-export core types for convenience
export type {
  ConditionalBranch,
  DynamicStepConfig,
  PersistenceStrategy,
  StepConfig,
  StepLifecycleHooks,
  StepPermissions,
  StepRenderer,
  WorkflowAnalytics,
  WorkflowConfig,
  WorkflowContext,
  WorkflowNavigationRenderer,
  WorkflowOptimizations,
  WorkflowPlugin,
  WorkflowRenderConfig,
  WorkflowStepperRenderer,
  WorkflowVersion
} from "@streamline/core";

// Component types
export type {
  WorkflowContextValue,
  WorkflowProviderProps,
  WorkflowState
} from "./components/WorkflowProvider";

export type { WorkflowStepProps } from "./components/WorkflowStep";

export type { WorkflowStepperProps } from "./components/WorkflowStepper";

export type { WorkflowNavigationProps } from "./components/WorkflowNavigation";
