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
import { flow } from '@rilaykit/workflow';
import { LocalStorageAdapter } from '@rilaykit/workflow';

// Option 1: With explicit ID and name
const onboarding = flow
  .create(rilay, 'onboarding', 'User Onboarding')
  .step({
    id: 'account',
    title: 'Create Account',
    formConfig: accountForm,
  })
  .step({
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
  })
  .build();

// Option 2: Auto-generated ID and default name
const quickWorkflow = flow
  .create(rilay) // ID and name are optional
  .step({ title: 'Step 1', formConfig: accountForm })
  .build();
```

### 3. Render It

```tsx
import { Flow } from '@rilaykit/workflow';

function OnboardingFlow() {
  const handleComplete = (data: Record<string, unknown>) => {
    saveOnboarding(data);
  };

  return (
    <Flow of={onboarding} onComplete={handleComplete}>
      <Flow.Progress />
      <Flow.Body />
      <div>
        <Flow.Back />
        <Flow.Skip />
        <Flow.Next />
      </div>
    </Flow>
  );
}
```

Every compound piece accepts a render prop for full markup control:

```tsx
<Flow.Progress>
  {({ steps, currentIndex, goTo }) =>
    steps.map((step, index) => (
      <button key={step.id} type="button" onClick={() => goTo(index)}
        aria-current={index === currentIndex}>
        {step.title}
      </button>
    ))
  }
</Flow.Progress>
<Flow.Next>
  {({ go, canGo, isLastStep }) => (
    <button type="button" disabled={!canGo} onClick={go}>
      {isLastStep ? 'Finish' : 'Continue'}
    </button>
  )}
</Flow.Next>
```

## Features

### Fluent Workflow Builder

Chainable API for defining multi-step flows with step-level configuration.

```tsx
import { flow } from '@rilaykit/workflow';

const checkoutFlow = flow
  .create(rilay, 'checkout', 'Checkout Flow')
  .step({ id: 'cart', title: 'Review Cart', formConfig: cartForm })
  .step({ id: 'shipping', title: 'Shipping', formConfig: shippingForm })
  .step({ id: 'payment', title: 'Payment', formConfig: paymentForm })
  .configure({ persistence: { ... }, analytics: { ... } })
  .use(myPlugin)
  .build();
```

### Step Navigation

Navigation with validation guards — users can't advance until the current step validates. Steps can be optional with `allowSkip: true`, or with a predicate over the accumulated flow data.

```tsx
.step({
  id: 'profile',
  title: 'Your Profile',
  formConfig: profileForm,
  allowSkip: ({ allData }) => allData.account?.plan === 'free',
})
```

### Cross-Step Conditions

Use `when('stepId.fieldId')` to reference fields from other steps. Steps can be conditionally visible or skippable.

```tsx
import { when } from '@rilaykit/core';

.step({
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
.step({
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
  onStepEnter: (stepId) => trackEvent('step_enter', { stepId }),
  onStepLeave: (stepId) => trackEvent('step_leave', { stepId }),
};

const flow = rilay
  .flow('checkout', 'Checkout')
  .use(loggingPlugin);
```

### Headless React Components

| Component | Description |
|-----------|-------------|
| `<Flow of defaults onComplete>` | Root — accepts a builder or a built configuration, manages context and state |
| `<Flow.Body>` | Renders the current step's form — custom `step.renderer` takes precedence, render prop `{ step }` supported |
| `<Flow.Progress>` | Progress over VISIBLE steps — bare default or a `{ steps, currentIndex, goTo }` render prop |
| `<Flow.Next>` | Validates then advances (submits the flow on the last step) — render prop `{ go, canGo, submitting, isLastStep, step }` |
| `<Flow.Back>` | Go back to previous step (disabled on the first step) |
| `<Flow.Skip>` | Skip the current step without validating — hidden while the step is not skippable |
| `<WorkflowProvider>` | Context provider (used separately when needed) |

Bare defaults ship styleable data attributes: `[data-flow-progress]` (+ `data-active` per step) and `[data-flow-nav="next|back|skip"]`.

### Hooks

| Hook | Description |
|------|-------------|
| `useFlow()` | Full flow context |
| `useStep()` | Current step — `{ step, index, metadata }` |
| `useFlowSteps()` | Visible steps — `{ steps, currentIndex, goTo }` |
| `useFlowData()` | Accumulated data across steps |
| `useFlowActions()` | Navigation and data actions |
| `useFlowStepIndex()` | Current step index |
| `useFlowNavigationState()` / `useFlowSubmitState()` | Granular state selectors |
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
