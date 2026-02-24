# @rilaykit/forms

The form builder and React rendering layer for [RilayKit](https://rilay.dev) — build type-safe, headless forms from declarative schemas.

`@rilaykit/forms` provides a fluent builder API to define form configurations and headless React components to render them. State management is powered by Zustand with granular selectors for optimal re-render performance.

## Installation

```bash
# pnpm (recommended)
pnpm add @rilaykit/core @rilaykit/forms

# npm
npm install @rilaykit/core @rilaykit/forms

# yarn
yarn add @rilaykit/core @rilaykit/forms

# bun
bun add @rilaykit/core @rilaykit/forms
```

> `@rilaykit/core` is a required peer dependency.

### Requirements

- React >= 18
- React DOM >= 18

## Quick Start

### 1. Create Your Registry

```tsx
import { ril } from '@rilaykit/core';
import { Input } from './components/Input';

const rilay = ril.create()
  .addComponent('input', { renderer: Input });
```

### 2. Build a Form

```tsx
import { required, email } from '@rilaykit/core';

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

## Features

### Fluent Form Builder

Construct forms with a chainable, type-safe API. Each field type and its props are validated at compile time.

```tsx
const contactForm = rilay
  .form('contact')
  .add(
    { id: 'firstName', type: 'input', props: { label: 'First Name' } },
    { id: 'lastName', type: 'input', props: { label: 'Last Name' } },
  )
  .add({
    id: 'message',
    type: 'textarea',
    props: { label: 'Message', rows: 5 },
    validation: { validate: [required()] },
  });

// Serialize, clone, inspect
const json = contactForm.toJSON();
const variant = contactForm.clone('contact-v2');
const stats = contactForm.getStats();
```

### Headless React Components

Zero HTML, zero CSS. You provide the renderers, RilayKit handles state, validation, and orchestration.

| Component | Description |
|-----------|-------------|
| `<Form>` | Main wrapper — manages context, state, and submission |
| `<FormProvider>` | Context provider (used separately from Form when needed) |
| `<FormBody>` | Renders the full form body from configuration |
| `<FormField>` | Renders a single field by ID |
| `<FormRow>` | Renders a row of fields |
| `<FormSubmitButton>` | Submit button with loading/disabled state |

### Zustand-Powered Store

Each form instance gets its own Zustand store with granular selectors — only the fields that change trigger re-renders.

```tsx
import {
  useFieldValue,
  useFieldErrors,
  useFieldTouched,
  useFieldState,
  useFormValues,
  useFormValid,
  useFormDirty,
  useFormSubmitting,
  useFieldActions,
  useFormActions,
} from '@rilaykit/forms';

function CustomField({ fieldId }: { fieldId: string }) {
  const value = useFieldValue(fieldId);
  const errors = useFieldErrors(fieldId);
  const { setValue, setTouched } = useFieldActions(fieldId);
  // ...
}
```

### Conditional Fields

Combined with `@rilaykit/core`'s condition system, fields show/hide reactively based on other field values.

```tsx
import { when } from '@rilaykit/core';

form.create(rilay, 'account')
  .add({
    id: 'accountType',
    type: 'select',
    props: { options: [{ value: 'business', label: 'Business' }] },
  })
  .add({
    id: 'companyName',
    type: 'input',
    props: { label: 'Company Name' },
    conditions: { visible: when('accountType').equals('business') },
  });
```

### Validation

Supports built-in validators, Standard Schema libraries (Zod, Valibot, Yup...), and custom validators — all in the same field.

```tsx
import { z } from 'zod';
import { required } from '@rilaykit/core';

validation: {
  validate: [required(), z.string().email()],
  validateOnBlur: true,
}
```

## API Overview

### Builder

| Method | Description |
|--------|-------------|
| `form.create(ril, id?)` | Create a new form builder |
| `.add(...fields)` | Add fields (1-3 per row) |
| `.addSeparateRows(fields)` | Each field on its own row |
| `.updateField(id, updates)` | Update a field definition |
| `.removeField(id)` | Remove a field |
| `.setValidation(config)` | Set form-level validation |
| `.addFieldConditions(id, conditions)` | Add conditional logic |
| `.build()` | Produce the final `FormConfiguration` |
| `.toJSON()` / `.fromJSON(json)` | Serialize / deserialize |
| `.clone(newId?)` | Clone the form configuration |

### Hooks

| Hook | Description |
|------|-------------|
| `useFieldValue(id)` | Current field value |
| `useFieldErrors(id)` | Field validation errors |
| `useFieldTouched(id)` | Whether field has been touched |
| `useFieldState(id)` | Combined field state |
| `useFieldActions(id)` | `setValue`, `setTouched`, etc. |
| `useFieldConditions(id)` | Evaluated condition results |
| `useFormValues()` | All form values |
| `useFormValid()` | Whether form is valid |
| `useFormDirty()` | Whether form has unsaved changes |
| `useFormSubmitting()` | Whether form is submitting |
| `useFormActions()` | `submit`, `reset`, `validate`, etc. |

## Architecture

```
@rilaykit/core          (registry, types, validation, conditions)
    ↑
@rilaykit/forms         ← you are here
    ↑
@rilaykit/workflow      (multi-step workflows)
```

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Building Forms](https://rilay.dev/forms/building-forms)
- [Rendering Forms](https://rilay.dev/forms/rendering-forms)
- [Form Validation](https://rilay.dev/forms/validation)
- [Advanced Forms](https://rilay.dev/forms/advanced-forms)
- [Form Hooks](https://rilay.dev/forms/hooks)
- [API Reference](https://rilay.dev/api)

## License

MIT — see [LICENSE](./LICENSE) for details.
