# rilaykit

The all-in-one package for [RilayKit](https://rilay.dev) - headless forms and multi-step workflows for React in a single import.

`rilaykit` re-exports everything from `@rilaykit/core`, `@rilaykit/forms`, and `@rilaykit/workflow`, and provides an enhanced `ril` instance with `.form()` and `.flow()` convenience methods. One install, one import, zero wiring.

## Installation

```bash
# pnpm (recommended)
pnpm add rilaykit

# npm
npm install rilaykit

# yarn
yarn add rilaykit

# bun
bun add rilaykit
```

### Requirements

- React >= 18
- React DOM >= 18
- TypeScript >= 5

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

> Notice `.form()` is called directly on the `ril` instance — no need to import `form` separately.

### 3. Render It

```tsx
import { Form } from 'rilaykit';

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

### 4. Add a Flow

```tsx
import { Flow, LocalStorageAdapter } from 'rilaykit';

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

### 5. Or Compile It from JSON

Both halves also compile from a data-only JSON payload, so a backend can author
the form — or the whole flow — with no frontend redeployment. `bindings` resolve
the schema's string references to real functions.

```tsx
import { Flow, Form, compileFlow, compileForm } from 'rilaykit';
import type { Bindings, FlowBindings, FlowSchema, FormSchema } from 'rilaykit';

const formSchema: FormSchema = await fetch('/api/forms/signin').then(r => r.json());
const bindings: Bindings = {
  validators: { postalCode: (params, msg) => custom(v => /^\d{5}$/.test(String(v)), msg) },
  effects: { loadCities: async (country, ctx) => { /* ... */ } },
};
const { formConfig, defaultValues } = compileForm(formSchema, rilay, { bindings });

<Form of={formConfig} defaults={defaultValues} onSubmit={handleSubmit}>
  <Form.Body />
  <Form.Submit>Sign In</Form.Submit>
</Form>;

// Same for a whole flow — each step's `form` compiles through compileForm, and
// the compiled defaults come back namespaced by step id.
const flowSchema: FlowSchema = await fetch('/api/flows/onboarding').then(r => r.json());
const flowBindings: FlowBindings = {
  ...bindings,
  after: { prefillBilling: (step) => step.next.prefill({ billingEmail: step.data.email }) },
  allowSkip: { freePlan: ({ allData }) => allData.account?.plan === 'free' },
};
const { workflowConfig, defaultValues: flowDefaults } = compileFlow(flowSchema, rilay, {
  bindings: flowBindings,
});

<Flow of={workflowConfig} defaults={flowDefaults} onComplete={handleComplete}>
  <Flow.Body />
  <Flow.Next />
</Flow>;
```

An invalid schema throws `SchemaValidationError`, whose `issues[]` carry a JSON
path and message, and whose `documentKind` says whether it was a `'form'` or a
`'flow'`. See the [forms](../forms/README.md) and
[workflow](../workflow/README.md) READMEs for the schema shape.

> `fromSchema` remains as a deprecated alias for `compileForm`, and `SchemaRegistry` for `Bindings`.

## Why the All-in-One Package?

| | `rilaykit` | Individual packages |
|---|---|---|
| Install | `pnpm add rilaykit` | `pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow` |
| Imports | `import { ril, Form, Flow } from 'rilaykit'` | Multiple import sources |
| API | `rilay.form()` / `rilay.flow()` | `form.create(rilay)` / `flow.create(rilay)` |
| Best for | New projects, prototyping, full-featured apps | Fine-grained control, minimal bundle |

If you only need forms (no workflows), prefer `@rilaykit/core` + `@rilaykit/forms` to keep your bundle smaller.

## Enhanced `ril` Instance

The `ril` exported from `rilaykit` extends the core `ril` with two convenience methods:

```tsx
import { ril } from 'rilaykit';

const rilay = ril.create()
  .component('input', { renderer: Input });

// Create a form directly from the ril instance
const myForm = rilay.form('my-form');

// Create a flow directly from the ril instance
const myFlow = rilay.flow('my-flow', 'My Workflow');
```

All other `ril` methods (`component`, `tool`, `part`, `use`, `renderers`, `getComponent`, `validateProps`, `clone`, etc.) work exactly the same.

## What's Included

Everything from all three packages:

- **From `@rilaykit/core`** — `ril` (unified catalog: `.component()` / `.tool()` / `.part()` / `.use()` / `.renderers()`), `when`, `onChange`, validators (`required`, `email`, `url`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `number`, `custom`, `async`, `combine`), typed errors (`RilayError` and subclasses), monitoring (`LocalStorageMonitoringAdapter` buffers monitoring events — distinct from workflow's `LocalStorageAdapter`, which persists flow state), condition utilities
- **From `@rilaykit/forms`** — `form`, compound `Form` (`Form.Body`, `Form.Field`, `Form.Submit`, `Form.List`), `FormProvider`, `useForm`, Zustand hooks (`useFieldValue`, `useFieldErrors`, `useFieldProps`, `useFormValues`, `useFormActions`, etc.), the schema layer (`compileForm`, `FormSchema`, `Bindings`, `SchemaValidationError`)
- **From `@rilaykit/workflow`** — `flow`, compound `Flow` (`Flow.Body`, `Flow.Progress`, `Flow.Next`, `Flow.Back`, `Flow.Skip`), `useFlow`, `useStep`, `useFlowSteps`, `useFlowData`, `LocalStorageAdapter`, persistence, analytics, plugin hooks, the schema layer (`compileFlow`, `FlowSchema`, `FlowBindings`, `validateFlowSchema`)

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Installation](https://rilay.dev/getting-started/installation)
- [Quick Start](https://rilay.dev/quickstart)
- [Forms](https://rilay.dev/forms/building-forms)
- [Workflows](https://rilay.dev/workflow/building-workflows)
- [Validation](https://rilay.dev/core-concepts/validation)
- [API Reference](https://rilay.dev/api)

## License

MIT — see [LICENSE](./LICENSE) for details.
