# Rilay v2 Schema Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first testable Rilay v2 foundation: `@rilaykit/schema`, `SurfaceSchema`, `RegistryManifest`, structured errors, and `compileSurface()`.

**Architecture:** This phase creates a React-free package that validates strict JSON surfaces against a portable registry manifest and compiles them into a normalized `RuntimeGraph`. React rendering, core runtime execution, and presets are intentionally handled by subsequent phase plans.

**Tech Stack:** TypeScript, Vitest, Zod, `zod-to-json-schema`, tsup, pnpm workspace.

---

## Scope Note

The approved design spans schema, compiler, core runtime, React runtime, and presets. This plan implements only the independent foundation:

- `@rilaykit/schema`
- public schema and manifest types
- Zod-based validation
- JSON-path structured errors
- `compileSurface(surface, manifest)`
- `screen` and `flow` normalization into `RuntimeGraph`

Subsequent phase plans should build on this package:

- Phase 2: `@rilaykit/core` runtime execution over `RuntimeGraph`
- Phase 3: `@rilaykit/react` renderer and hooks
- Phase 4: `@rilaykit/preset-basic`
- Phase 5: legacy compatibility and Lilycare migration spike

## File Structure

Create these files:

- `packages/schema/package.json`: package metadata, scripts, dependencies.
- `packages/schema/tsconfig.json`: local TS config extending repo settings.
- `packages/schema/tsconfig.build.json`: build-time TS config.
- `packages/schema/tsup.config.ts`: package build config.
- `packages/schema/src/index.ts`: public exports.
- `packages/schema/src/types.ts`: public TypeScript interfaces for surfaces, nodes, manifests, compiled graphs, and compiler results.
- `packages/schema/src/errors.ts`: structured error classes and JSON path formatting.
- `packages/schema/src/schemas.ts`: Zod schemas for raw `SurfaceSchema` and `RegistryManifest`.
- `packages/schema/src/manifest.ts`: manifest validation and lookup helpers.
- `packages/schema/src/normalize.ts`: screen/flow normalization into `RuntimeGraph`.
- `packages/schema/src/compiler.ts`: `compileSurface()` public API.
- `packages/schema/tests/schema.test.ts`: basic `SurfaceSchema` validation tests.
- `packages/schema/tests/manifest.test.ts`: manifest validation tests.
- `packages/schema/tests/compiler.test.ts`: compiler and normalization tests.
- `packages/schema/tests/errors.test.ts`: JSON path and structured error tests.

Modify these files:

- `pnpm-lock.yaml`: updated by package install.
- `package.json`: only if the dependency install updates workspace metadata.
- `packages/rilaykit/package.json`: not in this phase.
- `packages/rilaykit/src/index.ts`: not in this phase.

The new package must not import React or existing `@rilaykit/core` code. It is the portable contract layer.

---

