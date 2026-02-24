# @rilaykit/forms

## 0.1.3

### Patch Changes

- feat(forms): add submit options (force and skipInvalid)

  Add `SubmitOptions` to control form submission behavior:

  - `force`: bypass validation entirely and submit current values as-is
  - `skipInvalid`: run validation but exclude invalid fields from submitted data

  Options can be set at the builder level via `.setSubmitOptions()` as defaults,
  or passed at submit-time via `submit({ force: true })` to override per call.

- Updated dependencies []:
  - @rilaykit/core@0.1.3

## 0.1.2

### Patch Changes

- Fix className passthrough in Form component

- Updated dependencies []:
  - @rilaykit/core@0.1.2

## 0.1.1

### Patch Changes

- Maintenance release

  - Set 0.1.0 as first stable release baseline
  - Deprecate all previous experimental versions
  - Clean up release configuration

- Updated dependencies []:
  - @rilaykit/core@0.1.1

## 0.1.0

### First Stable Release

- Zustand-based state management for forms
- Fine-grained subscriptions with selector-based re-renders
- Form builder pattern with fluent API
- Conditional field visibility
- Validation with Standard Schema support
- Hooks: `useFieldValue`, `useFieldConditions`, `useFormSubmitState`
