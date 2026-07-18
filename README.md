# RilayKit

[![npm version](https://badge.fury.io/js/@rilaykit%2Fcore.svg)](https://badge.fury.io/js/@rilaykit%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

**A schema-first, headless form library for React — type-safe builders, universal validation, a real workflow engine, and agent-ready UI tools.**

[Documentation](https://rilay.dev) | [Quick Start](https://rilay.dev/quickstart) | [Examples](https://rilay.dev/examples)

## Why RilayKit

RilayKit treats forms as **data structures**, not JSX trees. You describe what a form contains; the library handles state, validation, conditions, and rendering orchestration. Your components stay in your design system — RilayKit generates zero HTML and zero CSS.

- **Schema-first** — forms are declarative, serializable, introspectable
- **Headless** — bring your own components and styling
- **Type-safe** — component prop types propagate through the builder chain
- **Universal validation** — Standard Schema compatible (Zod, Valibot, ArkType), no adapters
- **Workflow engine** — multi-step flows with guards, persistence, analytics, plugins
- **Agent-ready** — expose forms and flows as LLM tools (AI SDK, Anthropic adapters)

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`rilaykit`](./packages/rilaykit) | ![npm](https://img.shields.io/npm/v/rilaykit) | **All-in-one** — enhanced `ril.form()` / `ril.flow()` API |
| [`@rilaykit/core`](./packages/core) | ![npm](https://img.shields.io/npm/v/@rilaykit/core) | Unified catalog, types, validation, conditions, monitoring |
| [`@rilaykit/forms`](./packages/forms) | ![npm](https://img.shields.io/npm/v/@rilaykit/forms) | Form builder and headless React components |
| [`@rilaykit/workflow`](./packages/workflow) | ![npm](https://img.shields.io/npm/v/@rilaykit/workflow) | Multi-step workflows with persistence, analytics, plugins |
| [`@rilaykit/agent`](./packages/agent) | ![npm](https://img.shields.io/npm/v/@rilaykit/agent) | LLM tooling — `manifest`, `uiTools`, AI SDK and Anthropic adapters |

All packages are MIT licensed. Package mains are React-free (server/RSC-safe); components and hooks live on the `/react` subpath (`rilaykit/react`, `@rilaykit/forms/react`, …).

## Installation

```bash
# All-in-one (recommended)
pnpm add rilaykit

# Or individual packages
pnpm add @rilaykit/core @rilaykit/forms                      # forms only
pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow   # + multi-step flows
```

**Requirements:** React >= 18, TypeScript >= 5

## Quick Start

### 1. Register Your Components

```tsx
import { ril } from '@rilaykit/core';
import type { ComponentRenderContext } from '@rilaykit/core';
import { z } from 'zod';

const inputProps = z.object({
  label: z.string(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
});
type InputProps = z.infer<typeof inputProps>;

function Input({ id, props, field }: ComponentRenderContext<InputProps>) {
  return (
    <div>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type={props.type || 'text'}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.[0] && <p>{field.error[0].message}</p>}
    </div>
  );
}

const rilay = ril.create()
  .component('input', { propsSchema: inputProps, renderer: Input });
```

### 2. Build a Form

```tsx
import { form } from '@rilaykit/forms';
import { required, email } from '@rilaykit/core';

const loginForm = form
  .create(rilay, 'login')
  .add({
    id: 'email',
    type: 'input',
    props: { label: 'Email', type: 'email' },
    validation: { validate: [required(), email()] },
  })
  .add({
    id: 'password',
    type: 'input',
    props: { label: 'Password', type: 'password' },
    validation: { validate: [required()] },
  });
```

Validation timing is form-level: `.setValidation({ mode: 'onTouched', reValidateMode: 'onChange' })` — `mode` decides when a field first validates (default `'onTouched'`), `reValidateMode` how it re-validates once errored (default `'onChange'`).

### 3. Render It

```tsx
import { Form } from '@rilaykit/forms/react';

function LoginForm() {
  const handleSubmit = (data: Record<string, unknown>) => {
    login(data);
  };

  return (
    <Form of={loginForm} onSubmit={handleSubmit}>
      <Form.Field id="email" />
      <Form.Field id="password" />
      <Form.Submit>Sign In</Form.Submit>
    </Form>
  );
}
```

`Form.Body` and `Form.Submit` also accept render props for full markup control.

## All-in-One Package

The [`rilaykit`](./packages/rilaykit) package re-exports everything and provides an enhanced `ril` with `.form()` and `.flow()` methods — no separate builder imports:

```tsx
import { ril, required, email } from 'rilaykit';

const rilay = ril.create()
  .component('input', { propsSchema: inputProps, renderer: Input });

const loginForm = rilay
  .form('login')
  .add({
    id: 'email',
    type: 'input',
    props: { label: 'Email' },
    validation: { validate: [required(), email()] },
  });
```

## Key Features

### Universal Validation

Mix built-in validators, Zod, Valibot, or any Standard Schema library — no adapters.

```tsx
import { required, custom } from '@rilaykit/core';
import { z } from 'zod';

validation: {
  validate: [
    required(),
    z.string().email(),
    custom((value) => value.endsWith('@company.com'), 'Must be a company email'),
  ],
}
```

### Declarative Conditions

```tsx
import { when } from '@rilaykit/core';

conditions: {
  visible: when('accountType').equals('business'),
  required: when('revenue').greaterThan(100000),
}
```

### Server-Driven Forms

`compileForm` takes a data-only JSON payload (no functions — exactly what a backend emits) and returns a live `FormConfiguration` plus its default values.

```tsx
import { custom } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import type { Bindings, FormSchema } from '@rilaykit/forms';
import { Form } from '@rilaykit/forms/react';

const schema: FormSchema = await fetch('/api/forms/onboarding').then(r => r.json());

// Bindings resolve the schema's string references to real functions
const bindings: Bindings = {
  validators: { postalCode: (params, msg) => custom(v => /^\d{5}$/.test(String(v)), msg) },
  effects: { loadCities: async (country, { setValue, setProps }) => { /* ... */ } },
};

const { formConfig, defaultValues } = compileForm(schema, rilConfig, { bindings });

<Form of={formConfig} defaults={defaultValues} onSubmit={handleSubmit}>
  <Form.Body />
  <Form.Submit>Send</Form.Submit>
</Form>
```

Field-level `validation.rules` names built-in validators (`"required"`, `"email"`, …) or a key from `bindings.validators`; form-level `validation` sets `{ mode, reValidateMode, rules }`.

```json
{
  "version": 1,
  "id": "onboarding",
  "validation": { "mode": "onTouched", "reValidateMode": "onChange" },
  "fields": [
    {
      "id": "email",
      "type": "text",
      "props": { "label": "Work email" },
      "validation": { "rules": ["required", "email"] }
    },
    { "id": "postalCode", "type": "text", "default": "", "validation": { "rules": [{ "type": "postalCode", "message": "5 digits" }] } }
  ]
}
```

Pass `{ validateProps: true }` to also check each field's `props` against its component's `propsSchema`. Failures arrive as a `SchemaValidationError` whose `issues[]` name the exact path to fix — the self-correction hook for agent-authored schemas.

> `fromSchema` remains as a deprecated alias for `compileForm`, and `SchemaRegistry` for `Bindings`.

### Server-Driven Workflows

`compileFlow` compiles a whole multi-step flow: each step's `form` goes through `compileForm`, and the compiled defaults come back namespaced by step id — the shape `<Flow defaults>` consumes.

```tsx
import { compileFlow } from '@rilaykit/workflow';
import type { FlowBindings, FlowSchema } from '@rilaykit/workflow';
import { Flow } from '@rilaykit/workflow/react';

const schema: FlowSchema = await fetch('/api/flows/subscription').then(r => r.json());

const bindings: FlowBindings = {
  // Runs after a step validates. `prefill` is a derivation: it re-runs and
  // overwrites on every forward transition — guard on the value for seed-if-empty.
  after: { prefillBilling: (step) => step.next.prefill({ billingEmail: step.data.email }) },
  // Decides whether a step may be skipped, from the data collected so far
  allowSkip: { freePlan: ({ allData }) => allData.account?.plan === 'free' },
};

const { workflowConfig, defaultValues } = compileFlow(schema, rilConfig, { bindings });

<Flow of={workflowConfig} defaults={defaultValues} onComplete={handleComplete}>
  <Flow.Body />
  <Flow.Back>Back</Flow.Back>
  <Flow.Next>Next</Flow.Next>
</Flow>
```

`onComplete(data, meta)` receives data namespaced by step id — only answered visible steps appear (a skipped step is absent, not `{}`) — plus `meta: { visitedSteps, skippedSteps, passedSteps }`.

### Multi-Step Workflows

```tsx
import { flow, LocalStorageAdapter } from '@rilaykit/workflow';

const onboarding = flow
  .create(rilay, 'onboarding', 'User Onboarding')
  .step({ id: 'account', title: 'Create Account', formConfig: accountForm })
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
      onStepComplete: (stepId, duration) => trackEvent('step_complete', { stepId, duration }),
      onWorkflowComplete: (id, totalTime) => trackEvent('workflow_complete', { id, totalTime }),
    },
  });
```

```tsx
import { Flow } from '@rilaykit/workflow/react';

function OnboardingFlow() {
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

### Agent Tools

Expose your catalog to an LLM: `manifest(catalog)` produces Markdown for the system prompt, `uiTools()` registers the `show_form` / `show_flow` / `show_component` tools, and the adapters emit provider-native tool definitions with no casts.

```tsx
import { manifest } from 'rilaykit';                 // system prompt (server-safe)
import { tools, toParts } from 'rilaykit/ai-sdk';    // or 'rilaykit/anthropic'
import { Catalog, Parts } from 'rilaykit/react';     // human-in-the-loop rendering

// Server: give the model the catalog and the UI tools
const result = streamText({ model, system: manifest(rilay), tools: tools(rilay) });

// Client: render tool calls as live RilayKit forms/flows
<Catalog value={rilay}>
  <Parts parts={toParts(message)} onResolve={(toolCallId, output) => sendToolResult(toolCallId, output)} />
</Catalog>
```

`show_form` resolves `{ status: 'submitted', values }` or `{ status: 'cancelled' }` exactly once per tool call. Register a `.part('text', …)` renderer — there is no default text renderer.

## Architecture

```
@rilaykit/core          Unified catalog, types, validation, conditions, monitoring
    ↑
@rilaykit/forms         Form builder, React components, Zustand store
    ↑
@rilaykit/workflow      Flow builder, navigation, persistence, analytics, plugins
    ↑
@rilaykit/agent         Manifest, UI tools, AI SDK / Anthropic adapters
```

Builders and catalogs have no React dependency — they run in Node, tests, and React Server Components. The rendering layer is entirely your code.

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Installation](https://rilay.dev/getting-started/installation)
- [Quick Start](https://rilay.dev/quickstart)
- [Core Concepts](https://rilay.dev/core-concepts/philosophy)
- [Forms](https://rilay.dev/forms/building-forms)
- [Workflows](https://rilay.dev/workflow/building-workflows)
- [Validation](https://rilay.dev/core-concepts/validation)
- [API Reference](https://rilay.dev/api)

## Contributing

Contributions are welcome — see the [contributing guide](./CONTRIBUTING.md).

## Support

- [Documentation](https://rilay.dev)
- [GitHub Issues](https://github.com/andyoucreate/rilay/issues)
- [Email](mailto:contact@andyoucreate.com)

## License

MIT — see [LICENSE](./LICENSE.md) for details.