### Task 1: Scaffold `@rilaykit/schema`

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/tsconfig.build.json`
- Create: `packages/schema/tsup.config.ts`
- Create: `packages/schema/src/index.ts`

- [ ] **Step 1: Create the package files**

Add `packages/schema/package.json`:

```json
{
  "name": "@rilaykit/schema",
  "version": "0.1.6",
  "private": false,
  "description": "Portable JSON schemas, manifests, and compiler for Rilay v2 surfaces",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "publishConfig": {
    "provenance": true
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:run": "vitest run",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "keywords": ["rilaykit", "schema", "json-schema", "generative-ui", "typescript"],
  "author": "AND YOU CREATE <contact@andyoucreate.com>",
  "license": "MIT",
  "homepage": "https://rilay.dev",
  "repository": {
    "type": "git",
    "url": "https://github.com/andyoucreate/rilaykit.git"
  },
  "bugs": {
    "url": "https://github.com/andyoucreate/rilaykit/issues"
  },
  "dependencies": {
    "zod": "^3.22.4",
    "zod-to-json-schema": "^3.24.5"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Add `packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "declarationMap": true,
    "composite": false,
    "noEmit": true
  },
  "include": ["src", "tests"],
  "exclude": ["dist", "node_modules"]
}
```

Add `packages/schema/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "emitDeclarationOnly": false
  },
  "include": ["src"],
  "exclude": ["tests", "dist", "node_modules"]
}
```

Add `packages/schema/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  minify: true,
  target: 'es2020',
  external: ['typescript'],
  bundle: true,
  drop: ['console'],
  treeShaking: true,
  sourcemap: false,
  outDir: 'dist',
  skipNodeModulesBundle: true,
});
```

Add `packages/schema/src/index.ts`:

```ts
export * from './types';
export * from './errors';
export * from './schemas';
export * from './manifest';
export * from './normalize';
export * from './compiler';
```

Add these temporary module stubs so the scaffold type-checks before the real implementations land:

`packages/schema/src/types.ts`

```ts
export {};
```

`packages/schema/src/errors.ts`

```ts
export {};
```

`packages/schema/src/schemas.ts`

```ts
export {};
```

`packages/schema/src/manifest.ts`

```ts
export {};
```

`packages/schema/src/normalize.ts`

```ts
export {};
```

`packages/schema/src/compiler.ts`

```ts
export {};
```

- [ ] **Step 2: Install the JSON Schema dependency**

Run:

```bash
pnpm add zod-to-json-schema --filter @rilaykit/schema
```

Expected: `packages/schema/package.json` and `pnpm-lock.yaml` include `zod-to-json-schema`.

- [ ] **Step 3: Run package type-check and expect missing module errors only if files are not created**

Run:

```bash
pnpm --filter @rilaykit/schema type-check
```

Expected after Step 1: PASS because exported stub modules exist.

- [ ] **Step 4: Commit scaffold**

```bash
git add packages/schema pnpm-lock.yaml
git commit -m "feat(schema): scaffold package"
```

---

### Task 2: Define Public Types

**Files:**
- Create: `packages/schema/src/types.ts`
- Test: `packages/schema/tests/schema.test.ts`

- [ ] **Step 1: Write failing type-shape tests**

Add `packages/schema/tests/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isSurfaceSchema } from '../src/schemas';

describe('SurfaceSchema validation', () => {
  it('accepts a screen surface with nodes', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'summary',
        nodes: [
          {
            kind: 'content',
            type: 'text',
            props: { text: 'Hello' },
          },
        ],
      })
    ).toBe(true);
  });

  it('accepts a flow surface with steps', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'quote',
        steps: [
          {
            id: 'identity',
            title: 'Identity',
            nodes: [{ kind: 'field', id: 'email', type: 'text' }],
          },
        ],
      })
    ).toBe(true);
  });

  it('rejects a screen surface with steps instead of nodes', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'bad',
        steps: [],
      })
    ).toBe(false);
  });

  it('rejects a flow surface with nodes instead of steps', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'bad',
        nodes: [],
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/schema.test.ts
```

Expected: FAIL because `../src/schemas` and `isSurfaceSchema` are not implemented.

- [ ] **Step 3: Implement public interfaces**

Add `packages/schema/src/types.ts`:

```ts
export type SurfaceMode = 'screen' | 'flow';
export type SurfaceNodeKind = 'field' | 'content' | 'action' | 'group' | 'slot';
export type JsonObject = Record<string, unknown>;

export interface BaseSurfaceSchema {
  readonly version: 2;
  readonly kind: 'surface';
  readonly mode: SurfaceMode;
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly metadata?: JsonObject;
}

export interface ScreenSurfaceSchema extends BaseSurfaceSchema {
  readonly mode: 'screen';
  readonly nodes: SurfaceNode[];
}

export interface FlowSurfaceSchema extends BaseSurfaceSchema {
  readonly mode: 'flow';
  readonly steps: SurfaceStep[];
}

export type SurfaceSchema = ScreenSurfaceSchema | FlowSurfaceSchema;

export interface SurfaceStep {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly metadata?: JsonObject;
  readonly conditions?: ConditionsDescriptor;
  readonly nodes: SurfaceNode[];
}

export type SurfaceNode = FieldNode | ContentNode | ActionNode | GroupNode | SlotNode;

export interface BaseNode {
  readonly kind: SurfaceNodeKind;
  readonly type: string;
  readonly props?: JsonObject;
  readonly conditions?: ConditionsDescriptor;
  readonly metadata?: JsonObject;
}

export interface FieldNode extends BaseNode {
  readonly kind: 'field';
  readonly id: string;
  readonly validation?: ValidationDescriptor[];
  readonly defaultValue?: unknown;
}

export interface ContentNode extends BaseNode {
  readonly kind: 'content';
}

export interface ActionNode extends BaseNode {
  readonly kind: 'action';
  readonly id?: string;
  readonly handler?: string;
}

export interface GroupNode extends BaseNode {
  readonly kind: 'group';
  readonly nodes: SurfaceNode[];
}

export interface SlotNode extends BaseNode {
  readonly kind: 'slot';
}

export interface ValidationDescriptor {
  readonly type: string;
  readonly message?: string;
  readonly params?: JsonObject;
}

export interface ConditionDescriptor {
  readonly field: string;
  readonly operator:
    | 'equals'
    | 'notEquals'
    | 'greaterThan'
    | 'lessThan'
    | 'greaterThanOrEqual'
    | 'lessThanOrEqual'
    | 'contains'
    | 'notContains'
    | 'in'
    | 'notIn'
    | 'exists'
    | 'notExists'
    | 'matches';
  readonly value?: unknown;
}

export interface ConditionsDescriptor {
  readonly visible?: ConditionDescriptor;
  readonly disabled?: ConditionDescriptor;
  readonly required?: ConditionDescriptor;
  readonly readonly?: ConditionDescriptor;
  readonly skippable?: ConditionDescriptor;
}

export interface JsonSchemaObject {
  readonly [key: string]: unknown;
}

export interface RegistryManifest {
  readonly version: 1;
  readonly fields?: Record<string, FieldManifestEntry>;
  readonly content?: Record<string, NodeManifestEntry>;
  readonly actions?: Record<string, ActionManifestEntry>;
  readonly groups?: Record<string, NodeManifestEntry>;
  readonly slots?: Record<string, NodeManifestEntry>;
}

export interface NodeManifestEntry {
  readonly kind: SurfaceNodeKind;
  readonly propsSchema?: JsonSchemaObject;
  readonly description?: string;
  readonly examples?: unknown[];
  readonly capabilities?: JsonObject;
}

export interface FieldManifestEntry extends NodeManifestEntry {
  readonly kind: 'field';
  readonly valueSchema?: JsonSchemaObject;
  readonly validations?: string[];
}

export interface ActionManifestEntry extends NodeManifestEntry {
  readonly kind: 'action';
  readonly handlerRequired?: boolean;
}

export interface RuntimeGraph {
  readonly surfaceId: string;
  readonly mode: SurfaceMode;
  readonly steps: RuntimeStep[];
  readonly indexes: RuntimeGraphIndexes;
}

export interface RuntimeStep {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly metadata?: JsonObject;
  readonly conditions?: ConditionsDescriptor;
  readonly nodes: SurfaceNode[];
  readonly implicit?: boolean;
}

export interface RuntimeGraphIndexes {
  readonly fields: Record<string, FieldNode>;
  readonly actions: Record<string, ActionNode>;
  readonly nodesByPath: Record<string, SurfaceNode | SurfaceStep>;
}

export interface CompiledSurface {
  readonly graph: RuntimeGraph;
}
```

- [ ] **Step 4: Implement initial Zod schema guards**

Add `packages/schema/src/schemas.ts`:

```ts
import { z } from 'zod';
import type { RegistryManifest, SurfaceSchema } from './types';

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const validationDescriptorSchema = z
  .object({
    type: z.string().min(1),
    message: z.string().optional(),
    params: jsonObjectSchema.optional(),
  })
  .strict();

export const conditionDescriptorSchema = z
  .object({
    field: z.string().min(1),
    operator: z.enum([
      'equals',
      'notEquals',
      'greaterThan',
      'lessThan',
      'greaterThanOrEqual',
      'lessThanOrEqual',
      'contains',
      'notContains',
      'in',
      'notIn',
      'exists',
      'notExists',
      'matches',
    ]),
    value: z.unknown().optional(),
  })
  .strict();

export const conditionsDescriptorSchema = z
  .object({
    visible: conditionDescriptorSchema.optional(),
    disabled: conditionDescriptorSchema.optional(),
    required: conditionDescriptorSchema.optional(),
    readonly: conditionDescriptorSchema.optional(),
    skippable: conditionDescriptorSchema.optional(),
  })
  .strict();

const baseNodeSchema = z.object({
  type: z.string().min(1),
  props: jsonObjectSchema.optional(),
  conditions: conditionsDescriptorSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

type RecursiveNode = z.infer<typeof baseNodeSchema> & {
  kind: 'field' | 'content' | 'action' | 'group' | 'slot';
  id?: string;
  handler?: string;
  validation?: z.infer<typeof validationDescriptorSchema>[];
  defaultValue?: unknown;
  nodes?: RecursiveNode[];
};

export const surfaceNodeSchema: z.ZodType<RecursiveNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    baseNodeSchema
      .extend({
        kind: z.literal('field'),
        id: z.string().min(1),
        validation: z.array(validationDescriptorSchema).optional(),
        defaultValue: z.unknown().optional(),
      })
      .strict(),
    baseNodeSchema.extend({ kind: z.literal('content') }).strict(),
    baseNodeSchema
      .extend({
        kind: z.literal('action'),
        id: z.string().min(1).optional(),
        handler: z.string().min(1).optional(),
      })
      .strict(),
    baseNodeSchema
      .extend({
        kind: z.literal('group'),
        nodes: z.array(surfaceNodeSchema),
      })
      .strict(),
    baseNodeSchema.extend({ kind: z.literal('slot') }).strict(),
  ])
);

export const surfaceStepSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    metadata: jsonObjectSchema.optional(),
    conditions: conditionsDescriptorSchema.optional(),
    nodes: z.array(surfaceNodeSchema),
  })
  .strict();

const baseSurfaceSchema = z.object({
  version: z.literal(2),
  kind: z.literal('surface'),
  id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const screenSurfaceSchema = baseSurfaceSchema
  .extend({
    mode: z.literal('screen'),
    nodes: z.array(surfaceNodeSchema),
  })
  .strict();

export const flowSurfaceSchema = baseSurfaceSchema
  .extend({
    mode: z.literal('flow'),
    steps: z.array(surfaceStepSchema),
  })
  .strict();

export const surfaceSchema = z.discriminatedUnion('mode', [
  screenSurfaceSchema,
  flowSurfaceSchema,
]);

export function isSurfaceSchema(value: unknown): value is SurfaceSchema {
  return surfaceSchema.safeParse(value).success;
}

const jsonSchemaObjectSchema = z.record(z.string(), z.unknown());

export const nodeManifestEntrySchema = z
  .object({
    kind: z.enum(['content', 'group', 'slot']),
    propsSchema: jsonSchemaObjectSchema.optional(),
    description: z.string().optional(),
    examples: z.array(z.unknown()).optional(),
    capabilities: jsonObjectSchema.optional(),
  })
  .strict();

export const fieldManifestEntrySchema = z
  .object({
    kind: z.literal('field'),
    propsSchema: jsonSchemaObjectSchema.optional(),
    valueSchema: jsonSchemaObjectSchema.optional(),
    description: z.string().optional(),
    examples: z.array(z.unknown()).optional(),
    capabilities: jsonObjectSchema.optional(),
    validations: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const actionManifestEntrySchema = z
  .object({
    kind: z.literal('action'),
    propsSchema: jsonSchemaObjectSchema.optional(),
    description: z.string().optional(),
    examples: z.array(z.unknown()).optional(),
    capabilities: jsonObjectSchema.optional(),
    handlerRequired: z.boolean().optional(),
  })
  .strict();

export const registryManifestSchema = z
  .object({
    version: z.literal(1),
    fields: z.record(fieldManifestEntrySchema).optional(),
    content: z.record(nodeManifestEntrySchema.extend({ kind: z.literal('content') })).optional(),
    actions: z.record(actionManifestEntrySchema).optional(),
    groups: z.record(nodeManifestEntrySchema.extend({ kind: z.literal('group') })).optional(),
    slots: z.record(nodeManifestEntrySchema.extend({ kind: z.literal('slot') })).optional(),
  })
  .strict();

export function isRegistryManifest(value: unknown): value is RegistryManifest {
  return registryManifestSchema.safeParse(value).success;
}
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit public types and guards**

```bash
git add packages/schema/src/types.ts packages/schema/src/schemas.ts packages/schema/tests/schema.test.ts
git commit -m "feat(schema): define surface schema types"
```

---

### Task 3: Add Structured Errors

**Files:**
- Create: `packages/schema/src/errors.ts`
- Test: `packages/schema/tests/errors.test.ts`

- [ ] **Step 1: Write failing error tests**

Add `packages/schema/tests/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ManifestValidationError,
  RuntimeExecutionError,
  SchemaValidationError,
  formatJsonPath,
} from '../src/errors';

describe('formatJsonPath', () => {
  it('formats root paths', () => {
    expect(formatJsonPath([])).toBe('');
  });

  it('formats nested object and array paths', () => {
    expect(formatJsonPath(['steps', 2, 'nodes', 0, 'props', 'options', 3, 'value'])).toBe(
      'steps[2].nodes[0].props.options[3].value'
    );
  });
});

describe('structured errors', () => {
  it('creates schema validation errors with code and issues', () => {
    const error = new SchemaValidationError([
      { path: ['mode'], message: 'Required', code: 'invalid_type' },
    ]);

    expect(error.name).toBe('SchemaValidationError');
    expect(error.code).toBe('SCHEMA_VALIDATION_ERROR');
    expect(error.issues[0].path).toEqual(['mode']);
    expect(error.message).toContain('[mode] Required');
  });

  it('creates manifest validation errors with code and issues', () => {
    const error = new ManifestValidationError([
      { path: ['steps', 0, 'nodes', 0, 'type'], message: 'Unknown field type "missing"' },
    ]);

    expect(error.name).toBe('ManifestValidationError');
    expect(error.code).toBe('MANIFEST_VALIDATION_ERROR');
    expect(error.message).toContain('[steps[0].nodes[0].type]');
  });

  it('creates runtime execution errors with cause metadata', () => {
    const cause = new Error('handler failed');
    const error = new RuntimeExecutionError('Action failed', {
      path: ['steps', 0],
      cause,
    });

    expect(error.name).toBe('RuntimeExecutionError');
    expect(error.code).toBe('RUNTIME_EXECUTION_ERROR');
    expect(error.path).toEqual(['steps', 0]);
    expect(error.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/errors.test.ts
```

Expected: FAIL because `errors.ts` is empty or missing.

- [ ] **Step 3: Implement structured errors**

Add `packages/schema/src/errors.ts`:

```ts
export type JsonPathSegment = string | number;
export type JsonPath = readonly JsonPathSegment[];

export interface ValidationIssue {
  readonly path: JsonPath;
  readonly message: string;
  readonly code?: string;
}

export function formatJsonPath(path: JsonPath): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    if (acc.length === 0) {
      return segment;
    }
    return `${acc}.${segment}`;
  }, '');
}

function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const path = formatJsonPath(issue.path);
      return path ? `[${path}] ${issue.message}` : issue.message;
    })
    .join('; ');
}

export class RilaySchemaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly issues: readonly ValidationIssue[]
  ) {
    super(message);
    this.name = 'RilaySchemaError';
  }
}

