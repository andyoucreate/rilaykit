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

### 1. Create Your Catalog

```tsx
import { ril } from '@rilaykit/core';
import { Input } from './components/Input';

const rilay = ril.create()
  .component('input', { renderer: Input });
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

Prefer full control over the markup? Use the `Form.Body` render prop:

```tsx
<Form of={loginForm} defaults={{ email: 'neo@matrix.io' }} onSubmit={handleSubmit}>
  <Form.Body>
    {({ rows }) =>
      rows.map((row) =>
        row.kind === 'fields' ? (
          <section key={row.id} className="row">
            {row.fields.map((field) => (
              <Form.Field key={field.id} id={field.id} />
            ))}
          </section>
        ) : (
          <Form.List key={row.id} id={row.repeatable.id} />
        )
      )
    }
  </Form.Body>
  <Form.Submit>{({ submitting, submit }) => (
    <button type="button" disabled={submitting} onClick={submit}>Sign In</button>
  )}</Form.Submit>
</Form>
```

## Features

### Fluent Form Builder

Construct forms with a chainable, type-safe API. Each field type and its props are validated at compile time.

```tsx
import { form } from '@rilaykit/forms';

const contactForm = form
  .create(rilay, 'contact')
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
| `<Form of defaults>` | Root — accepts a builder or a built configuration, manages context, state, and submission |
| `<Form.Body>` | Renders the form body — bare default markup or a `{ rows }` render prop |
| `<Form.Field id overrides>` | Renders a single field by ID through its catalog renderer |
| `<Form.Submit>` | Submit button — bare default or a `{ submitting, submit }` render prop |
| `<Form.List id>` | Repeatable group — bare default or an `{ items, add, remove, move, canAdd, canRemove }` render prop |
| `<FormProvider>` | Context provider (used separately from Form when needed) |

Bare defaults ship styleable data attributes: `[data-form-body]`, `[data-form-row]`, `[data-form-submit]`, `[data-form-list]`, `[data-form-list-item]`, `[data-form-list-add]`, `[data-field-id]` and `data-field-*` state attributes.

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
| `.add(...fields)` | Add fields to the form |
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

### Server-Driven Forms

Generate forms from JSON schemas sent by the backend — no frontend redeployment needed.

```tsx
import { Form, compileForm } from '@rilaykit/forms';
import type { Bindings, FormSchema } from '@rilaykit/forms';

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

The payload is data only. A field names its component `type`, its `props`, an
optional inline `default`, `validation.rules` (built-in names like `"required"`
/ `"email"`, or a key from `bindings.validators`), `conditions`, and `effects`
(a key from `bindings.effects`). Use `rows` instead of `fields` for multi-field
rows and repeatable groups.

| Option | Effect |
| --- | --- |
| `bindings` | Resolves the schema's validator / effect string references |
| `validateProps` | Also checks each field's `props` against its component's `propsSchema`. Checks only — props are never rewritten |

A structural defect throws `SchemaValidationError`, whose `issues[]` carry a
JSON `path`, a `message`, and (for prop issues) the component's `expectedKeys`
— enough for a producer to correct its own emission.

> `fromSchema` remains as a deprecated alias for `compileForm`, and `SchemaRegistry` for `Bindings`.

See the [Server-Driven Forms guide](https://rilay.dev/forms/server-driven-forms) for details.

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Building Forms](https://rilay.dev/forms/building-forms)
- [Rendering Forms](https://rilay.dev/forms/rendering-forms)
- [Form Validation](https://rilay.dev/forms/validation)
- [Advanced Forms](https://rilay.dev/forms/advanced-forms)
- [Server-Driven Forms](https://rilay.dev/forms/server-driven-forms)
- [Form Hooks](https://rilay.dev/forms/hooks)
- [API Reference](https://rilay.dev/api)

## License

MIT — see [LICENSE](./LICENSE) for details.
