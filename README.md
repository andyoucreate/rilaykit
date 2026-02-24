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
| [`@rilaykit/core`](./packages/core) | ![npm](https://img.shields.io/npm/v/@rilaykit/core) | Component registry, types, validation, conditions, monitoring |
| [`@rilaykit/forms`](./packages/forms) | ![npm](https://img.shields.io/npm/v/@rilaykit/forms) | Form builder and headless React components |
| [`@rilaykit/workflow`](./packages/workflow) | ![npm](https://img.shields.io/npm/v/@rilaykit/workflow) | Multi-step workflows with persistence, analytics, plugins |

All packages are MIT licensed and open source.

## Installation

```bash
# Core + Forms (most use cases)
pnpm add @rilaykit/core @rilaykit/forms

# With multi-step workflows
pnpm add @rilaykit/core @rilaykit/forms @rilaykit/workflow
```

**Requirements:** React >= 18, TypeScript >= 5

## Quick Start

### 1. Register Your Components

```tsx
import { ril, ComponentRenderer } from '@rilaykit/core';

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
import { Form, FormField } from '@rilaykit/forms';

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
import {
  Workflow, WorkflowStepper, WorkflowBody,
  WorkflowPreviousButton, WorkflowNextButton,
} from '@rilaykit/workflow';

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

## Architecture

```
@rilaykit/core          Registry, types, validation, conditions, monitoring
    ↑
@rilaykit/forms         Form builder, React components, Zustand store
    ↑
@rilaykit/workflow      Workflow builder, navigation, persistence, analytics, plugins
```

The Registry and Builder layers have no React dependency — they run in Node, tests, and build scripts. The rendering layer is entirely your code.

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