export class SchemaValidationError extends RilaySchemaError {
  constructor(issues: readonly ValidationIssue[]) {
    super(`Invalid surface schema: ${formatIssues(issues)}`, 'SCHEMA_VALIDATION_ERROR', issues);
    this.name = 'SchemaValidationError';
  }
}

export class ManifestValidationError extends RilaySchemaError {
  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Surface does not match registry manifest: ${formatIssues(issues)}`,
      'MANIFEST_VALIDATION_ERROR',
      issues
    );
    this.name = 'ManifestValidationError';
  }
}

export interface RuntimeExecutionErrorOptions {
  readonly path?: JsonPath;
  readonly cause?: unknown;
}

export class RuntimeExecutionError extends Error {
  readonly code = 'RUNTIME_EXECUTION_ERROR' as const;
  readonly path?: JsonPath;
  override readonly cause?: unknown;

  constructor(message: string, options: RuntimeExecutionErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'RuntimeExecutionError';
    this.path = options.path;
    this.cause = options.cause;
  }
}
```

- [ ] **Step 4: Run error tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/errors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit errors**

```bash
git add packages/schema/src/errors.ts packages/schema/tests/errors.test.ts
git commit -m "feat(schema): add structured validation errors"
```

---

### Task 4: Validate Registry Manifest Compatibility

**Files:**
- Create: `packages/schema/src/manifest.ts`
- Test: `packages/schema/tests/manifest.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Add `packages/schema/tests/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ManifestValidationError } from '../src/errors';
import { assertSurfaceMatchesManifest, getManifestEntry } from '../src/manifest';
import type { RegistryManifest, SurfaceSchema } from '../src/types';

