# @rilaykit/agent

## 0.2.0-beta.1

### Patch Changes

- Fix `show_form`/`show_flow` HITL forms silently never rendering (#23). The tool's `schema` argument was declared `z.unknown()`, projecting to an unconstrained `{}` (no `type`), so models serialized the nested FormSchema/FlowSchema as stringified JSON and the built-in renderer threw instead of mounting the form. Three layers: (1) an honest permissive `z.looseObject` shape so the emitted JSON Schema is object-typed on both adapters (models emit a nested object); (2) `coerceEmittedSchema` — defense-in-depth that parses a residually-stringified emission before compiling; (3) `SettledToolResult` — settled forms now render an explicit read-only summary instead of leaking the humanized tool name.

- Updated dependencies []:
  - @rilaykit/core@0.2.0-beta.1
  - @rilaykit/forms@0.2.0-beta.1
  - @rilaykit/workflow@0.2.0-beta.1

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

- Updated dependencies [[`834234b`](https://github.com/andyoucreate/rilaykit/commit/834234b1f49fd88ad50c0cf7ff3acf1b1f195828), [`850f391`](https://github.com/andyoucreate/rilaykit/commit/850f3914892abfaeef3e0585ea1c6ff4a50380db)]:
  - @rilaykit/core@0.2.0-beta.0
  - @rilaykit/forms@0.2.0-beta.0
  - @rilaykit/workflow@0.2.0-beta.0
