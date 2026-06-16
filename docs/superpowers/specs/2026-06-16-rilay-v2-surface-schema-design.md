# Rilay v2 Surface Schema Design

## Summary

Rilay v2 repositions the library from a form/workflow renderer into a JSON-first runtime for generated interactive surfaces.

The v2 contract is built around `SurfaceSchema`: a strict, portable JSON format that can describe both single-screen interfaces and multi-step flows. Forms remain a first-class use case through `FieldNode`, but they are no longer the whole model. A surface can collect data, show content, render business slots, group nodes, and trigger controlled actions.

The first v2 release focuses on complete surfaces. Incremental patches and streaming UI are deliberately postponed.

## Goals

- Support both multi-step flows and single-screen generated interfaces.
- Use strict portable JSON as the canonical interface contract.
- Keep React out of schemas.
- Replace mandatory renderers with typed registries, portable manifests, and React presets.
- Allow backend services, builders, and LLMs to know which components and props are valid.
- Validate surfaces against both the Rilay schema and the app-specific registry manifest.
- Compile schemas into a stable runtime graph before rendering.
- Preserve the useful form/workflow capabilities that Lilycare relies on without designing the v2 API around Lilycare.

## Non-Goals

- No patch/streaming runtime in the first v2 release.
- No free-form page builder.
- No JSX, functions, or React components inside JSON schemas.
- No full automatic migration from the current `@rilaykit/forms` and `@rilaykit/workflow` APIs.
- No intent-first component resolver in v2, although the model should leave room for it later.

## Package Shape

The recommended v2 package structure is:

- `@rilaykit/schema`: JSON schema types, manifest types, validation, normalization, migrations, and schema utilities.
- `@rilaykit/core`: runtime graph, state machine, conditions, validation descriptors, action dispatch, effects, and lifecycle events. No React dependency.
- `@rilaykit/react`: React providers, hooks, renderer, registry resolution, and preset integration.
- `@rilaykit/preset-basic`: minimal React preset that works out of the box.
- `rilaykit`: all-in-one package that re-exports the recommended public API.

The existing `forms` and `workflow` packages may become compatibility wrappers or legacy packages, but they should not define the v2 architecture.

## Surface Schema

`SurfaceSchema` is the canonical public model. It has two public modes:

```json
{
  "version": 2,
  "kind": "surface",
  "mode": "screen",
  "id": "generated-summary",
  "nodes": []
}
```

```json
{
  "version": 2,
  "kind": "surface",
  "mode": "flow",
  "id": "subscription",
  "steps": []
}
```

`screen` and `flow` stay distinct in JSON because they have different user-facing semantics. A screen has no visible navigation contract. A flow has declared steps, navigation, and step lifecycle.

Internally, both modes normalize into a single `RuntimeGraph`. A screen becomes a graph with one implicit step. This keeps the runtime simple without contaminating the public API with flow-only concepts.

## Node Model

The first v2 schema supports five node families:

```ts
type SurfaceNode =
  | FieldNode
  | ContentNode
  | ActionNode
  | GroupNode
  | SlotNode;
```

### FieldNode

Collects a value and owns validation, field state, and field-level conditions.

```json
{
  "kind": "field",
  "id": "email",
  "type": "text",
  "props": {
    "label": "Email"
  },
  "validation": [
    { "type": "required" },
    { "type": "email" }
  ],
  "conditions": {
    "visible": {
      "field": "contactMethod",
      "operator": "equals",
      "value": "email"
    }
  }
}
```

### ContentNode

Displays information without collecting a value. Initial examples include text blocks, callouts, images, summaries, dividers, and controlled markdown.

```json
{
  "kind": "content",
  "type": "callout",
  "props": {
    "tone": "info",
    "text": "These details help calculate your quote."
  }
}
```

### ActionNode

Triggers a controlled action. Built-in action types include `next`, `previous`, `submit`, and `skip`. App-specific actions are resolved through handlers, never inline functions.

```json
{
  "kind": "action",
  "type": "submit",
  "handler": "createSubscription",
  "props": {
    "label": "Submit"
  }
}
```

### GroupNode

Structures child nodes without becoming a general layout system. Initial group types include `section`, `row`, `stack`, `inline`, and `repeatable`.