const manifest: RegistryManifest = {
  version: 1,
  fields: {
    text: {
      kind: 'field',
      validations: ['required', 'email'],
      propsSchema: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string' },
        },
      },
    },
  },
  content: {
    callout: {
      kind: 'content',
      propsSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
      },
    },
  },
  actions: {
    submit: {
      kind: 'action',
      handlerRequired: true,
    },
  },
  groups: {
    row: {
      kind: 'group',
    },
  },
  slots: {
    'quote.stepAside': {
      kind: 'slot',
    },
  },
};

describe('getManifestEntry', () => {
  it('returns an entry for a registered field', () => {
    expect(getManifestEntry(manifest, { kind: 'field', type: 'text' })?.kind).toBe('field');
  });

  it('returns undefined for an unknown entry', () => {
    expect(getManifestEntry(manifest, { kind: 'field', type: 'missing' })).toBeUndefined();
  });
});

describe('assertSurfaceMatchesManifest', () => {
  it('accepts registered nodes and validations', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'valid',
      nodes: [
        {
          kind: 'field',
          id: 'email',
          type: 'text',
          props: { label: 'Email' },
          validation: [{ type: 'required' }, { type: 'email' }],
        },
        { kind: 'content', type: 'callout', props: { text: 'Info' } },
        { kind: 'action', type: 'submit', handler: 'submitLead' },
        { kind: 'slot', type: 'quote.stepAside' },
      ],
    };

    expect(() => assertSurfaceMatchesManifest(surface, manifest)).not.toThrow();
  });

  it('rejects unknown node types', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'invalid',
      nodes: [{ kind: 'field', id: 'name', type: 'missing' }],
    };

    expect(() => assertSurfaceMatchesManifest(surface, manifest)).toThrow(ManifestValidationError);
  });

  it('rejects validations not allowed by the field manifest', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'invalid-validation',
      nodes: [
        {
          kind: 'field',
          id: 'age',
          type: 'text',
          validation: [{ type: 'min' }],
        },
      ],
    };

    expect(() => assertSurfaceMatchesManifest(surface, manifest)).toThrow(
      /Validation "min" is not allowed/
    );
  });

  it('rejects actions that require a handler when handler is missing', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'missing-handler',
      nodes: [{ kind: 'action', type: 'submit' }],
    };

    expect(() => assertSurfaceMatchesManifest(surface, manifest)).toThrow(
      /requires a handler/
    );
  });
});
```

- [ ] **Step 2: Run failing manifest tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/manifest.test.ts
```

