# @rilaykit/forms

Form builder and React rendering layer for [RilayKit](https://rilay.dev) — type-safe, headless forms from declarative schemas, powered by a per-form Zustand store with granular selectors.

## Installation

```bash
pnpm add @rilaykit/core @rilaykit/forms
```

`@rilaykit/core` is a required peer dependency. Requires React >= 18.

The main entry is React-free (safe in React Server Components). Import components and hooks from `@rilaykit/forms/react`.

## Quick Start

```tsx
// Catalog + form definition (isomorphic — no React)
import { ril, required, email } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Input } from './components/Input';

const rilay = ril.create().component('input', { renderer: Input });

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

```tsx
'use client';
import { Form } from '@rilaykit/forms/react';

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

`Form.Body`, `Form.Submit`, and `Form.List` also accept render props for full markup control.

## Features

### Headless React Components

Zero HTML, zero CSS — you provide the renderers, RilayKit handles state, validation, and orchestration.

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

Each form instance gets its own store with granular selectors — only the fields that change re-render. A keystroke re-renders one field, even at 200 fields.

```tsx
import { useFieldValue, useFieldErrors, useFieldActions } from '@rilaykit/forms/react';

function CustomField({ fieldId }: { fieldId: string }) {
  const value = useFieldValue(fieldId);
  const errors = useFieldErrors(fieldId);
  const { setValue, setTouched } = useFieldActions(fieldId);
  // ...
}
```

### Conditional Fields

Fields show/hide reactively based on other field values via `@rilaykit/core`'s condition system.

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

Mix built-in validators, Standard Schema libraries (Zod, Valibot, ArkType…), and custom validators in the same field. Timing is form-level, mirroring React Hook Form:

```tsx
import { z } from 'zod';
import { required } from '@rilaykit/core';

form.create(rilay, 'checkout')
  .add({
    id: 'email',
    type: 'input',
    props: { label: 'Email' },
    validation: { validate: [required(), z.string().email()], debounceMs: 300 },
  })
  .setValidation({
    mode: 'onTouched', // when a field FIRST validates (default: 'onTouched')
    reValidateMode: 'onChange', // re-validation after an error (default: 'onChange')
  });
```

Per-field `debounceMs` throttles async validators (blur and submit always validate immediately). Cross-field issues route by `issue.path` to the matching field, or to the `__form__` bucket read by `useFormErrors()` — ideal for a form-level error banner.

## API Overview

### Builder

| Method | Description |
|--------|-------------|
| `form.create(ril, id?)` | Create a new form builder |
| `.add(...fields)` | Add fields to the form |
| `.addSeparateRows(fields)` | Each field on its own row |
| `.updateField(id, updates)` | Update a field definition |
| `.removeField(id)` | Remove a field |
| `.setValidation(config)` | Form-level validation: `mode`, `reValidateMode`, cross-field `validate` |
| `.addFieldConditions(id, conditions)` | Add conditional logic |
| `.build()` | Produce the final `FormConfiguration` |
| `.toJSON()` / `.fromJSON(json)` | Serialize / deserialize |
| `.clone(newId?)` | Clone the form configuration |

### Hooks

From `@rilaykit/forms/react`:

| Hook | Description |
|------|-------------|
| `useFieldValue(id)` | Current field value |
| `useFieldErrors(id)` | Field validation errors (including routed cross-field issues) |
| `useFieldTouched(id)` | Whether field has been touched |
| `useFieldState(id)` | Combined field state |
| `useFieldActions(id)` | `setValue`, `setTouched`, etc. |
| `useFieldConditions(id)` | Evaluated condition results |
| `useFormValues()` | All form values |
| `useFormErrors()` | Form-level (`__form__`) errors |
| `useFormValid()` | Whether form is valid |
| `useFormDirty()` | Whether form has unsaved changes |
| `useFormSubmitting()` | Whether form is submitting |
| `useFormActions()` | `submit`, `reset(values?, repeatableOrder?)`, `validate`, etc. |

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
import { compileForm } from '@rilaykit/forms';
import { Form } from '@rilaykit/forms/react';
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

The payload is data only. A field names its component `type`, its `props`, an optional inline `default`, `validation.rules` (built-in names like `"required"` / `"email"`, or a key from `bindings.validators`), `conditions`, and `effects` (a key from `bindings.effects`). Form-level timing lives in `validation: { mode, reValidateMode, rules }`. Use `rows` instead of `fields` for multi-field rows and repeatable groups.

| Option | Effect |
| --- | --- |
| `bindings` | Resolves the schema's validator / effect string references |
| `validateProps` | Also checks each field's `props` against its component's `propsSchema`. Checks only — props are never rewritten |

A structural defect throws `SchemaValidationError`, whose `issues[]` carry a JSON `path`, a `message`, and (for prop issues) the component's `expectedKeys`.

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