```json
{
  "kind": "group",
  "type": "row",
  "nodes": [
    { "kind": "field", "id": "firstName", "type": "text" },
    { "kind": "field", "id": "lastName", "type": "text" }
  ]
}
```

### SlotNode

References app or domain-specific UI blocks through the registry. A slot does not collect a value unless it is modeled as a field.

```json
{
  "kind": "slot",
  "type": "quote.stepAside",
  "props": {
    "image": "/images/lily.webp",
    "title": "Why this question?"
  }
}
```

Rule of thumb:

- If it collects a value, it is a `field`.
- If it displays information, it is `content`.
- If it triggers behavior, it is an `action`.
- If it organizes nodes, it is a `group`.
- If it is app-specific UI, it is a `slot`.

## Registry And Manifest

Rilay v2 separates the runtime registry from the portable manifest.

### Runtime Registry

The runtime registry is app-side and React-aware. It is Zod-first so props and values can be validated and exported to JSON Schema.

```ts
registry.field("text", {
  propsSchema: z.object({
    label: z.string(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    autoFocus: z.boolean().optional()
  }),
  valueSchema: z.string().optional(),
  validations: ["required", "email", "minLength", "maxLength"],
  capabilities: {
    autoSubmit: false,
    asyncOptions: false
  },
  render: TextRenderer
});
```

The same pattern applies to content, action, group, and slot entries.

### Registry Manifest

The manifest is portable JSON generated from the runtime registry:

```ts
const manifest = createManifest(registry);
```

The backend, a builder, or an LLM can use the manifest to know:

- which node types are allowed;
- which props each node accepts;
- which value shape a field produces;
- which validations are valid for each field;
- which actions and slots are allowed;
- which capabilities are available.

A surface is valid only in combination with a compatible manifest.

### Standard Schema Position

Rilay should continue to support Standard Schema for runtime validation where possible, but the v2 registry definition should be Zod-first for entries that must export a complete manifest. Other schema libraries can be supported later through explicit introspection adapters.

## Compiler

`compileSurface()` is a central public API:

```ts
const compiled = compileSurface(surfaceSchema, registryManifest);
```

The compiler:

- validates the general Rilay JSON shape;
- validates every node against the registry manifest;
- validates props against the manifest JSON Schemas;
- checks that field validations are allowed by their field type;
- checks that actions and slots are allowed;
- applies defaults;
- normalizes `screen` into a single implicit-step graph;
- indexes fields, actions, nodes, and conditions;
- builds dependency metadata;
- returns structured errors with JSON paths;
- produces a stable `RuntimeGraph`.

React renders only the compiled graph. It should not be the hidden compiler.

## Runtime

`@rilaykit/core` creates and runs a surface runtime from a compiled graph:

```ts
createRuntime(graph, {
  defaultValues,
  actionHandlers,
  validationHandlers,
  effectHandlers
});
```

The runtime owns:

- field values and field state;
- validation;
- condition evaluation;
- navigation;
- action dispatch;
- effect execution;
- lifecycle events;
- output data;
- runtime errors.

Screens and flows use the same runtime. A screen simply has one implicit step and no active navigation UI unless the schema includes actions.

## React API

`@rilaykit/react` renders a compiled graph with a runtime registry:

```tsx
<RilayProvider graph={compiled.graph} registry={registry}>
  <Surface />
</RilayProvider>
```

A convenience API may compile and render in one component:

```tsx
<RilaySurface schema={surface} registry={registry} />
```

Core hooks become surface-oriented:

```ts
useSurface();
useCurrentStep();
useFieldValue("email");
useFieldActions("email");
useAction("submit");
useSurfaceStatus();
```

Renderers receive kind-specific props instead of one broad `ComponentRenderProps<any>`:

- `FieldRenderProps`
- `ContentRenderProps`
- `ActionRenderProps`
- `GroupRenderProps`
- `SlotRenderProps`

This keeps renderer contracts narrow and easier to validate.

## Presets

Renderers are packaged as presets. A preset installs registry entries, renderers, defaults, and optional slot implementations.

`@rilaykit/preset-basic` should provide enough components for a usable out-of-the-box experience:

- text, number, textarea, select, checkbox, radio, date;
- basic content nodes;
- next, previous, submit, skip actions;
- stack, row, section groups;
- basic flow and screen layouts.

Apps can define local presets, such as a future Lilycare preset, without changing the schema contract.

## Backend And AI Contract