Expected: FAIL because `manifest.ts` is not implemented.

- [ ] **Step 3: Implement manifest compatibility validation**

Add `packages/schema/src/manifest.ts`:

```ts
import { ManifestValidationError, type JsonPath, type ValidationIssue } from './errors';
import type {
  ActionManifestEntry,
  FieldManifestEntry,
  NodeManifestEntry,
  RegistryManifest,
  SurfaceNode,
  SurfaceNodeKind,
  SurfaceSchema,
  SurfaceStep,
} from './types';

type ManifestEntry = FieldManifestEntry | ActionManifestEntry | NodeManifestEntry;

export interface ManifestEntryLookup {
  readonly kind: SurfaceNodeKind;
  readonly type: string;
}

export function getManifestEntry(
  manifest: RegistryManifest,
  lookup: ManifestEntryLookup
): ManifestEntry | undefined {
  switch (lookup.kind) {
    case 'field':
      return manifest.fields?.[lookup.type];
    case 'content':
      return manifest.content?.[lookup.type];
    case 'action':
      return manifest.actions?.[lookup.type];
    case 'group':
      return manifest.groups?.[lookup.type];
    case 'slot':
      return manifest.slots?.[lookup.type];
    default: {
      const exhaustive: never = lookup.kind;
      throw new Error(`Unhandled node kind: ${exhaustive}`);
    }
  }
}

export function assertSurfaceMatchesManifest(
  surface: SurfaceSchema,
  manifest: RegistryManifest
): void {
  const issues: ValidationIssue[] = [];

  if (surface.mode === 'screen') {
    visitNodes(surface.nodes, ['nodes'], manifest, issues);
  } else {
    surface.steps.forEach((step, stepIndex) => {
      visitStep(step, ['steps', stepIndex], manifest, issues);
    });
  }

  if (issues.length > 0) {
    throw new ManifestValidationError(issues);
  }
}

function visitStep(
  step: SurfaceStep,
  path: JsonPath,
  manifest: RegistryManifest,
  issues: ValidationIssue[]
): void {
  visitNodes(step.nodes, [...path, 'nodes'], manifest, issues);
}

function visitNodes(
  nodes: readonly SurfaceNode[],
  path: JsonPath,
  manifest: RegistryManifest,
  issues: ValidationIssue[]
): void {
  nodes.forEach((node, index) => {
    visitNode(node, [...path, index], manifest, issues);
  });
}

function visitNode(
  node: SurfaceNode,
  path: JsonPath,
  manifest: RegistryManifest,
  issues: ValidationIssue[]
): void {
  const entry = getManifestEntry(manifest, node);

  if (!entry) {
    issues.push({
      path: [...path, 'type'],
      message: `Unknown ${node.kind} type "${node.type}"`,
      code: 'unknown_node_type',
    });
  } else if (entry.kind !== node.kind) {
    issues.push({
      path: [...path, 'kind'],
      message: `Manifest entry "${node.type}" has kind "${entry.kind}", not "${node.kind}"`,
      code: 'node_kind_mismatch',
    });
  }

  if (node.kind === 'field' && entry?.kind === 'field') {
    const allowed = new Set(entry.validations ?? []);
    for (const [validationIndex, validation] of (node.validation ?? []).entries()) {
      if (!allowed.has(validation.type)) {
        issues.push({
          path: [...path, 'validation', validationIndex, 'type'],
          message: `Validation "${validation.type}" is not allowed for field type "${node.type}"`,
          code: 'validation_not_allowed',
        });
      }
    }
  }

  if (node.kind === 'action' && entry?.kind === 'action' && entry.handlerRequired && !node.handler) {
    issues.push({
      path: [...path, 'handler'],
      message: `Action "${node.type}" requires a handler`,
      code: 'action_handler_required',
    });
  }

  if (node.kind === 'group') {
    visitNodes(node.nodes, [...path, 'nodes'], manifest, issues);
  }
}
```

