# @rilaykit/core

## 0.1.4

### Patch Changes

- Version patch bump for all packages

## 0.1.3

### Patch Changes

- feat(forms): add submit options (force and skipInvalid)

  Add `SubmitOptions` to control form submission behavior:

  - `force`: bypass validation entirely and submit current values as-is
  - `skipInvalid`: run validation but exclude invalid fields from submitted data

  Options can be set at the builder level via `.setSubmitOptions()` as defaults,
  or passed at submit-time via `submit({ force: true })` to override per call.

## 0.1.2

### Patch Changes

- Fix className passthrough in Form component

## 0.1.1

### Patch Changes

- Maintenance release

  - Set 0.1.0 as first stable release baseline
  - Deprecate all previous experimental versions
  - Clean up release configuration

## 0.1.0

### First Stable Release

- Zustand-based state management for forms and workflows
- Fine-grained subscriptions and selector-based re-renders
- Improved performance with better isolation of component re-renders
- New hooks: `useFormStore`, `useWorkflowStore`
- Condition dependency graph for efficient condition evaluation
- Standard Schema validation support
