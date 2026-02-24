# @rilaykit/workflow

The multi-step workflow engine for [RilayKit](https://rilay.dev) — build complex, production-ready wizard flows with navigation, persistence, analytics, and plugins.

`@rilaykit/workflow` extends `@rilaykit/forms` with a real workflow engine: step navigation with guards, auto-persistence to any storage backend, analytics tracking, cross-step conditions, and a plugin system for reusable behavior.

## Installation

```bash
# pnpm (recommended)
pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow

# npm
npm install @rilaykit/core @rilaykit/forms @rilaykit/workflow

# yarn
yarn add @rilaykit/core @rilaykit/forms @rilaykit/workflow

# bun
bun add @rilaykit/core @rilaykit/forms @rilaykit/workflow
```

> `@rilaykit/core` and `@rilaykit/forms` are required peer dependencies.

### Requirements

- React >= 18
- React DOM >= 18

## Quick Start

### 1. Define Step Forms

```tsx
import { required, email, minLength } from '@rilaykit/core';

const accountForm = form.create(rilay, 'account')
  .add({
    id: 'email',
    type: 'input',
    props: { label: 'Email' },
    validation: { validate: [required(), email()] },
  })
  .add({
    id: 'password',
    type: 'input',
    props: { label: 'Password', type: 'password' },
    validation: { validate: [required(), minLength(8)] },
  });

const profileForm = form.create(rilay, 'profile')
  .add(
    { id: 'firstName', type: 'input', props: { label: 'First Name' } },
    { id: 'lastName', type: 'input', props: { label: 'Last Name' } },
  );
```

### 2. Build the Workflow

```tsx
import { LocalStorageAdapter } from '@rilaykit/workflow';

const onboarding = rilay
  .flow('onboarding', 'User Onboarding')
  .addStep({
    id: 'account',
    title: 'Create Account',
    formConfig: accountForm,
  })
  .addStep({
    id: 'profile',
    title: 'Your Profile',
    formConfig: profileForm,
    allowSkip: true,
  })
  .configure({
    persistence: {
      adapter: new LocalStorageAdapter({ maxAge: 7 * 24 * 60 * 60 * 1000 }),
      options: { autoPersist: true, debounceMs: 500 },
    },
    analytics: {
      onStepComplete: (stepId, duration) => {
        trackEvent('step_complete', { stepId, duration });
      },
      onWorkflowComplete: (id, totalTime) => {
        trackEvent('workflow_complete', { id, totalTime });
      },
    },
  });
```

### 3. Render It

```tsx
import {
  Workflow,
  WorkflowBody,
  WorkflowStepper,
  WorkflowNextButton,
  WorkflowPreviousButton,
} from '@rilaykit/workflow';

function OnboardingFlow() {
  const handleComplete = (data: Record<string, unknown>) => {
    console.log('Workflow complete:', data);
  };

  return (
    <Workflow workflowConfig={onboarding} onComplete={handleComplete}>
      <WorkflowStepper />
      <WorkflowBody />
      <div>
        <WorkflowPreviousButton />
        <WorkflowNextButton />
      </div>
    </Workflow>
  );
}
```

## Features

### Fluent Workflow Builder

Chainable API for defining multi-step flows with step-level configuration.

```tsx
const flow = rilay
  .flow('checkout', 'Checkout Flow')
  .addStep({ id: 'cart', title: 'Review Cart', formConfig: cartForm })
  .addStep({ id: 'shipping', title: 'Shipping', formConfig: shippingForm })
  .addStep({ id: 'payment', title: 'Payment', formConfig: paymentForm })
  .configure({ persistence: { ... }, analytics: { ... } })
  .use(myPlugin);
```

### Step Navigation

Navigation with validation guards — users can't advance until the current step validates. Steps can be optional with `allowSkip: true`.

```tsx
.addStep({
  id: 'profile',
  title: 'Your Profile',
  formConfig: profileForm,
  allowSkip: true,
})
```

### Cross-Step Conditions

Use `when('stepId.fieldId')` to reference fields from other steps. Steps can be conditionally visible or skippable.

```tsx
import { when } from '@rilaykit/core';

.addStep({
  id: 'business-details',
  title: 'Business Details',
  formConfig: businessForm,
  conditions: {
    visible: when('account.accountType').equals('business'),
  },
})
```

### Pre-fill Next Steps

Use `onAfterValidation` to pre-populate fields in upcoming steps based on current step data.

```tsx
.addStep({
  id: 'account',
  title: 'Account',
  formConfig: accountForm,
  onAfterValidation: (stepData, helper) => {
    helper.setNextStepValue('profile', 'email', stepData.email);
  },
})
```

### Persistence

Auto-save workflow state to any storage backend through an adapter interface. Ships with `LocalStorageAdapter`, and you can implement your own for Supabase, your API, or any backend.

```tsx
import { LocalStorageAdapter } from '@rilaykit/workflow';

.configure({
  persistence: {
    adapter: new LocalStorageAdapter({
      prefix: 'rilay-',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    }),
    options: {
      autoPersist: true,
      debounceMs: 500,
      storageKey: 'onboarding-v1',
    },
  },
})
```

**Custom adapter interface:**

```tsx
interface WorkflowPersistenceAdapter {
  save(key: string, data: unknown): Promise<void>;
  load(key: string): Promise<unknown | null>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  listKeys?(): Promise<string[]>;
  clear?(): Promise<void>;
}
```

### Analytics

Track step completions, drop-offs, time per step, and errors with callback hooks.

```tsx
.configure({
  analytics: {
    onStepComplete: (stepId, duration) => { ... },
    onStepSkip: (stepId) => { ... },
    onWorkflowComplete: (id, totalTime) => { ... },
    onError: (stepId, error) => { ... },
  },
})
```

### Plugin System

Encapsulate reusable cross-cutting behavior with plugins. Plugins support dependency declaration.

```tsx
const loggingPlugin = {
  name: 'logging',
  onStepEnter: (stepId) => console.log(`Entering ${stepId}`),
  onStepLeave: (stepId) => console.log(`Leaving ${stepId}`),
};

const flow = rilay
  .flow('checkout', 'Checkout')
  .use(loggingPlugin);
```

### Headless React Components

| Component | Description |
|-----------|-------------|
| `<Workflow>` | Main wrapper — manages context and state |
| `<WorkflowProvider>` | Context provider (used separately when needed) |
| `<WorkflowBody>` | Renders the current step's form |
| `<WorkflowStepper>` | Progress indicator / step navigation |
| `<WorkflowNextButton>` | Advance to next step (or submit on last step) |
| `<WorkflowPreviousButton>` | Go back to previous step |
| `<WorkflowSkipButton>` | Skip the current step |

### Hooks

| Hook | Description |
|------|-------------|
| `useWorkflowContext()` | Full workflow context |
| `useWorkflowState()` | Current workflow state |
| `useWorkflowNavigation()` | Navigation actions (next, previous, goTo) |
| `useWorkflowConditions()` | Evaluated step conditions |
| `useWorkflowSubmission()` | Submission state and handlers |
| `useWorkflowAnalytics()` | Analytics tracking |
| `useConditionEvaluation()` | Condition evaluation utilities |
| `usePersistence()` | Persistence state and actions |
| `useStepMetadata()` | Current step metadata |

## Architecture

```
@rilaykit/core          (registry, types, validation, conditions)
    ↑
@rilaykit/forms         (form builder + React components)
    ↑
@rilaykit/workflow      ← you are here
```

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Building Workflows](https://rilay.dev/workflow/building-workflows)
- [Rendering Workflows](https://rilay.dev/workflow/rendering-workflows)
- [Navigation](https://rilay.dev/workflow/navigation)
- [Persistence](https://rilay.dev/workflow/persistence)
- [Analytics](https://rilay.dev/workflow/analytics)
- [Plugins](https://rilay.dev/workflow/plugins)
- [Advanced Workflows](https://rilay.dev/workflow/advanced-workflows)
- [API Reference](https://rilay.dev/api)

## License

MIT — see [LICENSE](./LICENSE) for details.