- [ ] **Step 4: Run manifest tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/manifest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit manifest validation**

```bash
git add packages/schema/src/manifest.ts packages/schema/tests/manifest.test.ts
git commit -m "feat(schema): validate surfaces against manifest"
```

---

### Task 5: Add RuntimeGraph Normalization

**Files:**
- Create: `packages/schema/src/normalize.ts`
- Test: `packages/schema/tests/compiler.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Add `packages/schema/tests/compiler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeSurface } from '../src/normalize';
import type { SurfaceSchema } from '../src/types';

describe('normalizeSurface', () => {
  it('normalizes screen surfaces into one implicit step', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'summary',
      nodes: [{ kind: 'field', id: 'email', type: 'text' }],
    };

    const graph = normalizeSurface(surface);

    expect(graph.surfaceId).toBe('summary');
    expect(graph.mode).toBe('screen');
    expect(graph.steps).toHaveLength(1);
    expect(graph.steps[0].id).toBe('__screen');
    expect(graph.steps[0].implicit).toBe(true);
    expect(graph.indexes.fields.email.type).toBe('text');
    expect(graph.indexes.nodesByPath['steps[0].nodes[0]']).toEqual(surface.nodes[0]);
  });

  it('preserves declared flow steps', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'flow',
      id: 'quote',
      steps: [
        {
          id: 'identity',
          title: 'Identity',
          nodes: [{ kind: 'field', id: 'email', type: 'text' }],
        },
        {
          id: 'submit',
          nodes: [{ kind: 'action', id: 'submitAction', type: 'submit', handler: 'submitLead' }],
        },
      ],
    };

    const graph = normalizeSurface(surface);

    expect(graph.mode).toBe('flow');
    expect(graph.steps.map((step) => step.id)).toEqual(['identity', 'submit']);
    expect(graph.indexes.fields.email.id).toBe('email');
    expect(graph.indexes.actions.submitAction.type).toBe('submit');
  });

  it('indexes nested group fields', () => {
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'grouped',
      nodes: [
        {
          kind: 'group',
          type: 'row',
          nodes: [
            { kind: 'field', id: 'firstName', type: 'text' },
            { kind: 'field', id: 'lastName', type: 'text' },
          ],
        },
      ],
    };

    const graph = normalizeSurface(surface);

    expect(Object.keys(graph.indexes.fields)).toEqual(['firstName', 'lastName']);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[1]']).toEqual({
      kind: 'field',
      id: 'lastName',
      type: 'text',
    });
  });
});
```

- [ ] **Step 2: Run failing compiler test**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/compiler.test.ts
```

Expected: FAIL because `normalizeSurface` is not implemented.

- [ ] **Step 3: Implement normalization**

Add `packages/schema/src/normalize.ts`:

```ts
import { formatJsonPath, type JsonPath } from './errors';
import type {
  ActionNode,
  FieldNode,
  RuntimeGraph,
  RuntimeGraphIndexes,
  RuntimeStep,
  SurfaceNode,
  SurfaceSchema,
  SurfaceStep,
} from './types';

export function normalizeSurface(surface: SurfaceSchema): RuntimeGraph {
  const steps = normalizeSteps(surface);
  const indexes = buildIndexes(steps);

  return {
    surfaceId: surface.id,
    mode: surface.mode,
    steps,
    indexes,
  };
}

function normalizeSteps(surface: SurfaceSchema): RuntimeStep[] {
  if (surface.mode === 'screen') {
    return [
      {
        id: '__screen',
        title: surface.title,
        description: surface.description,
        metadata: surface.metadata,
        nodes: surface.nodes,
        implicit: true,
      },
    ];
  }

  return surface.steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    metadata: step.metadata,
    conditions: step.conditions,
    nodes: step.nodes,
  }));
}

function buildIndexes(steps: readonly RuntimeStep[]): RuntimeGraphIndexes {
  const fields: Record<string, FieldNode> = {};
  const actions: Record<string, ActionNode> = {};
  const nodesByPath: Record<string, SurfaceNode | SurfaceStep> = {};

  steps.forEach((step, stepIndex) => {
    nodesByPath[formatJsonPath(['steps', stepIndex])] = step;
    visitNodes(step.nodes, ['steps', stepIndex, 'nodes'], fields, actions, nodesByPath);
  });

  return { fields, actions, nodesByPath };
}

function visitNodes(
  nodes: readonly SurfaceNode[],
  path: JsonPath,
  fields: Record<string, FieldNode>,
  actions: Record<string, ActionNode>,
  nodesByPath: Record<string, SurfaceNode | SurfaceStep>
): void {
  nodes.forEach((node, index) => {
    const nodePath = [...path, index];
    nodesByPath[formatJsonPath(nodePath)] = node;

    if (node.kind === 'field') {
      fields[node.id] = node;
    }

    if (node.kind === 'action' && node.id) {
      actions[node.id] = node;
    }

    if (node.kind === 'group') {
      visitNodes(node.nodes, [...nodePath, 'nodes'], fields, actions, nodesByPath);
    }
  });
}
```

