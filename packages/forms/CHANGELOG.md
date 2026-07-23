# @rilaykit/forms

## 0.2.0-beta.1

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@0.2.0-beta.1

## 0.2.0-beta.0

### Minor Changes

- [`834234b`](https://github.com/andyoucreate/rilaykit/commit/834234b1f49fd88ad50c0cf7ff3acf1b1f195828) Thanks [@reizam](https://github.com/reizam)! - P3: agent layer, isomorphic entries, and vendor-agnostic AI SDK tools

  **`@rilaykit/agent`** — the P3 agent layer: `manifest()` for system-prompt
  catalog descriptions, `uiTools()` and the `show_form`/`show_flow`/`show_component`
  tools, `<Catalog>`/`<Parts>`/`<Part>` renderers, and the AI SDK and Anthropic
  adapters (`tools()`, `toParts()`).

  **BREAKING — isomorphic main entries.** `@rilaykit/forms`, `@rilaykit/workflow`,
  and `rilaykit` main entries are now React-free (safe to import from a React
  Server Component). Their React components and hooks move to a `/react` subpath:
  import `Form`, `Flow`, `WorkflowProvider`, `useForm`, and the field/flow hooks
  from `@rilaykit/forms/react`, `@rilaykit/workflow/react`, or `rilaykit/react`.
  The isomorphic surface (builders, vanilla stores, schema, persistence adapters,
  `ril`, the agent tool schemas) stays on the main entries.

  **AI SDK tools are now schema-vendor-agnostic.** `tools()` wraps each emitted
  tool in the SDK's `jsonSchema(projectedRoot, { validate })`, so a tool built with
  any Standard Schema vendor (valibot, ArkType, …) reaches the provider and is
  validated — not just zod. The result satisfies the SDK's `ToolSet` with no cast.

  Plus the P3 correctness pass: repeatable-field effects fan out per row (including
  when they watch a global field), persistence preserves `Date`/`NaN`/`Infinity`/
  `BigInt` across save→load, and the unimplemented `step.next.skip()` /
  `step.workflow.goto()` were removed from the public `StepContext` type.

### Patch Changes

- Updated dependencies [[`834234b`](https://github.com/andyoucreate/rilaykit/commit/834234b1f49fd88ad50c0cf7ff3acf1b1f195828)]:
  - @rilaykit/core@0.2.0-beta.0

## 0.1.6

### Patch Changes

- [`f3fbad1`](https://github.com/andyoucreate/rilaykit/commit/f3fbad1d81bb574ee078a438ea85ce7fd19b00a5) Thanks [@reizam](https://github.com/reizam)! - fix(publish): resolve workspace:\* protocols in rilaykit package dependencies

- Updated dependencies [[`f3fbad1`](https://github.com/andyoucreate/rilaykit/commit/f3fbad1d81bb574ee078a438ea85ce7fd19b00a5)]:
  - @rilaykit/core@0.1.6

## 0.1.4

### Patch Changes

- Version patch bump for all packages

- Updated dependencies []:
  - @rilaykit/core@0.1.4

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
