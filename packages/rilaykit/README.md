# rilaykit

The all-in-one package for [RilayKit](https://rilay.dev) — headless forms, multi-step workflows, and agent UI for React in a single install.

`rilaykit` re-exports `@rilaykit/core`, `@rilaykit/forms`, `@rilaykit/workflow`, and `@rilaykit/agent`, plus an enhanced `ril` instance with `.form()` and `.flow()` convenience methods. The main entry is isomorphic (safe in React Server Components); components and hooks live in `rilaykit/react`.

## Installation

```bash
pnpm add rilaykit   # or npm / yarn / bun
```

Requires React >= 18 and TypeScript >= 5.

## Quick Start

### 1. Register Your Components

```tsx
import { ril } from 'rilaykit';
import type { ComponentRenderContext } from 'rilaykit';
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
import { required, email } from 'rilaykit';

const loginForm = rilay
  .form('login')
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

Fields first validate on blur, then re-validate live as you type. Tune with `.setValidation({ mode, reValidateMode })` (`mode` defaults to `'onTouched'`, `reValidateMode` to `'onChange'`).

### 3. Render It

```tsx
import { Form } from 'rilaykit/react';

function LoginForm() {
  return (
    <Form of={loginForm} onSubmit={(data) => login(data)}>
      <Form.Field id="email" />
      <Form.Field id="password" />
      <Form.Submit>Sign In</Form.Submit>
    </Form>
  );
}
```

### 4. Add a Flow

```tsx
import { LocalStorageAdapter } from 'rilaykit';
import { Flow } from 'rilaykit/react';

const onboarding = rilay
  .flow('onboarding', 'User Onboarding')
  .step({ id: 'account', title: 'Create Account', formConfig: accountForm })
  .step({
    id: 'profile',
    title: 'Your Profile',
    formConfig: profileForm,
    allowSkip: ({ allData }) => allData.account?.plan === 'free',
  })
  .configure({
    persistence: {
      adapter: new LocalStorageAdapter({ maxAge: 7 * 24 * 60 * 60 * 1000 }),
      options: { autoPersist: true, debounceMs: 500 },
    },
  })
  .build();

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

`onComplete(data, meta)` receives only answered visible steps — a skipped or never-visible step is absent from `data` — and `meta` lists `visitedSteps`, `skippedSteps`, and `passedSteps`.

### 5. Or Compile It from JSON

Both halves compile from a data-only JSON payload, so a backend can author the form — or the whole flow — with no frontend redeploy. `bindings` resolve the schema's string references (custom validation rules, effects, `allowSkip` / `after` handlers) to real functions.

```tsx
import { compileFlow, compileForm } from 'rilaykit';
import { Flow, Form } from 'rilaykit/react';

const formSchema = await fetch('/api/forms/signin').then((r) => r.json());
const { formConfig, defaultValues } = compileForm(formSchema, rilay, { bindings });

<Form of={formConfig} defaults={defaultValues} onSubmit={handleSubmit}>
  <Form.Body />
  <Form.Submit>Sign In</Form.Submit>
</Form>;

// Whole flow: each step's form compiles through compileForm, and the compiled
// defaults come back namespaced by step id.
const { workflowConfig, defaultValues: flowDefaults } = compileFlow(flowSchema, rilay, {
  bindings: flowBindings,
});
```

An invalid schema throws `SchemaValidationError` — `issues[]` carry a JSON path and message, `documentKind` says `'form'` or `'flow'`. See the [forms](../forms/README.md) and [workflow](../workflow/README.md) READMEs for the schema shape. `fromSchema` and `SchemaRegistry` remain as deprecated aliases for `compileForm` and `Bindings`.

### 6. Let an Agent Drive It

The same catalog powers LLM tool use: `uiTools()` registers the `show_form` / `show_flow` / `show_component` tools, `manifest(catalog)` emits a Markdown catalog description for the system prompt, and adapters convert to provider formats — `rilaykit/ai-sdk` (Vercel AI SDK) and `rilaykit/anthropic`.

```tsx
import { manifest, uiTools } from 'rilaykit';
import { toParts, tools } from 'rilaykit/ai-sdk'; // or 'rilaykit/anthropic'
import { Catalog, Parts } from 'rilaykit/react';

const catalog = rilay.use(uiTools());

// Server: pass tools(catalog) and manifest(catalog) to your LLM call.
// Client: render each message and resolve tool calls through your components.
<Catalog value={catalog}>
  <Parts
    parts={toParts(message)}
    onResolve={(toolCallId, output) => sendToolResult(toolCallId, output)}
  />
</Catalog>;
```

## Why the All-in-One Package?

| | `rilaykit` | Individual packages |
|---|---|---|
| Install | `pnpm add rilaykit` | `pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow` |
| Imports | `rilaykit` + `rilaykit/react` | Multiple import sources |
| API | `rilay.form()` / `rilay.flow()` | `form.create(rilay)` / `flow.create(rilay)` |
| Best for | New projects, full-featured apps | Fine-grained control, minimal bundle |

If you only need forms, prefer `@rilaykit/core` + `@rilaykit/forms` for a smaller bundle.

## Enhanced `ril` Instance

The `ril` exported from `rilaykit` extends the core `ril` with `.form()` and `.flow()`:

```tsx
const myForm = rilay.form('my-form');
const myFlow = rilay.flow('my-flow', 'My Workflow');
```

All other `ril` methods (`component`, `tool`, `part`, `use`, `renderers`, `clone`, …) are unchanged.

## What's Included

- **`@rilaykit/core`** — `ril` (unified catalog: `.component()` / `.tool()` / `.part()` / `.use()` / `.renderers()`), `when`, `onChange`, validators (`required`, `email`, `min`, `max`, `pattern`, `custom`, `async`, `combine`, …), typed errors (`RilayError` and subclasses), monitoring adapters, condition utilities
- **`@rilaykit/forms`** — `form` builder and schema layer (`compileForm`, `FormSchema`, `Bindings`, `SchemaValidationError`); on `/react`: compound `Form` (`Form.Body`, `Form.Field`, `Form.Submit`, `Form.List`), store hooks (`useFieldValue`, `useFieldErrors`, `useFormErrors`, `useFormValues`, `useFormActions`, …)
- **`@rilaykit/workflow`** — `flow` builder, `LocalStorageAdapter`, analytics, schema layer (`compileFlow`, `FlowSchema`, `FlowBindings`, `validateFlowSchema`); on `/react`: compound `Flow` (`Flow.Body`, `Flow.Progress`, `Flow.Next`, `Flow.Back`, `Flow.Skip`), hooks (`useFlow`, `useStep`, `useFlowSteps`, `useFlowData`, …)
- **`@rilaykit/agent`** — `uiTools`, `manifest`, `parsePartialJson`, part types and guards; on `/react`: `Catalog`, `Part`, `Parts`, built-in tool renderers; provider adapters on `rilaykit/ai-sdk` and `rilaykit/anthropic`

Rule of thumb: components and hooks import from `rilaykit/react` (it carries the `'use client'` boundary); everything else from `rilaykit`.

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Installation](https://rilay.dev/getting-started/installation)
- [Quick Start](https://rilay.dev/quickstart)
- [Forms](https://rilay.dev/forms/building-forms)
- [Workflows](https://rilay.dev/workflow/building-workflows)
- [Validation](https://rilay.dev/core-concepts/validation)
- [API Reference](https://rilay.dev/api)

## License

MIT — see [LICENSE](./LICENSE).