- [ ] **Step 4: Run compiler tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/compiler.test.ts
```

Expected: PASS for normalization tests.

- [ ] **Step 5: Commit normalization**

```bash
git add packages/schema/src/normalize.ts packages/schema/tests/compiler.test.ts
git commit -m "feat(schema): normalize surfaces to runtime graph"
```

---

### Task 6: Implement `compileSurface()`

**Files:**
- Create: `packages/schema/src/compiler.ts`
- Modify: `packages/schema/tests/compiler.test.ts`

- [ ] **Step 1: Add failing compiler API tests**

Append to `packages/schema/tests/compiler.test.ts`:

```ts
import { ManifestValidationError, SchemaValidationError } from '../src/errors';
import { compileSurface } from '../src/compiler';
import type { RegistryManifest } from '../src/types';

const basicManifest: RegistryManifest = {
  version: 1,
  fields: {
    text: {
      kind: 'field',
      validations: ['required', 'email'],
    },
  },
  content: {
    callout: {
      kind: 'content',
    },
  },
  actions: {
    submit: {
      kind: 'action',
      handlerRequired: true,
    },
  },
  groups: {
    row: {
      kind: 'group',
    },
  },
};

describe('compileSurface', () => {
  it('validates schema, validates manifest compatibility, and returns a graph', () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'lead',
        nodes: [
          {
            kind: 'field',
            id: 'email',
            type: 'text',
            validation: [{ type: 'required' }],
          },
          {
            kind: 'action',
            id: 'submit',
            type: 'submit',
            handler: 'submitLead',
          },
        ],
      },
      basicManifest
    );

    expect(compiled.graph.surfaceId).toBe('lead');
    expect(compiled.graph.indexes.fields.email.type).toBe('text');
    expect(compiled.graph.indexes.actions.submit.handler).toBe('submitLead');
  });

  it('throws SchemaValidationError for invalid surface shape', () => {
    expect(() =>
      compileSurface(
        {
          version: 2,
          kind: 'surface',
          mode: 'screen',
          id: 'bad',
          steps: [],
        },
        basicManifest
      )
    ).toThrow(SchemaValidationError);
  });

  it('throws ManifestValidationError for unknown field type', () => {
    expect(() =>
      compileSurface(
        {
          version: 2,
          kind: 'surface',
          mode: 'screen',
          id: 'bad',
          nodes: [{ kind: 'field', id: 'email', type: 'missing' }],
        },
        basicManifest
      )
    ).toThrow(ManifestValidationError);
  });
});
```

- [ ] **Step 2: Run failing compiler API tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/compiler.test.ts
```

Expected: FAIL because `compileSurface` is not implemented.

- [ ] **Step 3: Implement compiler**

Add `packages/schema/src/compiler.ts`:

```ts
import type { z } from 'zod';
import { SchemaValidationError, type ValidationIssue } from './errors';
import { assertSurfaceMatchesManifest } from './manifest';
import { normalizeSurface } from './normalize';
import { registryManifestSchema, surfaceSchema } from './schemas';
import type { CompiledSurface, RegistryManifest, SurfaceSchema } from './types';

export function compileSurface(
  rawSurface: unknown,
  rawManifest: unknown
): CompiledSurface {
  const surface = parseSurface(rawSurface);
  const manifest = parseManifest(rawManifest);

  assertSurfaceMatchesManifest(surface, manifest);

  return {
    graph: normalizeSurface(surface),
  };
}

function parseSurface(rawSurface: unknown): SurfaceSchema {
  const result = surfaceSchema.safeParse(rawSurface);
  if (!result.success) {
    throw new SchemaValidationError(zodIssuesToValidationIssues(result.error.issues));
  }
  return result.data as SurfaceSchema;
}

function parseManifest(rawManifest: unknown): RegistryManifest {
  const result = registryManifestSchema.safeParse(rawManifest);
  if (!result.success) {
    throw new SchemaValidationError(zodIssuesToValidationIssues(result.error.issues));
  }
  return result.data as RegistryManifest;
}

function zodIssuesToValidationIssues(issues: z.ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
}
```

- [ ] **Step 4: Run compiler tests**

Run:

```bash
pnpm --filter @rilaykit/schema test -- tests/compiler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all schema package tests**

Run:

```bash
pnpm --filter @rilaykit/schema test
```

Expected: PASS for `schema.test.ts`, `manifest.test.ts`, `compiler.test.ts`, and `errors.test.ts`.

- [ ] **Step 6: Commit compiler**

```bash
git add packages/schema/src/compiler.ts packages/schema/tests/compiler.test.ts
git commit -m "feat(schema): compile surfaces with manifest validation"
```

---

### Task 7: Add Build And Workspace Verification

**Files:**
- Modify: `packages/schema/src/index.ts`
- Test: package build output.

- [ ] **Step 1: Verify public exports**

Ensure `packages/schema/src/index.ts` contains:

```ts
export * from './types';
export * from './errors';
export * from './schemas';
export * from './manifest';
export * from './normalize';
export * from './compiler';
```

- [ ] **Step 2: Run type-check**

Run:

```bash
pnpm --filter @rilaykit/schema type-check
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run package build**