Backends should depend on `@rilaykit/schema`, not React packages.

The backend can:

- load a registry manifest;
- validate a generated surface against that manifest;
- store valid surfaces in a database;
- send surfaces to the frontend;
- return compiler errors to an LLM or builder.

LLMs should receive a compact manifest instead of broad documentation. The manifest becomes the vocabulary of generated UI. The model can choose only registered nodes, props, validations, actions, and slots.

The v2 design should optimize for this loop:

```txt
Backend or LLM
  -> read RegistryManifest
  -> generate SurfaceSchema
  -> compileSurface(schema, manifest)
  -> store or send JSON

Frontend
  -> compile or receive compiled graph
  -> resolve graph through React registry
  -> run interactive surface
```

## Errors

Rilay v2 should expose structured error classes:

- `SchemaValidationError`: invalid Rilay JSON structure.
- `ManifestValidationError`: unknown node type, invalid props, invalid validation, unknown action, or disallowed slot.
- `RuntimeExecutionError`: action, validation, effect, or lifecycle failure during usage.

Errors must include precise JSON paths:

```txt
steps[2].nodes[0].props.options[3].value:
Expected string, received number
```

This is required for builders, backend logs, and LLM correction loops.

## Safety And Capability Policy

Schemas cannot contain functions. All dynamic behavior uses descriptors resolved by app-controlled handlers.

The design should reserve space for a `CapabilityPolicy`:

```json
{
  "allowedActions": ["next", "submit", "open-url"],
  "allowedFields": ["text", "select", "file-upload"],
  "maxSteps": 12,
  "allowExternalUrls": false
}
```

The first v2 release can keep policy support minimal, but the schema and compiler should not make it hard to add.

## Testing Strategy

The test pyramid should start below React.

Compiler and schema tests:

- valid and invalid `SurfaceSchema`;
- manifest validation;
- props validation;
- `screen` normalization into a graph;
- field/action/condition indexing;
- errors with precise paths;
- rejected unknown fields, slots, actions, and validations.

Runtime tests:

- field value updates;
- condition evaluation;
- validation descriptors;
- action dispatch;
- flow navigation;
- screen mode;
- lifecycle events;
- runtime error handling.

React tests:

- registry-based rendering;
- hook subscriptions;
- field updates from UI;
- action nodes;
- flow navigation;
- preset-basic coverage.

Integration test:

- a small Lilycare-inspired quote/subscription flow modeled as `SurfaceSchema`, including a custom field, a slot, conditions, metadata, and a submit action.

## Lilycare Migration Direction

Lilycare is a validation case, not the source of the v2 API.

Expected migration path:

- convert `shared/lib/rilay.tsx` into a local `lilycareRegistry`;
- export a `lilycareManifest`;
- move component renderers into a Lilycare preset;
- model `subscription-flow` as a generated `SurfaceSchema mode: "flow"` from `SubscriptionFieldsConfig`;
- model `quote-pricing-flow` as an authored `SurfaceSchema mode: "flow"`;
- keep field-like components such as `coverage-checkbox-group` as `field` entries;
- move non-value UI such as step aside panels and CGU blocks into `slot` entries;
- keep workflow-specific behavior such as `autoSubmit` as explicit capabilities/actions.

## Recommended V2 Scope

Include:

- `SurfaceSchema` JSON contract.
- Public `screen` and `flow` modes.
- Internal normalization to `RuntimeGraph`.
- `FieldNode`, `ContentNode`, `ActionNode`, `GroupNode`, and `SlotNode`.
- Zod-first runtime registry.
- Portable `RegistryManifest`.
- `compileSurface(surface, manifest)`.
- Core runtime without React.
- React runtime based on compiled graphs and presets.
- `@rilaykit/preset-basic`.
- Descriptor-based conditions, validations, and actions.
- Structured errors with JSON paths.
- Compiler, runtime, React, and integration tests.

Postpone:

- incremental patches;
- streaming UI;
- intent-first resolver;
- free-form page builder;
- automatic full migration from current APIs;
- strict compatibility for current `forms` and `workflow` packages.

## Final Positioning

Rilay v2 should be described as:

> A JSON-first runtime for generated interactive surfaces, with typed registries, portable manifests, a compiler, and React presets.

The architecture keeps the generative UI ambition without turning Rilay into an unconstrained page builder.
