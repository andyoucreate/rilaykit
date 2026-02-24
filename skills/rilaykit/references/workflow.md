# @rilaykit/workflow Reference

## Table of Contents

- [Flow Builder](#flow-builder)
- [Builder Methods](#builder-methods)
- [Step Configuration](#step-configuration)
- [StepDataHelper](#stepdatahelper)
- [Components](#components)
- [Navigation](#navigation)
- [Workflow Hooks](#workflow-hooks)
- [Persistence](#persistence)
- [Analytics](#analytics)
- [Real-World Patterns](#real-world-patterns)

## Flow Builder

Create multi-step workflows with the fluent builder API.

```typescript
import { flow } from "@rilaykit/workflow";

// Create a workflow with ID, name, and optional description
const onboarding = flow
  .create(r, "onboarding", "User Onboarding", "Optional description")
  .addStep({ id: "step1", title: "Step 1", formConfig: form1 })
  .addStep({ id: "step2", title: "Step 2", formConfig: form2 })
  .configure({ analytics: myAnalytics })
  .build();

// Minimal workflow (ID and name only)
const simpleFlow = flow
  .create(r, "onboarding", "User Onboarding")
  .addStep({ id: "step1", title: "Step 1", formConfig: form1 })
  .build();
```

**Important**: Always call `.build()` on workflow configs before passing to `<Workflow>`.

## Builder Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.addStep(config)` | new builder | Add a single step |
| `.addStep([configs])` | new builder | Add multiple steps |
| `.updateStep(stepId, updates)` | new builder | Update step properties |
| `.addStepConditions(stepId, conds)` | new builder | Add conditions to step |
| `.removeStep(stepId)` | new builder | Remove a step |
| `.getStep(stepId)` | `StepConfig \| undefined` | Get step config |
| `.getSteps()` | `StepConfig[]` | Get all steps |
| `.clearSteps()` | new builder | Remove all steps |
| `.configure(config)` | new builder | Set analytics, persistence, plugins |
| `.use(plugin)` | new builder | Install a plugin |
| `.removePlugin(name)` | new builder | Remove a plugin |
| `.validate()` | `string[]` | Return validation errors |
| `.getStats()` | stats object | Workflow statistics |
| `.toJSON()` | serializable object | Serialize |
| `.fromJSON(json)` | new builder | Deserialize |
| `.clone(newId?, newName?)` | new builder | Deep copy |
| `.build()` | `WorkflowConfig` | Build final config (required) |

## Step Configuration

```typescript
interface StepDefinition {
  id: string;                           // Unique step identifier
  title: string;                        // Display title
  description?: string;                 // Optional description
  formConfig: FormBuilder | FormConfig; // Form for this step (auto-built if builder)
  allowSkip?: boolean;                  // Allow skipping this step
  requiredToComplete?: boolean;         // Must complete to finish workflow
  conditions?: {
    visible?: ConditionConfig;          // Show/hide step
    skippable?: ConditionConfig;        // Dynamic skip permission
  };
  metadata?: Record<string, any>;       // Custom data (icons, images, labels)
  onAfterValidation?: (                 // Hook after step validation passes
    stepData: Record<string, any>,
    helper: StepDataHelper,
    context: WorkflowContext,
  ) => Promise<void> | void;
}
```

## StepDataHelper

Available in `onAfterValidation` to read/write data across steps:

```typescript
.addStep({
  id: "siren",
  formConfig: sirenForm,
  onAfterValidation: async (stepData, helper, context) => {
    // Read data
    const allData = helper.getAllData();
    const steps = helper.getSteps();
    const prevData = helper.getStepData("previous-step");

    // Write to next step (pre-fill fields)
    helper.setNextStepField("company", "ACME Inc");
    helper.setNextStepFields({ company: "ACME", address: "123 Main" });

    // Write to any step by ID
    helper.setStepData("summary", { total: 1000 });
    helper.setStepFields("review", { summary: "Data collected" });
  },
})
```

### Common Use Case: API Fetch and Pre-fill

```typescript
onAfterValidation: async (values, helper) => {
  if (!values.siren) return;
  const company = await getCompanyDetails(values.siren.value);

  if (company.siren) {
    helper.setStepFields("companyCreatedAt", {
      createdAt: company.creationDate ? new Date(company.creationDate) : undefined,
    });
    helper.setStepFields("legalStructure", {
      legalForm: company.legalStatus,
    });
  }
},
```

## Components

### Workflow (root wrapper)

```typescript
import {
  Workflow,
  WorkflowBody,
  WorkflowStepper,
  WorkflowNextButton,
  WorkflowPreviousButton,
  WorkflowSkipButton,
} from "@rilaykit/workflow";

<Workflow
  workflowConfig={onboarding}              // Built config (must call .build())
  defaultValues={{ email: "user@test.com" }}
  defaultStep="preferences"                // Optional: start at specific step
  onStepChange={(from, to, ctx) => { ... }}
  onWorkflowComplete={async (data) => { ... }}
  className="max-w-2xl mx-auto"
>
  <WorkflowStepper className="mb-8" onStepClick={(index) => { ... }} />
  <WorkflowBody />
  <div className="flex justify-between mt-8">
    <WorkflowPreviousButton />
    <WorkflowSkipButton />
    <WorkflowNextButton>
      {(props) => props.isLastStep ? "Complete" : "Next"}
    </WorkflowNextButton>
  </div>
</Workflow>
```

### WorkflowBody

Renders the current step's form. Supports per-step custom content:

```typescript
// Auto-render current step
<WorkflowBody />

// Custom content for a specific step
<WorkflowBody stepId="cgu">
  <ScrollableCGU />
</WorkflowBody>
```

### WorkflowNextButton

```typescript
// Simple
<WorkflowNextButton>Next</WorkflowNextButton>

// Render function
<WorkflowNextButton className="mt-8" isSubmitting={isPending}>
  {(props) => props.isLastStep ? "Complete" : "Continue"}
</WorkflowNextButton>
```

### WorkflowStepper

Custom stepper using the configured `stepperRenderer`:

```typescript
// Uses the renderer from .configure({ stepperRenderer: ... })
<WorkflowStepper className="mb-8" />

// Example custom stepper renderer
export const StepperRenderer = ({ steps }: WorkflowStepperRendererProps) => {
  const { context: { passedSteps } } = useWorkflowContext();

  return (
    <div className="flex items-center gap-2">
      <Progress value={(passedSteps.size / steps.length) * 100} />
      <span>{passedSteps.size}/{steps.length}</span>
    </div>
  );
};
```

## Navigation

### useWorkflowContext

The primary hook for workflow interaction:

```typescript
import { useWorkflowContext } from "@rilaykit/workflow";

const {
  // Current step
  currentStep,                          // StepConfig of current step

  // Navigation (return Promise<boolean>)
  goNext,
  goPrevious,
  goToStep,
  skipStep,

  // Guards (return boolean)
  canGoNext,
  canGoPrevious,
  canGoToStep,
  canSkipCurrentStep,

  // Data mutation
  setValue,
  setStepData,

  // Full context
  context: {
    workflowId,
    currentStepIndex,
    allData,                            // All steps data
    stepData,                           // Current step data
    visitedSteps,                       // Set<string>
    passedSteps,                        // Set<string>
    isSubmitting,
    isTransitioning,
  },

  // Persistence
  isPersisting,
  persistenceError,
  persistNow,
  loadPersistedData,
  clearPersistedData,
  hasPersistedData,
} = useWorkflowContext();
```

### Data Structure in Workflows

Workflow data is **namespaced by step ID**:

```typescript
// When workflow completes, data looks like:
{
  "personal": { firstName: "John", lastName: "Doe" },
  "company": { name: "ACME", siren: "123456789" },
  "preferences": { notifications: true },
}

// Access in onWorkflowComplete:
onWorkflowComplete={async (data) => {
  const firstName = data.personal.firstName;
  const company = data.company.name;
}}
```

## Workflow Hooks

Granular hooks that only re-render when their specific slice changes.

### State Hooks

```typescript
import {
  useCurrentStepIndex,
  useWorkflowTransitioning,
  useWorkflowInitializing,
  useWorkflowSubmitting,
  useWorkflowAllData,
  useWorkflowStepData,
  useStepDataById,
  useVisitedSteps,
  usePassedSteps,
  useIsStepVisited,
  useIsStepPassed,
  useWorkflowNavigationState,
  useWorkflowSubmitState,
} from "@rilaykit/workflow";

const currentIndex = useCurrentStepIndex();         // number
const isTransitioning = useWorkflowTransitioning(); // boolean
const isSubmitting = useWorkflowSubmitting();        // boolean
const isInitializing = useWorkflowInitializing();    // boolean

const allData = useWorkflowAllData();                // Record<string, Record<string, any>>
const stepData = useWorkflowStepData();              // Current step data
const specificData = useStepDataById("step-id");     // Specific step data

const visited = useVisitedSteps();                   // Set<string>
const passed = usePassedSteps();                     // Set<string>
const isPassed = useIsStepPassed("step-id");         // boolean
const isVisited = useIsStepVisited("step-id");       // boolean

// Combined state hooks
const { currentStepIndex, isTransitioning, isSubmitting } = useWorkflowNavigationState();
const { isSubmitting, isTransitioning, isInitializing } = useWorkflowSubmitState();
```

### Actions Hook

```typescript
import { useWorkflowActions } from "@rilaykit/workflow";

const {
  setCurrentStep,
  setStepData,
  setAllData,
  setFieldValue,
  setSubmitting,
  setTransitioning,
  setInitializing,
  markStepVisited,
  markStepPassed,
  reset,
  loadPersistedState,
} = useWorkflowActions();
```

### Step Metadata Hook

```typescript
import { useStepMetadata } from "@rilaykit/workflow";

const metadata = useStepMetadata();
metadata.current;                                    // Current step's metadata
metadata.getByStepId("step-id");                    // Specific step's metadata
metadata.getCurrentValue<string>("submitLabel", "Next"); // With default
```

### Conditions Hook

```typescript
import { useWorkflowConditions } from "@rilaykit/workflow";

const conditions = useWorkflowConditions({ workflowConfig, workflowState, currentStep });
conditions.isStepVisible(0);                         // By index
conditions.isFieldVisible("fieldId");
```

## Persistence

### LocalStorageAdapter

```typescript
import { LocalStorageAdapter } from "@rilaykit/workflow";

const adapter = new LocalStorageAdapter({
  keyPrefix: "rilay_workflow_",         // Namespace isolation
  compress: false,                      // btoa/atob encoding when true
  maxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days TTL
});

// Configure in workflow
.configure({
  persistence: {
    adapter,
    options: { autoPersist: true, debounceMs: 500 },
    userId: "user-123",
  },
})
```

### Adapter Methods

```typescript
await adapter.save(key, data);
await adapter.load(key);               // null if expired/not found
await adapter.remove(key);
await adapter.exists(key);              // boolean
await adapter.listKeys();
await adapter.clear();
```

### Custom Adapter

```typescript
import type { WorkflowPersistenceAdapter, PersistedWorkflowData } from "@rilaykit/workflow";

class ApiAdapter implements WorkflowPersistenceAdapter {
  async save(key: string, data: PersistedWorkflowData): Promise<void> {
    await fetch(`/api/state/${key}`, { method: "PUT", body: JSON.stringify(data) });
  }
  async load(key: string): Promise<PersistedWorkflowData | null> {
    const res = await fetch(`/api/state/${key}`);
    return res.ok ? res.json() : null;
  }
  async remove(key: string): Promise<void> {
    await fetch(`/api/state/${key}`, { method: "DELETE" });
  }
  async exists(key: string): Promise<boolean> {
    const res = await fetch(`/api/state/${key}`, { method: "HEAD" });
    return res.ok;
  }
  async listKeys?(): Promise<string[]> { /* ... */ }
  async clear?(): Promise<void> { /* ... */ }
}
```

### Persistence in Components

```typescript
const {
  isPersisting,
  persistenceError,
  persistNow,
  loadPersistedData,
  clearPersistedData,
  hasPersistedData,
} = useWorkflowContext();
```

## Analytics

Configure analytics callbacks in `.configure()`:

```typescript
.configure({
  analytics: {
    onWorkflowStart: (id, context) => { ... },
    onStepStart: (stepId, data, context) => { ... },
    onStepComplete: (stepId, duration, data, context) => { ... },
    onWorkflowComplete: (id, duration, data) => { ... },
    onStepSkip: (stepId, reason, context) => { ... },
  },
})
```

### Real-World Analytics Adapter

```typescript
export function createFlowAnalytics(): WorkflowAnalytics {
  return {
    onStepStart: (stepId, data, context) => {
      trackFormStepView({
        form_title: getFormTitle(data),
        form_step_title: stepTitles[stepId] || stepId,
      });
    },
    onStepComplete: (stepId, duration, data, context) => {
      analytics.track("step_completed", {
        workflow_id: context.workflowId,
        step_id: stepId,
        step_index: context.currentStepIndex,
        duration_ms: duration,
      });
    },
  };
}
```

## Real-World Patterns

### Reusable step definitions

```typescript
import { form } from "@rilaykit/forms";

export const personalInfoStep = (t: TranslationFn, tCommon: TranslationFn): StepDefinition => ({
  id: "personalInfo",
  title: t("steps.personalInfo.title"),
  metadata: { submitLabel: "Get my quote" },
  formConfig: form.create(r, "personalInfo")
    .add({
      id: "civility",
      type: "toggle-group",
      props: {
        hideLabel: true,
        options: [
          { label: tCommon("male"), value: "male" },
          { label: tCommon("female"), value: "female" },
        ],
        autoSubmit: false,
      },
      validation: { validate: [required(tCommon("required"))] },
    })
    .add(
      {
        id: "firstName",
        type: "text",
        props: { placeholder: tCommon("firstNamePlaceholder") },
        validation: {
          validate: [required(tCommon("required")), pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/, tCommon("validation.invalidName"))],
        },
      },
      {
        id: "lastName",
        type: "text",
        props: { placeholder: tCommon("lastNamePlaceholder") },
        validation: {
          validate: [required(tCommon("required")), pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/, tCommon("validation.invalidName"))],
        },
      },
    )
    .add({
      id: "email",
      type: "text",
      validation: {
        debounceMs: 200,
        validate: [required(tCommon("required")), email(tCommon("validation.invalidEmail"))],
      },
    }),
});
```

### Conditional step addition

```typescript
const workflowConfig = useMemo(() => {
  let wf = flow.create(r, "quote", t("title"));

  wf = wf
    .addStep({ id: "products", formConfig: productsForm })
    .addStep({
      id: "company",
      formConfig: companyForm,
      conditions: { visible: when("products.requestedProducts").contains("provident") },
    });

  // Feature flag controlled step
  if (showCguStep) {
    wf = wf.addStep({ id: "cgu", title: "CGU", formConfig: cguForm });
  }

  // Only add personal info if user is not authenticated
  if (!hasExistingClient) {
    wf = wf.addStep(personalInfoStep(t, tCommon));
  }

  return wf.configure({ analytics: createFlowAnalytics() }).build();
}, [t, tCommon, showCguStep, hasExistingClient]);
```

### Animated step transitions with Framer Motion

```typescript
export function AnimatedStepArea() {
  const { currentStep } = useWorkflowContext();

  return (
    <motion.div
      key={currentStep?.id}
      layout
      initial={{ x: 24, opacity: 0.01 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{
        x: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.3, ease: "easeOut" },
      }}
      style={{ willChange: "opacity, transform" }}
    >
      <WorkflowBody />
      <WorkflowSkipButton />
      <WorkflowNextButton className="mt-8" />
    </motion.div>
  );
}
```

### Data transformation on submit

```typescript
onWorkflowComplete={async (data) => {
  // Workflow data is namespaced: data.stepId.fieldId
  const contactData = {
    firstName: data.personalInfo?.firstName,
    lastName: data.personalInfo?.lastName,
    email: data.personalInfo?.email,
    birthDate: data.birthDate?.birthDate,
    familySituation: data.familyStatus?.familySituation,
  };

  await createContact(contactData);
}}
```

### Dynamic workflow from external config

```typescript
import { flow } from "@rilaykit/workflow";
import { form } from "@rilaykit/forms";

const workflowConfig = useMemo(() => {
  let wf = flow.create(r, "dynamic", "Dynamic Flow");

  for (const section of sortedSections) {
    let sectionForm = form.create(r, section.key);

    for (const field of section.fields.filter((f) => !f.hidden)) {
      sectionForm = sectionForm.add({
        id: field.key,
        type: mapFieldType(field.type),
        props: { label: field.label, options: field.options },
        validation: { validate: createValidators(field) },
        conditions: field.showWhen ? { visible: createCondition(field.showWhen) } : undefined,
      });
    }

    wf = wf.addStep({ id: section.key, title: section.title, formConfig: sectionForm });
  }

  return wf.build();
}, [config]);
```
