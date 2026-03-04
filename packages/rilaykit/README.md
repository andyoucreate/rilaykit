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
import { ril, ComponentRenderer } from 'rilaykit';

interface InputProps {
  label: string;
  type?: string;
  placeholder?: string;
}

const Input: ComponentRenderer<InputProps> = ({
  id, value, onChange, onBlur, error, props,
}) => (
  <div>
    <label htmlFor={id}>{props.label}</label>
    <input
      id={id}
      type={props.type || 'text'}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
    />
    {error && <p>{error[0].message}</p>}
  </div>
);

const rilay = ril.create()
  .addComponent('input', { renderer: Input });
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
import { Form, FormField } from 'rilaykit';

function LoginForm() {
  const handleSubmit = (data: { email: string; password: string }) => {
    console.log('Login:', data);
  };

  return (
    <Form formConfig={loginForm} onSubmit={handleSubmit}>
      <FormField fieldId="email" />
      <FormField fieldId="password" />
      <button type="submit">Sign In</button>
    </Form>
  );
}
```

### 4. Add a Workflow

```tsx
import {
  Workflow, WorkflowBody, WorkflowStepper,
  WorkflowNextButton, WorkflowPreviousButton,
  LocalStorageAdapter,
} from 'rilaykit';

const onboarding = rilay
  .flow('onboarding', 'User Onboarding')
  .step({ id: 'account', title: 'Create Account', formConfig: accountForm })
  .step({ id: 'profile', title: 'Your Profile', formConfig: profileForm, allowSkip: true })
  .configure({
    persistence: {
      adapter: new LocalStorageAdapter({ maxAge: 7 * 24 * 60 * 60 * 1000 }),
      options: { autoPersist: true, debounceMs: 500 },
    },
  })
  .build();

function OnboardingFlow() {
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

## Why the All-in-One Package?

| | `rilaykit` | Individual packages |
|---|---|---|
| Install | `pnpm add rilaykit` | `pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow` |
| Imports | `import { ril, Form, Workflow } from 'rilaykit'` | Multiple import sources |
| API | `rilay.form()` / `rilay.flow()` | `form.create(rilay)` / `flow.create(rilay)` |
| Best for | New projects, prototyping, full-featured apps | Fine-grained control, minimal bundle |

If you only need forms (no workflows), prefer `@rilaykit/core` + `@rilaykit/forms` to keep your bundle smaller.

## Enhanced `ril` Instance

The `ril` exported from `rilaykit` extends the core `ril` with two convenience methods:

```tsx
import { ril } from 'rilaykit';

const rilay = ril.create()
  .addComponent('input', { renderer: Input });

// Create a form directly from the ril instance
const myForm = rilay.form('my-form');

// Create a workflow directly from the ril instance
const myFlow = rilay.flow('my-flow', 'My Workflow');
```

All other `ril` methods (`addComponent`, `configure`, `getComponent`, `clone`, etc.) work exactly the same.

## What's Included

Everything from all three packages:

- **From `@rilaykit/core`** — `ril`, `when`, `onChange`, validators (`required`, `email`, `url`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `number`, `custom`, `async`, `combine`), monitoring, condition utilities
- **From `@rilaykit/forms`** — `form`, `Form`, `FormField`, `FormBody`, `FormRow`, `FormProvider`, `FormSubmitButton`, Zustand hooks (`useFieldValue`, `useFieldErrors`, `useFieldProps`, `useFormValues`, `useFormActions`, etc.)
- **From `@rilaykit/workflow`** — `flow`, `Workflow`, `WorkflowBody`, `WorkflowStepper`, `WorkflowNextButton`, `WorkflowPreviousButton`, `WorkflowSkipButton`, `LocalStorageAdapter`, persistence, analytics, plugin hooks

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