Run:

```bash
pnpm --filter @rilaykit/schema build
```

Expected: PASS and `packages/schema/dist/index.d.ts`, `index.js`, and `index.mjs` are generated.

- [ ] **Step 4: Run package tests again**

Run:

```bash
pnpm --filter @rilaykit/schema test
```

Expected: PASS.

- [ ] **Step 5: Run repo check for touched package**

Run:

```bash
pnpm --filter @rilaykit/schema lint
```

Expected: PASS. If Biome reports formatting differences, run:

```bash
pnpm --filter @rilaykit/schema lint:fix
pnpm --filter @rilaykit/schema lint
```

Expected after fix: PASS.

- [ ] **Step 6: Commit verification fixes**

If Step 5 changed formatting:

```bash
git add packages/schema
git commit -m "style(schema): format schema package"
```

If Step 5 changed nothing, skip this commit step.

---

### Task 8: Add Phase 1 Documentation

**Files:**
- Create: `packages/schema/README.md`
- Modify: `README.md`

- [ ] **Step 1: Add schema package README**

Add `packages/schema/README.md`:

```md
# @rilaykit/schema

Portable JSON schemas, registry manifests, structured errors, and compiler utilities for Rilay v2 surfaces.

This package has no React dependency. Backend services, builders, LLM tooling, tests, and frontend runtimes can use it to validate and compile generated interactive surfaces.

## Core Concepts

- `SurfaceSchema`: strict JSON contract for generated screens and flows.
- `RegistryManifest`: portable manifest that describes allowed nodes, props, validations, actions, groups, and slots.
- `compileSurface(surface, manifest)`: validates a surface against a manifest and returns a normalized `RuntimeGraph`.
- `RuntimeGraph`: React-free graph consumed by future runtime and renderer packages.

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

console.log(compiled.graph.surfaceId);
```
```

- [ ] **Step 2: Add a short root README note**

In `README.md`, add this section after the package table:

```md
## Rilay v2 Direction

Rilay v2 is being designed around `SurfaceSchema`: a JSON-first contract for generated interactive screens and flows. The first foundation package is `@rilaykit/schema`, which validates portable surface JSON against registry manifests and compiles it into a React-free runtime graph.
```

- [ ] **Step 3: Run docs-related lint for changed files**

Run:

```bash
pnpm check docs/superpowers/plans/2026-06-16-rilay-v2-schema-compiler.md packages/schema/README.md README.md
```

Expected: PASS or only unsupported-path messages from the repo tooling. If Biome reports markdown formatting issues, run:

```bash
pnpm check:fix docs/superpowers/plans/2026-06-16-rilay-v2-schema-compiler.md packages/schema/README.md README.md
```

- [ ] **Step 4: Commit docs**

```bash
git add packages/schema/README.md README.md
git commit -m "docs(schema): document surface compiler foundation"
```

---

### Task 9: Final Verification

**Files:**
- All files created or modified in Tasks 1-8.

- [ ] **Step 1: Run schema package test suite**

Run:

```bash
pnpm --filter @rilaykit/schema test
```

Expected: PASS.

- [ ] **Step 2: Run schema package type-check**

Run:

```bash
pnpm --filter @rilaykit/schema type-check
```

Expected: PASS.

- [ ] **Step 3: Run schema package build**

Run:

```bash
pnpm --filter @rilaykit/schema build
```

Expected: PASS.

- [ ] **Step 4: Run schema package lint**

Run:

```bash
pnpm --filter @rilaykit/schema lint
```

Expected: PASS.

- [ ] **Step 5: Check git status**

Run:

```bash
git status --short
```

Expected: only intentionally untracked `.superpowers/` files from brainstorming may remain. No source, test, README, package, or lockfile changes should be unstaged.

- [ ] **Step 6: Create final commit if verification changed files**

If verification changed tracked files:

```bash
git add packages/schema README.md pnpm-lock.yaml
git commit -m "chore(schema): finalize compiler foundation"
```

If verification changed nothing, skip this commit.

---

## Self-Review

Spec coverage:

- `SurfaceSchema` JSON contract: Tasks 2 and 6.
- `screen` and `flow` modes: Tasks 2, 5, and 6.
- `FieldNode`, `ContentNode`, `ActionNode`, `GroupNode`, `SlotNode`: Task 2.
- `RegistryManifest`: Tasks 2 and 4.
- `compileSurface(surface, manifest)`: Task 6.
- Internal normalization to `RuntimeGraph`: Task 5.
- Structured errors with JSON paths: Task 3.
- Backend/AI foundation: Tasks 4, 6, and 8.
- React runtime, core execution runtime, and preset-basic: intentionally deferred to subsequent phase plans.

Placeholder scan:

- This plan does not use placeholder implementation steps.
- Every code-changing step includes concrete file content or concrete snippets.
- Later phases are explicitly named as separate plans, not left as hidden work inside this plan.

Type consistency:

- Public API names are consistent: `SurfaceSchema`, `RegistryManifest`, `RuntimeGraph`, `CompiledSurface`, `compileSurface`, `normalizeSurface`.
- Error names are consistent: `SchemaValidationError`, `ManifestValidationError`, `RuntimeExecutionError`.
- Node kind names are consistent: `field`, `content`, `action`, `group`, `slot`.
