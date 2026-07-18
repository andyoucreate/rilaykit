# @rilaykit/workflow

## 0.2.1

### Patch Changes

- [#20](https://github.com/andyoucreate/rilaykit/pull/20) [`850f391`](https://github.com/andyoucreate/rilaykit/commit/850f3914892abfaeef3e0585ea1c6ff4a50380db) Thanks [@reizam](https://github.com/reizam)! - Clear the persistence load-settle timer on unmount. `loadPersistedData` scheduled a 100ms `setIsLoadingPersisted(false)` timer that nothing cancelled; unmounting inside that window fired React state on a torn-down hook. The timer is now tracked, mount-guarded, and cancelled in the unmount cleanup.

- Updated dependencies []:
  - @rilaykit/core@0.2.1
  - @rilaykit/forms@0.2.1

## 0.2.0

### Minor Changes

- [#17](https://github.com/andyoucreate/rilaykit/pull/17) [`a539aa7`](https://github.com/andyoucreate/rilaykit/commit/a539aa7172c76b01a8d33547fe4d3a030e18ec2a) Thanks [@reizam](https://github.com/reizam)! - P3: agent layer, isomorphic entries, and vendor-agnostic AI SDK tools

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

- Updated dependencies [[`a539aa7`](https://github.com/andyoucreate/rilaykit/commit/a539aa7172c76b01a8d33547fe4d3a030e18ec2a)]:
  - @rilaykit/core@0.2.0
  - @rilaykit/forms@0.2.0

## 0.1.6

### Patch Changes

- [`f3fbad1`](https://github.com/andyoucreate/rilaykit/commit/f3fbad1d81bb574ee078a438ea85ce7fd19b00a5) Thanks [@reizam](https://github.com/reizam)! - fix(publish): resolve workspace:\* protocols in rilaykit package dependencies

- Updated dependencies [[`f3fbad1`](https://github.com/andyoucreate/rilaykit/commit/f3fbad1d81bb574ee078a438ea85ce7fd19b00a5)]:
  - @rilaykit/core@0.1.6
  - @rilaykit/forms@0.1.6

## 0.1.4

### Patch Changes

- Version patch bump for all packages

- Updated dependencies []:
  - @rilaykit/core@0.1.4
  - @rilaykit/forms@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@0.1.3
  - @rilaykit/forms@0.1.3

## 0.1.2

### Patch Changes

- Fix className passthrough in Form component

- Updated dependencies []:
  - @rilaykit/core@0.1.2
  - @rilaykit/forms@0.1.2

## 0.1.1

### Patch Changes

- Maintenance release

  - Set 0.1.0 as first stable release baseline
  - Deprecate all previous experimental versions
  - Clean up release configuration

- Updated dependencies []:
  - @rilaykit/core@0.1.1
  - @rilaykit/forms@0.1.1

## 0.1.0

### First Stable Release

- Zustand-based state management for multi-step workflows
- Step navigation with validation
- Conditional step visibility
- Data persistence support
- Step tracking: `visitedSteps`, `visibleVisitedSteps`, `passedSteps`
- Workflow builder pattern with fluent API
