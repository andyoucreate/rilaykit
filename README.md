# RilayKit

[![npm version](https://badge.fury.io/js/@rilaykit%2Fcore.svg)](https://badge.fury.io/js/@rilaykit%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

**A schema-first, headless form library for React — with type-safe builders, universal validation, and a real workflow engine.**

[Documentation](https://rilay.dev) | [Quick Start](https://rilay.dev/quickstart) | [Examples](https://rilay.dev/examples)

## Why RilayKit

RilayKit treats forms as **data structures**, not JSX trees. You describe what a form contains, and the library handles state, validation, conditions, and rendering orchestration. Your components stay in your design system — RilayKit generates zero HTML and zero CSS.

- **Schema-first** — forms are declarative, serializable, introspectable, clonable
- **Headless** — bring your own components, styling, and design system
- **Type-safe** — generic type accumulation propagates component prop types through the entire builder chain
- **Universal validation** — Standard Schema compatible (Zod, Valibot, ArkType, Yup) with no adapters
- **Workflow engine** — multi-step flows with navigation guards, persistence, analytics, and plugins

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`rilaykit`](./packages/rilaykit) | ![npm](https://img.shields.io/npm/v/rilaykit) | **All-in-one** — single install with enhanced `ril.form()` / `ril.flow()` API |
| [`@rilaykit/core`](./packages/core) | ![npm](https://img.shields.io/npm/v/@rilaykit/core) | Unified catalog, types, validation, conditions, monitoring |
| [`@rilaykit/forms`](./packages/forms) | ![npm](https://img.shields.io/npm/v/@rilaykit/forms) | Form builder and headless React components |
| [`@rilaykit/workflow`](./packages/workflow) | ![npm](https://img.shields.io/npm/v/@rilaykit/workflow) | Multi-step workflows with persistence, analytics, plugins |

All packages are MIT licensed and open source.

## Installation

```bash
# All-in-one (recommended)
pnpm add rilaykit

# Or individual packages — Core + Forms
pnpm add @rilaykit/core @rilaykit/forms

# Or with multi-step workflows
pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow
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

### 3. Render It

```tsx
import { Form } from '@rilaykit/forms';

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

Need full markup control? `Form.Body` and `Form.Submit` accept render props:

```tsx
<Form of={loginForm} defaults={{ email: 'neo@matrix.io' }} onSubmit={handleSubmit}>
  <Form.Body>
    {({ rows }) =>
      rows.map((row) =>
        row.kind === 'fields' ? (
          <section key={row.id}>
            {row.fields.map((field) => <Form.Field key={field.id} id={field.id} />)}
          </section>
        ) : (
          <Form.List key={row.id} id={row.repeatable.id} />
        )
      )
    }
  </Form.Body>
  <Form.Submit>
    {({ submitting, submit }) => (
      <button type="button" disabled={submitting} onClick={submit}>Sign In</button>
    )}
  </Form.Submit>
</Form>
```

## All-in-One Package

The [`rilaykit`](./packages/rilaykit) package re-exports everything and provides an enhanced `ril` with `.form()` and `.flow()` methods — no separate builder imports needed:

```tsx
import { ril, required, email, Form } from 'rilaykit';

const rilay = ril.create()
  .component('input', { propsSchema: inputProps, renderer: Input });

// .form() and .flow() are available directly on the ril instance
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

Use built-in validators, Zod, Valibot, Yup, or any Standard Schema library — no adapters needed. Mix them freely.

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

Generate forms from JSON schemas — no frontend redeployment needed. `compileForm`
takes a data-only payload (no functions, no closures — exactly what a backend
emits) and returns a live `FormConfiguration` plus its default values.

```tsx
import { custom } from '@rilaykit/core';
import { Form, compileForm } from '@rilaykit/forms';
import type { Bindings, FormSchema } from '@rilaykit/forms';

// Backend sends the schema
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

The schema is plain JSON. `validation.rules` names built-in validators
(`"required"`, `"email"`, ...) or a key from `bindings.validators`; `effects`
name a key from `bindings.effects`; `conditions` and repeatable groups are
supported the same way as in the builder API.

```json
{
  "version": 1,
  "id": "onboarding",
  "fields": [
    {
      "id": "email",
      "type": "text",
      "props": { "label": "Work email" },
      "validation": { "rules": ["required", "email"], "validateOnBlur": true }
    },
    { "id": "postalCode", "type": "text", "default": "", "validation": { "rules": [{ "type": "postalCode", "message": "5 digits" }] } }
  ]
}
```

Pass `{ validateProps: true }` to additionally check every field's `props`
against its component's `propsSchema`. Failures arrive as a
`SchemaValidationError` whose `issues[]` name the exact path to fix — the
self-correction hook for agent-authored schemas. Props are checked, never
rewritten.

> `fromSchema` remains as a deprecated alias for `compileForm`, and `SchemaRegistry` for `Bindings`.

### Server-Driven Workflows

`compileFlow` does the same for a whole multi-step flow: each step's `form` is
compiled through `compileForm`, and the compiled defaults come back namespaced
by step id — the shape `<Flow defaults>` consumes.

```tsx
import { Flow, compileFlow } from '@rilaykit/workflow';
import type { FlowBindings, FlowSchema } from '@rilaykit/workflow';

const schema: FlowSchema = await fetch('/api/flows/subscription').then(r => r.json());

const bindings: FlowBindings = {
  // Runs after a step validates — e.g. prefill the next step from this one.
  // `prefill` is a DERIVATION: it re-runs on every forward transition and
  // overwrites, so a corrected email propagates to billing on Back→Next — and
  // a hand-edit of billingEmail does not survive one. Guard on the value
  // (`if (step.workflow.get('billing')?.billingEmail) return;`) for
  // seed-if-empty instead.
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

`onComplete` receives the collected data namespaced by step id:
`{ account: { email: '...' }, billing: { vat: '...' } }`.

### Multi-Step Workflows

```tsx
import { flow } from '@rilaykit/workflow';
import { LocalStorageAdapter } from '@rilaykit/workflow';

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
import { Flow } from '@rilaykit/workflow';

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

## Architecture

```
@rilaykit/core          Unified catalog, types, validation, conditions, monitoring
    ↑
@rilaykit/forms         Form builder, React components, Zustand store
    ↑
@rilaykit/workflow      Flow builder, navigation, persistence, analytics, plugins
```

The Catalog and Builder layers have no React dependency — they run in Node, tests, and build scripts. The rendering layer is entirely your code.

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Installation](https://rilay.dev/getting-started/installation)
- [Quick Start](https://rilay.dev/quickstart)
- [Core Concepts](https://rilay.dev/core-concepts/philosophy)
- [Forms](https://rilay.dev/forms/building-forms)
- [Workflows](https://rilay.dev/workflow/building-workflows)
- [Validation](https://rilay.dev/core-concepts/validation)
- [TypeScript Support](https://rilay.dev/core-concepts/typescript-support)
- [API Reference](https://rilay.dev/api)

## Contributing

Contributions are welcome! Please see our [contributing guide](./CONTRIBUTING.md) to get started.

## Support

- [Documentation](https://rilay.dev)
- [GitHub Issues](https://github.com/andyoucreate/rilay/issues)
- [Email](mailto:contact@andyoucreate.com)

## License

MIT — see [LICENSE](./LICENSE.md) for details.
