# @rilaykit/workflow

The multi-step workflow engine for [RilayKit](https://rilay.dev): step navigation with validation guards, persistence to any storage backend, analytics, cross-step conditions, and plugins. Builds on `@rilaykit/forms`.

## Installation

```bash
pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow
```

> `@rilaykit/core` and `@rilaykit/forms` are required peer dependencies. React >= 18.

The main entry is React-free (server-safe); import components and hooks from `@rilaykit/workflow/react`.

## Quick Start

### 1. Define Step Forms

```tsx
import { required, email, minLength } from '@rilaykit/core';
import { form } from '@rilaykit/forms';

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

const onboarding = flow
  .create(rilay, 'onboarding', 'User Onboarding') // id and name optional
  .step({ id: 'account', title: 'Create Account', formConfig: accountForm })
  .step({ id: 'profile', title: 'Your Profile', formConfig: profileForm, allowSkip: true })
  .build();
```

### 3. Render It

```tsx
import { Flow } from '@rilaykit/workflow/react';
import type { WorkflowCompletionMeta } from '@rilaykit/workflow/react';

function OnboardingFlow() {
  const handleComplete = (data: Record<string, unknown>, meta: WorkflowCompletionMeta) => {
    // data holds ONLY answered visible steps — skipped or hidden steps are absent
    // meta = { visitedSteps, skippedSteps, passedSteps }
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

## Features

### Step Navigation

Users can't advance until the current step validates. Steps are skippable with `allowSkip: true`, or a predicate over accumulated flow data:

```tsx
.step({
  id: 'profile',
  title: 'Your Profile',
  formConfig: profileForm,
  allowSkip: ({ allData }) => allData.account?.plan === 'free',
})
```

### Cross-Step Conditions

`when('stepId.fieldId')` references fields from other steps:

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

`after` runs once a step validates. `step.next.prefill(fields)` writes into the next VISIBLE step — a conditionally hidden step in between never swallows the prefill:

```tsx
.step({
  id: 'account',
  title: 'Account',
  formConfig: accountForm,
  after: (step) => {
    step.next.prefill({ email: step.data.email });
  },
})
```

### Persistence

Auto-save to any backend through an adapter. Ships with `LocalStorageAdapter`:

```tsx
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

Field values survive save→load byte-faithfully (`Date`, `NaN`, `±Infinity`, `-0`, `BigInt` are tag-encoded). A pending debounced save is flushed on unmount; completion clears persisted data; corrupted blobs degrade to a fresh start and surface `LOAD_FAILED` on `persistenceError`.

**Custom adapter interface:**

```tsx
interface WorkflowPersistenceAdapter {
  save(key: string, data: PersistedWorkflowData): Promise<void>;
  load(key: string): Promise<PersistedWorkflowData | null>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  listKeys?(): Promise<string[]>;
  clear?(): Promise<void>;
}
```

### Analytics

```tsx
.configure({
  analytics: {
    onStepComplete: (stepId, duration, data, context) => { ... },
    onStepSkip: (stepId, reason, context) => { ... },
    onWorkflowComplete: (workflowId, duration, data) => { ... },
    onError: (error, context) => { ... },
  },
})
```

Every workflow error path routes through `onError` — step-transition failures, `onAfterValidation` throws, submission throws, persistence failures. A validation error blocking Next is not an error path. The last step fires no `onStepComplete`; completion is carried by `onWorkflowComplete` with the same projected data as `onComplete`.

### Plugin System

Encapsulate reusable cross-cutting behavior:

```tsx
const loggingPlugin = {
  name: 'logging',
  install: (workflow) => {
    // extend the builder — e.g. add analytics, wrap steps
  },
};

flow.create(rilay, 'checkout', 'Checkout').use(loggingPlugin);
```

### Headless React Components

All from `@rilaykit/workflow/react`:

| Component | Description |
|-----------|-------------|
| `<Flow of defaults onComplete>` | Root — accepts a builder or a built configuration, manages context and state |
| `<Flow.Body>` | Renders the current step's form — custom `step.renderer` takes precedence, render prop `{ step }` supported |
| `<Flow.Progress>` | Progress over VISIBLE steps — bare default or a `{ steps, currentIndex, goTo }` render prop |
| `<Flow.Next>` | Validates then advances (submits the flow on the last step) — render prop `{ go, canGo, submitting, isLastStep, step }` |
| `<Flow.Back>` | Go back to previous step (disabled on the first step) |
| `<Flow.Skip>` | Skip the current step without validating — hidden while the step is not skippable |
| `<WorkflowProvider>` | Context provider (used separately when needed) |

Bare defaults ship styleable data attributes: `[data-flow-progress]` (+ `data-active` per step) and `[data-flow-nav="next|back|skip"]`. Every compound piece accepts a render prop for full markup control:

```tsx
<Flow.Next>
  {({ go, canGo, isLastStep }) => (
    <button type="button" disabled={!canGo} onClick={go}>
      {isLastStep ? 'Finish' : 'Continue'}
    </button>
  )}
</Flow.Next>
```

### Server-Driven Workflows

`compileFlow` turns a data-only JSON `FlowSchema` into a live `WorkflowConfig` — the whole flow, backend-authored, no frontend redeployment. Each step's `form` compiles through `compileForm`, so everything the form schema supports works per step.

```tsx
import { custom } from '@rilaykit/core';
import { compileFlow } from '@rilaykit/workflow';
import type { FlowBindings, FlowSchema } from '@rilaykit/workflow';
import { Flow } from '@rilaykit/workflow/react';

const schema: FlowSchema = await fetch('/api/flows/subscription').then(r => r.json());

const bindings: FlowBindings = {
  // Runs after a step validates — e.g. prefill the next step from this one
  after: { prefillBilling: (step) => step.next.prefill({ billingEmail: step.data.email }) },
  // Decides whether a step may be skipped, from the data collected so far
  allowSkip: { freePlan: ({ allData }) => allData.account?.plan === 'free' },
  // Per-step form bindings resolve exactly as in compileForm
  validators: { postalCode: (params, msg) => custom(v => /^\d{5}$/.test(String(v)), msg) },
  effects: { loadCities: async (country, ctx) => { /* ... */ } },
};

const { workflowConfig, defaultValues } = compileFlow(schema, rilConfig, { bindings });

<Flow of={workflowConfig} defaults={defaultValues} onComplete={handleComplete}>
  <Flow.Body />
  <Flow.Back>Back</Flow.Back>
  <Flow.Next>Next</Flow.Next>
</Flow>
```

```json
{
  "version": 1,
  "id": "subscription",
  "name": "Subscription",
  "steps": [
    {
      "id": "account",
      "title": "Account",
      "onAfterValidation": "prefillBilling",
      "form": {
        "version": 1,
        "id": "account",
        "fields": [{ "id": "email", "type": "text", "validation": { "rules": ["required", "email"] } }]
      }
    },
    {
      "id": "billing",
      "title": "Billing",
      "allowSkip": { "binding": "freePlan" },
      "form": { "version": 1, "id": "billing", "fields": [{ "id": "vat", "type": "text" }] }
    }
  ]
}
```

`WorkflowConfig` has no defaults slot, so compiled defaults come back out of band, already namespaced by step id (`{ account: { ... } }`) — the shape `<Flow defaults>` consumes, and the shape `onComplete` returns.

An invalid schema throws `SchemaValidationError` with `documentKind: 'flow'`; its `issues[]` name a JSON path into the flow (`steps[0].form.fields[1].type`), including unresolved binding references.

### Hooks

From `@rilaykit/workflow/react`:

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
