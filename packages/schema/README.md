# @rilaykit/schema

Portable JSON schemas, registry manifests, structured errors, and compiler utilities for Rilay v2 surfaces.

This package has no React dependency. Backend services, builders, LLM tooling, tests, and frontend runtimes can use it to validate generated interactive surfaces before rendering.

## Core Concepts

- `SurfaceSchema`: strict JSON contract for generated screens and flows.
- `RegistryManifest`: portable manifest describing allowed fields, content, actions, groups, slots, props schemas, validations, and capabilities.
- `compileSurface(surface, manifest)`: validates a raw surface and manifest, checks manifest compatibility, and returns a normalized `RuntimeGraph`.
- `RuntimeGraph`: React-free graph consumed by future runtime and renderer packages. A `screen` is normalized to one implicit step; a `flow` keeps its declared steps.

## Minimal Example

```ts
import { compileSurface } from '@rilaykit/schema';

const manifest = {
  version: 1,
  fields: {
    text: {
      kind: 'field',
      validations: ['required', 'email'],
    },
  },
  actions: {
    submit: {
      kind: 'action',
      handlerRequired: true,
    },
  },
} as const;

const surface = {
  version: 2,
  kind: 'surface',
  mode: 'screen',
  id: 'lead',
  nodes: [
    {
      kind: 'field',
      id: 'email',
      type: 'text',
      validation: [{ type: 'required' }, { type: 'email' }],
    },
    {
      kind: 'action',
      id: 'submit',
      type: 'submit',
      handler: 'submitLead',
    },
  ],
} as const;

const compiled = compileSurface(surface, manifest);

console.log(compiled.graph.surfaceId); // "lead"
console.log(compiled.graph.steps[0].id); // "__screen"
```

## Surface Modes

`screen` and `flow` are distinct in portable JSON:

- `screen` describes a single generated interface with `nodes`.
- `flow` describes declared steps with `steps[].nodes`.

Both modes compile to the same internal `RuntimeGraph`, so runtime and renderer packages can consume one shape.

## Registry Manifest Validation

`assertSurfaceMatchesManifest(surface, manifest)` checks that:

- every node type exists in the matching manifest family;
- field validation descriptors are allowed by the field manifest entry;
- actions marked with `handlerRequired` declare a handler;
- nested group nodes are traversed.

Phase 1 does not execute JSON Schema validation for `propsSchema` or `valueSchema`; those schemas are exposed for tools and later runtime phases.

## Errors

`compileSurface` can throw:

- `SchemaValidationError` when the surface or manifest shape is not valid portable JSON;
- `ManifestValidationError` when the surface references registry entries or validations not allowed by the manifest.

Schema errors are contextualized with `surface.*` or `manifest.*` paths so backend and tooling callers can report the failing input precisely.

