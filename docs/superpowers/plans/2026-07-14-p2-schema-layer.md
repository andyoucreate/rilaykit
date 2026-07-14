# P2 — Schema Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the JSON-pivot schema layer: rename `fromSchema`→`compileForm` (with `bindings` + streaming-friendly per-field defaults), add `FlowSchema`+`compileFlow` (the workflow mirror), and make dynamic building fully typed against the catalog's component union (kill the `any` gap).

**Architecture:** The schema layer stays a thin front-end over the existing builders (compileForm drives `form.create().add()`, compileFlow drives `flow.create().addStep()` compiling each step's FormSchema via compileForm). Non-serializable logic (validators, effect handlers, allowSkip predicates, after handlers) is referenced BY STRING KEY in JSON and resolved from consumer-supplied `bindings` — exactly the existing `SchemaRegistry` indirection, generalized. Zero builder-logic duplication.

**Tech Stack:** TypeScript strict, Standard Schema (`@standard-schema/spec`), zod (tests), vitest + jsdom, biome, turbo/pnpm. Branch `claude/rilaykit-agent-refactor-6015f4` (post-P1, 1534 tests green).

## Global Constraints

- Stay on branch `claude/rilaykit-agent-refactor-6015f4`. NEVER `git checkout -b`/`git switch -c`. Verify `git branch --show-current` before each commit.
- Never `throw new Error(...)` — structural schema errors use the existing `SchemaValidationError` (forms/schema/types.ts, `code='SCHEMA_VALIDATION_ERROR'`, `issues: SchemaIssue[]`); resolution errors use core typed errors (`InvalidSchemaError`, `NotFoundError`). Do NOT migrate `SchemaValidationError` into the core hierarchy (it has a published contract; keep the two families as P1 left them).
- No `console.*` (use `getLogger` from `@rilaykit/core`). No `any` — killing `any` is a design goal; `unknown` over `any`. `function` for declarations, arrows for callbacks. Strict TS.
- Dependency direction: `workflow → forms → core`. Core never imports forms/workflow. `compileFlow` lives in workflow and imports `compileForm` from forms.
- TDD every task: red → watch fail for the right reason → green. Exact assertions (`toEqual`/`toBe`), never `toBeDefined`/`not.toThrow` where an exact value exists. Error paths are first-class tests. Real `ril`/bindings fixtures, never mocked.
- Commands from repo root. Test: `pnpm vitest run <path>`. Typecheck: `pnpm type-check`. Type-level tests: `packages/**/*.test-d.tsx`. Conventional commits.
- Backward-compat during migration: keep `fromSchema` + `SchemaRegistry` as deprecated aliases delegating to the new names (removed later, not in P2).
- Serialized conditions constraint: `matches()` MUST use a string pattern in a schema (a `RegExp` literal does not JSON-round-trip — conditions/index.ts:132). Schema validation flags a non-string `matches` value.

## File Structure (end state)

```
packages/forms/src/schema/
  types.ts            MOD  + per-field `default?` on FormSchemaField; + `Bindings` (rename of SchemaRegistry, alias kept); FieldConfigFor re-exported from core
  compile-form.ts     NEW  compileForm (renamed fromSchema) + options { bindings }; keeps fromSchema deprecated alias
  from-schema.ts      MOD  becomes a thin deprecated re-export shim → compile-form.ts
  validate-schema.ts  (stays inside compile-form or its own file) structural validation + matches-string check + optional prop validation
  index.ts            MOD  export compileForm/Bindings/isFormSchema/... + keep deprecated fromSchema/SchemaRegistry
packages/core/src/
  types/catalog.ts    MOD  + exported `FieldConfigFor<C>` union type (typed dynamic field config)
  index.ts            MOD  export FieldConfigFor
packages/workflow/src/schema/          NEW directory
  flow-schema-types.ts NEW  FlowSchema, FlowSchemaStep, FlowBindings (extends forms Bindings + allowSkip/after)
  compile-flow.ts      NEW  compileFlow(schema, catalog, { bindings }) → WorkflowConfig
  validate-flow-schema.ts NEW  structural validation → SchemaValidationError
  index.ts             NEW  exports
packages/workflow/src/index.ts  MOD  export * from './schema'
packages/rilaykit/src/index.ts  MOD  (transitive via forms/workflow export *) — verify surface
docs/superpowers/plans/2026-07-14-p2-proof-matrix.md  NEW (Task 9)
```

---

### Task 1: `Bindings` rename + `compileForm` (fromSchema kept as deprecated alias)

**Files:**
- Create: `packages/forms/src/schema/compile-form.ts`
- Modify: `packages/forms/src/schema/types.ts` (add `Bindings`), `packages/forms/src/schema/from-schema.ts` (shim), `packages/forms/src/schema/index.ts`
- Test: `packages/forms/tests/schema/compile-form.test.ts`

**Interfaces:**
- Consumes: existing `fromSchema<C>(schema, config, registry?)` body (from-schema.ts:98) — moved verbatim into `compileForm`, only the options shape changes.
- Produces:
  - `type Bindings = { validators?: Record<string, CustomValidatorFactory>; effects?: Record<string, SchemaEffectHandler> }` (identical to `SchemaRegistry`; `SchemaRegistry` becomes `= Bindings` deprecated alias).
  - `type CompileFormOptions = { bindings?: Bindings }`
  - `function compileForm<C extends Record<string, any>>(schema: FormSchema, catalog: RilayInstance<C>, options?: CompileFormOptions): FormSchemaResult<C>` — same return `{ formConfig, defaultValues? }`.
  - `fromSchema<C>(schema, config, registry?)` kept as `@deprecated` delegating to `compileForm(schema, config, { bindings: registry })`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forms/tests/schema/compile-form.test.ts
import { describe, expect, it } from 'vitest';
import React from 'react';
import { ril } from '@rilaykit/core';
import { compileForm, fromSchema, type Bindings } from '@rilaykit/forms';

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

describe('compileForm', () => {
  it('compiles a flat FormSchema through the builder and returns formConfig + defaultValues', () => {
    const schema = {
      version: 1 as const,
      id: 'login',
      fields: [{ id: 'email', type: 'text', props: { label: 'Email' } }],
      defaultValues: { email: 'a@b.c' },
    };
    const result = compileForm(schema, makeCatalog());
    expect(result.formConfig.id).toBe('login');
    expect(result.formConfig.allFields.map((f) => f.id)).toEqual(['email']);
    expect(result.defaultValues).toEqual({ email: 'a@b.c' });
  });

  it('resolves a registry validator through options.bindings', () => {
    const bindings: Bindings = {
      validators: { notFoo: (_p, msg) => ({ '~standard': { version: 1, vendor: 't', validate: (v) => (v === 'foo' ? { issues: [{ message: msg ?? 'no foo' }] } : { value: v }) } }) },
    };
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'name', type: 'text', validation: { rules: [{ type: 'notFoo' }] } }],
    };
    const result = compileForm(schema, makeCatalog(), { bindings });
    expect(result.formConfig.allFields[0]?.validation).toBeDefined();
  });

  it('keeps fromSchema working as a deprecated alias', () => {
    const schema = { version: 1 as const, id: 'f', fields: [{ id: 'a', type: 'text' }] };
    const result = fromSchema(schema, makeCatalog());
    expect(result.formConfig.id).toBe('f');
  });
});
```

(Verify the real `FieldSchemaValidation` shape in types.ts — the recon shows `validation: { rules: ValidationDescriptor[] }` style; mirror the exact property name used by the current `resolveFieldValidation`. Read `resolve-validation.test.ts` for the exact validation descriptor shape before finalizing the fixture.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/schema/compile-form.test.ts`
Expected: FAIL — `@rilaykit/forms` has no export `compileForm`.

- [ ] **Step 3: Write the implementation**

Create `packages/forms/src/schema/compile-form.ts`: move the entire body of `fromSchema` from `from-schema.ts` here, rename the function to `compileForm`, change the 3rd param from `registry?: SchemaRegistry` to `options?: CompileFormOptions` and read `const registry = options?.bindings` at the top (leave every internal `registry` reference unchanged). Re-export the internal helpers (`validateSchema`, `isFormSchema`, `resolveFieldValidation`, `resolveValidationDescriptor`, `normalizeToRows`, etc.) from here (move them too, or import from a shared module — keep them together with compileForm).

In `packages/forms/src/schema/types.ts` add:
```typescript
/** Consumer-supplied resolution for non-serializable schema references (validators, effect handlers). */
export type Bindings = {
  readonly validators?: Record<string, CustomValidatorFactory>;
  readonly effects?: Record<string, SchemaEffectHandler>;
};
/** @deprecated Renamed to `Bindings`. */
export type SchemaRegistry = Bindings;

export type CompileFormOptions = { readonly bindings?: Bindings };
```
(If `SchemaRegistry` is currently defined as an interface, convert it to `Bindings` and make `SchemaRegistry` the alias — update any internal `SchemaRegistry` usages to `Bindings`.)

Turn `packages/forms/src/schema/from-schema.ts` into a deprecated shim:
```typescript
import type { FormSchema, FormSchemaResult, SchemaRegistry } from './types';
import type { RilayInstance } from '@rilaykit/core';
import { compileForm } from './compile-form';

/** @deprecated Use `compileForm(schema, catalog, { bindings })`. */
export function fromSchema<C extends Record<string, any>>(
  schema: FormSchema,
  config: RilayInstance<C>,
  registry?: SchemaRegistry
): FormSchemaResult<C> {
  return compileForm(schema, config, { bindings: registry });
}
```
(Re-export the still-public helpers from from-schema.ts for back-compat, OR move all exports to compile-form.ts and re-export from index.)

Update `packages/forms/src/schema/index.ts` to export `compileForm`, `type Bindings`, `type CompileFormOptions`, keep `fromSchema` + `type SchemaRegistry` (deprecated), and the existing `isFormSchema`, `validateSchema`, `resolveFieldValidation`, `resolveValidationDescriptor`, `SchemaValidationError`, and all types.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms/tests/schema && pnpm type-check`
Expected: PASS — including the pre-existing `from-schema.test.ts`/`from-schema.hardcore.test.ts` (they still import `fromSchema`, which now delegates).

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms
git commit -m "feat(forms): rename fromSchema→compileForm with bindings option (fromSchema kept deprecated)"
```

---

### Task 2: Per-field inline `default` (streaming-friendly)

**Files:**
- Modify: `packages/forms/src/schema/types.ts` (add `default?`), `packages/forms/src/schema/compile-form.ts` (merge inline defaults)
- Test: `packages/forms/tests/schema/compile-form-defaults.test.ts`

**Interfaces:**
- Produces: `FormSchemaField` gains `readonly default?: unknown`. `compileForm` merges per-field `default` values into the returned `defaultValues` (per-field default takes precedence is decided below: top-level `defaultValues[id]` wins over field `default` when both present, because the top-level block is the explicit override; document this exactly).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forms/tests/schema/compile-form-defaults.test.ts
import { describe, expect, it } from 'vitest';
import React from 'react';
import { ril } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';

const catalog = ril.create().component('text', { name: 'T', renderer: () => React.createElement('input') });

describe('compileForm per-field inline default', () => {
  it('collects per-field `default` into defaultValues', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'a', type: 'text', default: 'A' },
        { id: 'b', type: 'text' },
      ],
    };
    const { defaultValues } = compileForm(schema, catalog);
    expect(defaultValues).toEqual({ a: 'A' });
  });

  it('top-level defaultValues overrides a per-field default for the same id', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', default: 'field' }],
      defaultValues: { a: 'top' },
    };
    const { defaultValues } = compileForm(schema, catalog);
    expect(defaultValues).toEqual({ a: 'top' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/schema/compile-form-defaults.test.ts`
Expected: FAIL — `default` ignored, first test gets `undefined`/`{}` instead of `{ a: 'A' }`.

- [ ] **Step 3: Write the implementation**

In `types.ts`, add to `FormSchemaField`: `readonly default?: unknown;`.

In `compile-form.ts`, after normalizing rows and before returning, collect inline defaults from every field (walk `schema.fields` or the normalized rows' fields, including repeatable template fields is out of scope — only top-level fields) and merge:
```typescript
const inlineDefaults: Record<string, unknown> = {};
for (const field of collectAllTopLevelFields(schema)) {
  if (field.default !== undefined) inlineDefaults[field.id] = field.default;
}
const defaultValues =
  schema.defaultValues || Object.keys(inlineDefaults).length > 0
    ? { ...inlineDefaults, ...(schema.defaultValues ?? {}) }
    : undefined;
```
(`collectAllTopLevelFields` = helper reading `schema.fields ?? rows.flatMap(fields)`; reuse the existing normalization. Top-level `defaultValues` spread LAST so it wins.) Return this merged `defaultValues` instead of the raw `schema.defaultValues`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms/tests/schema && pnpm type-check`
Expected: PASS (existing tests unaffected — they have no `default` fields, so merged result equals raw `defaultValues`).

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms
git commit -m "feat(forms): per-field inline default in FormSchema (streaming-friendly)"
```

---

### Task 3: `FieldConfigFor<C>` typed dynamic building (kill the `any` gap)

**Files:**
- Modify: `packages/core/src/types/catalog.ts` (add `FieldConfigFor<C>`), `packages/core/src/index.ts` (export), `packages/forms/src/schema/compile-form.ts` (use it in `resolveFields`)
- Test: `packages/core/tests/catalog/field-config-for.test-d.tsx` (type-level), `packages/forms/tests/schema/compile-form.test.ts` (extend)

**Interfaces:**
- Produces: `type FieldConfigFor<C> = { [K in keyof C & string]: { readonly id?: string; readonly type: K; readonly props?: Partial<C[K]>; readonly validation?: unknown; readonly conditions?: unknown; readonly effects?: unknown; readonly default?: unknown } }[keyof C & string]` — the discriminated union of valid field configs for a catalog `C`. `resolveFields` returns `FieldConfigFor<C>[]` instead of `FieldConfig<Record<string,any>, string>[]`, removing the `as any`/`as FieldConfig<C, string & keyof C>` casts (from-schema.ts:118,129,653,657,661).

- [ ] **Step 1: Write the failing type-level test**

```tsx
// packages/core/tests/catalog/field-config-for.test-d.tsx
import { describe, it, expectTypeOf } from 'vitest';
import type { FieldConfigFor } from '@rilaykit/core';

type Cat = { text: { label?: string }; num: { min?: number } };

describe('FieldConfigFor', () => {
  it('is the discriminated union of valid field configs for the catalog', () => {
    const a: FieldConfigFor<Cat> = { id: 'x', type: 'text', props: { label: 'L' } };
    const b: FieldConfigFor<Cat> = { id: 'y', type: 'num', props: { min: 1 } };
    expectTypeOf(a.type).toEqualTypeOf<'text' | 'num'>();
    // @ts-expect-error — 'ghost' is not a registered component type
    const c: FieldConfigFor<Cat> = { type: 'ghost' };
    // @ts-expect-error — label is a string, not number
    const d: FieldConfigFor<Cat> = { type: 'text', props: { label: 42 } };
    void a; void b; void c; void d;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/catalog/field-config-for.test-d.tsx`
Expected: FAIL — `@rilaykit/core` has no export `FieldConfigFor`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/types/catalog.ts`:
```typescript
/**
 * The discriminated union of valid field configs for a catalog `C` (the map
 * `{ componentType → propsType }`). Enables fully-typed dynamic/runtime field
 * building against the registered component types — no `any`.
 */
export type FieldConfigFor<C> = {
  [K in keyof C & string]: {
    readonly id?: string;
    readonly type: K;
    readonly props?: Partial<C[K]>;
    readonly validation?: unknown;
    readonly conditions?: unknown;
    readonly effects?: unknown;
    readonly default?: unknown;
  };
}[keyof C & string];
```
Export it from `packages/core/src/index.ts`.

In `compile-form.ts`, change `resolveFields` to return `FieldConfigFor<C>[]` and thread `C` through it; drop the `(resolved as any).xxx =` field mutations in favor of building the object literally-typed, and drop the `as FieldConfig<C, string & keyof C>` casts at the `.add(...)` call sites (the builder's `.add<T extends keyof C>` already accepts `FieldConfigFor<C>`-shaped items — verify the builder's `FieldConfig<C,T>` is assignable-from `FieldConfigFor<C>`; if the `validation/conditions/effects` typing differs, narrow `FieldConfigFor`'s `unknown` fields to the builder's exact types `FieldValidationConfig`/`ConditionalBehavior`/`FieldEffects` imported into catalog.ts — but core must NOT import from forms, so keep them `unknown` in core and cast ONCE at the builder boundary inside compile-form, documented). Remove the file-level `// @ts-nocheck` from the touched resolver if present.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/core packages/forms/tests/schema && pnpm type-check`
Expected: PASS. Confirm the `any`-cast count dropped: `grep -n "as any\|as FieldConfig<C" packages/forms/src/schema/compile-form.ts` → the dynamic-build casts are gone (a single documented boundary cast is acceptable).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core packages/forms
git commit -m "feat(core): FieldConfigFor<C> typed dynamic field building; kill the any gap in compileForm"
```

---

### Task 4: `FlowSchema` types + `FlowBindings`

**Files:**
- Create: `packages/workflow/src/schema/flow-schema-types.ts`
- Test: `packages/workflow/tests/schema/flow-schema-types.test-d.tsx`

**Interfaces:**
- Produces (all JSON-serializable except handlers-by-key):
  - `FlowSchema = { readonly version?: 1; readonly id: string; readonly name: string; readonly description?: string; readonly steps: FlowSchemaStep[] }`
  - `FlowSchemaStep = { readonly id: string; readonly title: string; readonly description?: string; readonly form: FormSchema; readonly conditions?: StepConditionalBehavior; readonly allowSkip?: boolean | { readonly binding: string }; readonly metadata?: Record<string, unknown>; readonly onAfterValidation?: string /* binding key */ }`
  - `type AllowSkipPredicate = (ctx: { allData: Record<string, unknown> }) => boolean`
  - `type AfterValidationHandler = StepConfig['onAfterValidation']` (imported from core types)
  - `FlowBindings = Bindings & { readonly allowSkip?: Record<string, AllowSkipPredicate>; readonly after?: Record<string, AfterValidationHandler> }` — extends the forms `Bindings` (so a single bindings object resolves field validators/effects AND step allowSkip/after).

- [ ] **Step 1: Write the failing type-level test**

```tsx
// packages/workflow/tests/schema/flow-schema-types.test-d.tsx
import { describe, it, expectTypeOf } from 'vitest';
import type { FlowSchema, FlowBindings } from '@rilaykit/workflow';

describe('FlowSchema types', () => {
  it('is a JSON-serializable flow definition with per-step FormSchema', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Onboarding',
      steps: [
        { id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] } },
        { id: 'b', title: 'B', form: { version: 1, id: 'b', fields: [] }, allowSkip: { binding: 'vipSkip' }, onAfterValidation: 'lookupCompany' },
      ],
    };
    expectTypeOf(schema.steps[0]!.form.id).toEqualTypeOf<string>();
    const bindings: FlowBindings = {
      allowSkip: { vipSkip: (ctx) => ctx.allData.vip === true },
      after: { lookupCompany: async () => {} },
    };
    void schema; void bindings;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/schema/flow-schema-types.test-d.tsx`
Expected: FAIL — no export `FlowSchema`.

- [ ] **Step 3: Write the implementation**

Create `packages/workflow/src/schema/flow-schema-types.ts`:
```typescript
import type { StepConfig, StepConditionalBehavior } from '@rilaykit/core';
import type { Bindings, FormSchema } from '@rilaykit/forms';

export type AllowSkipPredicate = (ctx: { allData: Record<string, unknown> }) => boolean;
export type AfterValidationHandler = NonNullable<StepConfig['onAfterValidation']>;

export interface FlowSchemaStep {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly form: FormSchema;
  readonly conditions?: StepConditionalBehavior;
  readonly allowSkip?: boolean | { readonly binding: string };
  readonly metadata?: Record<string, unknown>;
  readonly onAfterValidation?: string;
}

export interface FlowSchema {
  readonly version?: 1;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: FlowSchemaStep[];
}

export type FlowBindings = Bindings & {
  readonly allowSkip?: Record<string, AllowSkipPredicate>;
  readonly after?: Record<string, AfterValidationHandler>;
};

export type CompileFlowOptions = { readonly bindings?: FlowBindings };
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/workflow/tests/schema/flow-schema-types.test-d.tsx && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/workflow
git commit -m "feat(workflow): FlowSchema + FlowBindings types (JSON flow definition)"
```

---

### Task 5: `compileFlow` — the workflow mirror

**Files:**
- Create: `packages/workflow/src/schema/compile-flow.ts`
- Test: `packages/workflow/tests/schema/compile-flow.test.tsx`

**Interfaces:**
- Consumes: `compileForm` (from `@rilaykit/forms`), `flow.create(...).addStep(...).build()`, `FlowSchema`/`FlowBindings` (Task 4).
- Produces: `function compileFlow(schema: FlowSchema, catalog: RilayInstance<any>, options?: CompileFlowOptions): WorkflowConfig`. For each step: compile `step.form` via `compileForm(step.form, catalog, { bindings: options?.bindings })` → built `FormConfiguration`; resolve `allowSkip` (boolean passthrough, or `{ binding }` → `options.bindings.allowSkip[binding]` else `NotFoundError`); resolve `onAfterValidation` string → `options.bindings.after[key]` else `NotFoundError`; pass `conditions`/`metadata`/`title`/`description` through. Drives `flow.create(catalog, schema.id, schema.name, schema.description).addStep(stepDef).build()`. Zero flow-builder logic duplication.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/workflow/tests/schema/compile-flow.test.tsx
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { ril } from '@rilaykit/core';
import { compileFlow, type FlowBindings, type FlowSchema } from '@rilaykit/workflow';

const catalog = ril.create().component('text', { name: 'T', renderer: () => React.createElement('input') });

describe('compileFlow', () => {
  it('compiles a FlowSchema into a WorkflowConfig with per-step compiled forms', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Onboarding',
      steps: [
        { id: 'personal', title: 'Personal', form: { version: 1, id: 'personal', fields: [{ id: 'name', type: 'text' }] } },
        { id: 'company', title: 'Company', form: { version: 1, id: 'company', fields: [{ id: 'siren', type: 'text' }] } },
      ],
    };
    const config = compileFlow(schema, catalog);
    expect(config.id).toBe('wf');
    expect(config.name).toBe('Onboarding');
    expect(config.steps.map((s) => s.id)).toEqual(['personal', 'company']);
    expect(config.steps[0]?.formConfig.allFields.map((f) => f.id)).toEqual(['name']);
  });

  it('resolves allowSkip predicate and onAfterValidation via bindings', () => {
    const after = vi.fn();
    const bindings: FlowBindings = {
      allowSkip: { vip: (ctx) => ctx.allData.vip === true },
      after: { lookup: after },
    };
    const schema: FlowSchema = {
      version: 1, id: 'wf', name: 'W',
      steps: [{ id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [] }, allowSkip: { binding: 'vip' }, onAfterValidation: 'lookup' }],
    };
    const config = compileFlow(schema, catalog, { bindings });
    expect(typeof config.steps[0]?.allowSkip).toBe('function');
    expect(config.steps[0]?.onAfterValidation).toBe(after);
  });

  it('throws NotFoundError for an unresolved allowSkip binding', () => {
    const schema: FlowSchema = {
      version: 1, id: 'wf', name: 'W',
      steps: [{ id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [] }, allowSkip: { binding: 'missing' } }],
    };
    expect(() => compileFlow(schema, catalog)).toThrowError(/missing/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/schema/compile-flow.test.tsx`
Expected: FAIL — no export `compileFlow`.

- [ ] **Step 3: Write the implementation**

Create `packages/workflow/src/schema/compile-flow.ts`:
```typescript
import type { RilayInstance, StepConfig, WorkflowConfig } from '@rilaykit/core';
import { NotFoundError } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import { flow } from '../builders/flow';
import type { CompileFlowOptions, FlowSchema, FlowSchemaStep } from './flow-schema-types';
import { validateFlowSchema } from './validate-flow-schema';

function resolveAllowSkip(step: FlowSchemaStep, options?: CompileFlowOptions): StepConfig['allowSkip'] {
  if (step.allowSkip === undefined || typeof step.allowSkip === 'boolean') return step.allowSkip;
  const predicate = options?.bindings?.allowSkip?.[step.allowSkip.binding];
  if (!predicate) {
    throw new NotFoundError(`allowSkip binding "${step.allowSkip.binding}" not found for step "${step.id}"`, { binding: step.allowSkip.binding });
  }
  return predicate;
}

function resolveAfter(step: FlowSchemaStep, options?: CompileFlowOptions): StepConfig['onAfterValidation'] {
  if (!step.onAfterValidation) return undefined;
  const handler = options?.bindings?.after?.[step.onAfterValidation];
  if (!handler) {
    throw new NotFoundError(`onAfterValidation binding "${step.onAfterValidation}" not found for step "${step.id}"`, { binding: step.onAfterValidation });
  }
  return handler;
}

export function compileFlow(
  schema: FlowSchema,
  catalog: RilayInstance<Record<string, unknown>>,
  options?: CompileFlowOptions
): WorkflowConfig {
  validateFlowSchema(schema, catalog);
  let builder = flow.create(catalog as never, schema.id, schema.name, schema.description);
  for (const step of schema.steps) {
    const { formConfig } = compileForm(step.form, catalog, { bindings: options?.bindings });
    builder = builder.addStep({
      id: step.id,
      title: step.title,
      description: step.description,
      formConfig,
      conditions: step.conditions,
      allowSkip: resolveAllowSkip(step, options),
      metadata: step.metadata,
      onAfterValidation: resolveAfter(step, options),
    });
  }
  return builder.build();
}
```
(Confirm `flow.create`'s param type accepts the plain catalog — recon shows `ril<any>`; the `as never` bridges the generic. Confirm `.addStep` accepts this StepDefinition shape.)

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/workflow/tests/schema && pnpm type-check`
Expected: PASS (after Task 6's `validateFlowSchema` exists — if writing Task 5 first, stub `validateFlowSchema` as a no-op then implement in Task 6; OR reorder so Task 6 lands first. Recommended: implement Task 6's validate-flow-schema.ts in this same task if the no-op stub bothers the reviewer).

- [ ] **Step 5: Commit**

```bash
git add -A packages/workflow
git commit -m "feat(workflow): compileFlow compiles FlowSchema to WorkflowConfig via compileForm + bindings"
```

---

### Task 6: `validateFlowSchema` (structural validation + matches-string guard)

**Files:**
- Create: `packages/workflow/src/schema/validate-flow-schema.ts`
- Test: `packages/workflow/tests/schema/validate-flow-schema.test.ts`

**Interfaces:**
- Produces: `function validateFlowSchema(schema: FlowSchema, catalog: RilayInstance<any>): void` — throws `SchemaValidationError` (imported from `@rilaykit/forms`) with `issues` on: missing `id`/`name`, empty/duplicate step ids, a step whose `form` fails `validateSchema` (delegate to forms' `validateSchema`, prefixing issue paths with `steps[i].form.`), a `conditions` tree using `matches` with a non-string value (not JSON-serializable), a null/non-object step entry. `isFlowSchema(value): value is FlowSchema` type guard.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/workflow/tests/schema/validate-flow-schema.test.ts
import { describe, expect, it } from 'vitest';
import React from 'react';
import { ril } from '@rilaykit/core';
import { validateFlowSchema, isFlowSchema } from '@rilaykit/workflow';
import { SchemaValidationError } from '@rilaykit/forms';

const catalog = ril.create().component('text', { name: 'T', renderer: () => React.createElement('input') });

describe('validateFlowSchema', () => {
  it('accepts a valid flow schema', () => {
    expect(() =>
      validateFlowSchema(
        { version: 1, id: 'wf', name: 'W', steps: [{ id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] } }] },
        catalog
      )
    ).not.toThrow();
  });

  it('throws SchemaValidationError on duplicate step ids', () => {
    expect(() =>
      validateFlowSchema(
        { version: 1, id: 'wf', name: 'W', steps: [
          { id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [] } },
          { id: 'a', title: 'A2', form: { version: 1, id: 'a2', fields: [] } },
        ] },
        catalog
      )
    ).toThrowError(SchemaValidationError);
  });

  it('throws SchemaValidationError when a step form references an unknown component', () => {
    expect(() =>
      validateFlowSchema(
        { version: 1, id: 'wf', name: 'W', steps: [{ id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'ghost' }] } }] },
        catalog
      )
    ).toThrowError(SchemaValidationError);
  });

  it('isFlowSchema guards structurally', () => {
    expect(isFlowSchema({ id: 'w', name: 'W', steps: [] })).toBe(true);
    expect(isFlowSchema({ id: 'w' })).toBe(false);
    expect(isFlowSchema(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/schema/validate-flow-schema.test.ts`
Expected: FAIL — no export `validateFlowSchema`.

- [ ] **Step 3: Write the implementation**

Create `packages/workflow/src/schema/validate-flow-schema.ts`. Import `validateSchema`, `SchemaValidationError` from `@rilaykit/forms`. Build a `SchemaIssue[]`; push `{ path, message, severity: 'error' }` for each structural problem; for each step call forms' `validateSchema(step.form, catalog, ...)` inside a try/catch, and on a caught `SchemaValidationError` re-map its `issues` with `path` prefixed `steps[i].form.` into the aggregate. Walk `conditions` recursively; if any node has `operator === 'matches'` and `typeof value !== 'string'`, push an issue (`matches must use a string pattern in a serialized schema`). At the end, if any `severity: 'error'` issue exists, `throw new SchemaValidationError('Invalid flow schema', issues)`. Add `isFlowSchema(value): value is FlowSchema` checking object shape (`id`/`name` strings, `steps` array).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/workflow/tests/schema && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/workflow
git commit -m "feat(workflow): validateFlowSchema + isFlowSchema (typed structural validation)"
```

---

### Task 7: Optional prop validation in `compileForm` against `propsSchema`

**Files:**
- Modify: `packages/forms/src/schema/compile-form.ts`, `packages/forms/src/schema/types.ts` (option flag)
- Test: `packages/forms/tests/schema/compile-form-props-validation.test.ts`

**Interfaces:**
- Produces: `CompileFormOptions` gains `readonly validateProps?: boolean` (default false — behavior unchanged unless opted in). When true, compileForm calls `catalog.validateProps(field.type, field.props ?? {})` for each field whose component has a `propsSchema`; on failure it accumulates a `SchemaValidationError` issue (`path: field.id`, the `issues[].message`), throwing at the end if any. (This is the self-correction hook P3 uses when an agent emits invalid props.)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forms/tests/schema/compile-form-props-validation.test.ts
import { describe, expect, it } from 'vitest';
import React from 'react';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { compileForm, SchemaValidationError } from '@rilaykit/forms';

const catalog = ril.create().component('select', {
  name: 'Select',
  propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
  renderer: () => React.createElement('select'),
});

describe('compileForm validateProps option', () => {
  it('passes valid props', () => {
    const schema = { version: 1 as const, id: 'f', fields: [{ id: 's', type: 'select', props: { label: 'L', options: ['a'] } }] };
    expect(() => compileForm(schema, catalog, { validateProps: true })).not.toThrow();
  });

  it('throws SchemaValidationError on invalid props when validateProps:true', () => {
    const schema = { version: 1 as const, id: 'f', fields: [{ id: 's', type: 'select', props: { label: 42 } }] };
    expect(() => compileForm(schema, catalog, { validateProps: true })).toThrowError(SchemaValidationError);
  });

  it('ignores prop errors when validateProps is not set (default)', () => {
    const schema = { version: 1 as const, id: 'f', fields: [{ id: 's', type: 'select', props: { label: 42 } }] };
    expect(() => compileForm(schema, catalog)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/schema/compile-form-props-validation.test.ts`
Expected: FAIL — `validateProps:true` currently does nothing → second test does not throw.

- [ ] **Step 3: Write the implementation**

Add `readonly validateProps?: boolean` to `CompileFormOptions`. In `compile-form.ts`, after collecting fields and before/at build, when `options?.validateProps` is true, for each field call `catalog.validateProps(field.type, field.props ?? {})`; if `result.success === false`, push each `result.issues` message as a `SchemaIssue` (`path: field.id`). Aggregate and `throw new SchemaValidationError('Invalid field props', issues)` if any. Skip fields whose component has no `propsSchema` (validateProps returns success for those). Wrap the `catalog.validateProps` call to tolerate `NotFoundError` (unknown type already caught by validateSchema).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms/tests/schema && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms
git commit -m "feat(forms): optional compileForm prop validation against propsSchema"
```

---

### Task 8: Exports + all-in-one surface

**Files:**
- Create: `packages/workflow/src/schema/index.ts`
- Modify: `packages/workflow/src/index.ts`, verify `packages/rilaykit/src/index.ts`
- Test: `packages/workflow/tests/schema/surface.test.ts`, `packages/rilaykit/tests/surface.test.ts` (extend)

**Interfaces:**
- Produces: `@rilaykit/workflow` exports `compileFlow`, `validateFlowSchema`, `isFlowSchema`, and all Task-4 types (`FlowSchema`, `FlowSchemaStep`, `FlowBindings`, `CompileFlowOptions`, `AllowSkipPredicate`, `AfterValidationHandler`). The all-in-one `rilaykit` re-exports the full schema surface (compileForm + compileFlow + Bindings + FlowSchema + FieldConfigFor).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/workflow/tests/schema/surface.test.ts
import { describe, expect, it } from 'vitest';
import * as wf from '@rilaykit/workflow';
import * as kit from 'rilaykit';

describe('schema public surface', () => {
  it('workflow exports the flow-schema API', () => {
    expect(typeof wf.compileFlow).toBe('function');
    expect(typeof wf.validateFlowSchema).toBe('function');
    expect(typeof wf.isFlowSchema).toBe('function');
  });
  it('rilaykit all-in-one re-exports compileForm and compileFlow', () => {
    expect(typeof kit.compileForm).toBe('function');
    expect(typeof kit.compileFlow).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/schema/surface.test.ts`
Expected: FAIL — `wf.compileFlow` undefined.

- [ ] **Step 3: Write the implementation**

Create `packages/workflow/src/schema/index.ts` exporting everything from `compile-flow.ts`, `validate-flow-schema.ts`, `flow-schema-types.ts`. Add `export * from './schema';` to `packages/workflow/src/index.ts`. Verify `packages/rilaykit/src/index.ts` re-exports transitively (`export * from '@rilaykit/workflow'` is selective — recon shows workflow is re-exported selectively at rilaykit/src/index.ts:17-91, so ADD `compileFlow`, `validateFlowSchema`, `isFlowSchema` + the flow-schema types to that selective list). `compileForm`/`Bindings`/`FieldConfigFor` flow through `export * from '@rilaykit/forms'` and `@rilaykit/core` — confirm by the test.

- [ ] **Step 4: Run tests + typecheck + build**

Run: `pnpm vitest run && pnpm type-check && pnpm build`
Expected: PASS (build catches export/d.ts issues across packages).

- [ ] **Step 5: Commit**

```bash
git add -A packages/workflow packages/rilaykit
git commit -m "feat(workflow,rilaykit): export flow-schema API through workflow and all-in-one"
```

---

### Task 9: P2 Feature Proof Matrix — the phase gate (mandatory per spec §9)

Per-task TDD proves units; this task proves FEATURES. Every P2 capability gets a test that fails if it breaks, plus hardening + coverage + an adversarial pass, mirroring the P1 proof gate.

**Files:**
- Create: `tests/e2e/proof/compile-form.proof.e2e.test.tsx`, `tests/e2e/proof/compile-flow.proof.e2e.test.tsx`, `docs/superpowers/plans/2026-07-14-p2-proof-matrix.md`

- [ ] **Step 1: Fill the feature matrix**

Create `docs/superpowers/plans/2026-07-14-p2-proof-matrix.md` with a row per P2 capability, each pointing at `file:testname`:

| Feature | Proven by |
|---|---|
| compileForm compiles flat + row schemas; returns formConfig+defaultValues | |
| compileForm bindings resolve registry validators + named effects | |
| compileForm per-field inline default merged; top-level override wins | |
| compileForm validateProps option: valid pass / invalid → SchemaValidationError / off by default | |
| fromSchema deprecated alias still works | |
| FieldConfigFor<C> typed dynamic building (type-level: rejects unknown type + wrong props) | |
| compileForm dynamic-build path has no `any` cast (grep gate) | |
| FlowSchema JSON → compileFlow → WorkflowConfig; per-step forms compiled | |
| compileFlow allowSkip predicate + onAfterValidation resolved via bindings | |
| compileFlow NotFoundError on unresolved allowSkip/after binding | |
| validateFlowSchema: valid pass / dup step ids / unknown component / matches-non-string / null step → SchemaValidationError | |
| isFormSchema / isFlowSchema guards | |
| end-to-end: server JSON.parse(FlowSchema) → compileFlow → render `<Flow>` → navigate → complete → exact payload | |
| public surface: workflow + all-in-one export the schema API | |

- [ ] **Step 2: Write the compile-form proof e2e**

`tests/e2e/proof/compile-form.proof.e2e.test.tsx`: author a `FormSchema` as a JSON STRING, `JSON.parse` it, `compileForm(schema, catalog, { bindings })` with a registry async validator + named effect, render through `<Form of={result.formConfig} defaults={result.defaultValues}>` + `<Form.Body/>`, drive validation + effect + submit, assert the EXACT submitted payload (reuse `tests/e2e/_setup/proof-fixtures.tsx`).

- [ ] **Step 3: Write the compile-flow proof e2e**

`tests/e2e/proof/compile-flow.proof.e2e.test.tsx`: author a 2-step `FlowSchema` as a JSON STRING (mirroring the stndrds subscription use case), `JSON.parse`, `compileFlow(schema, catalog, { bindings })` (with an `after` binding doing cross-step prefill + an `allowSkip` predicate), render `<Flow of={config}>` with `Flow.Body/Progress/Next/Back/Skip`, navigate through, complete, assert the exact namespaced `onComplete` payload and that the after-binding prefilled the next step. This is the flagship "backend sends pure JSON → live validated multi-step flow" proof.

- [ ] **Step 4: Coverage + adversarial gate**

Run: `pnpm vitest run --coverage` — P2 files (`compile-form.ts`, `compile-flow.ts`, `validate-flow-schema.ts`, `flow-schema-types.ts`) meet the repo thresholds (90/85/90/90); close any hole with a proof test (never lower thresholds). Then dispatch the adversarial checker panel (tests-prove-behavior / DRY / elegance / conventions) over the full P2 diff (`git diff` since the P2 start commit); apply confirmed findings; re-verify.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/proof docs/superpowers/plans/2026-07-14-p2-proof-matrix.md
git commit -m "test: P2 feature proof matrix and JSON→live-flow hardening suite"
```

---

## Plan Self-Review (done at authoring time)

- **Spec coverage (§6 + §11 P2)**: compileForm rename + bindings T1 ✔; streaming-friendly per-field defaults T2 ✔; typed dynamic building / kill `any` gap T3 (`FieldConfigFor<C>`) ✔; FlowSchema T4 ✔; compileFlow T5 ✔; validateFlowSchema T6 ✔; propsSchema validation hook T7 ✔; exports T8 ✔; mandatory phase proof gate §9 → T9 ✔. Out of P2 scope (deferred to later per spec §12): reverse serializer (config→JSON); progressive multi-step mounting.
- **Recon-driven judgment calls baked in**: `SchemaValidationError` kept out of the core hierarchy (published contract) — structural errors use it, resolution errors use core typed errors (T1/T5/T6). `matches(RegExp)` non-serializability handled by a validation guard (T6). `flow` non-genericity bridged with a documented single `as never` at the catalog boundary in compileFlow (T5). Per-field default is genuinely new schema surface (T2). `FieldConfigFor<C>` is new (no prior helper) built from `keyof C` (T3).
- **Type consistency**: `Bindings` (T1) is extended by `FlowBindings` (T4) and consumed by compileFlow (T5); `FieldConfigFor<C>` (T3, core) consumed by compileForm's resolver; `FlowSchema`/`FlowSchemaStep` (T4) consumed by T5/T6; `SchemaValidationError` (forms) thrown by T6/T7 in workflow/forms. Names verified against recon signatures (`compileForm`, `compileFlow`, `FlowBindings`, `validateFlowSchema`, `isFlowSchema`).
- **Executor notes**: T5 depends on T6's `validateFlowSchema` — implement T6's file within T5 or land T6 first (flagged in T5 Step 4). Confirm the exact `FieldSchemaValidation` property name (`rules` vs `validate`) from `resolve-validation.test.ts` before finalizing T1's fixture. Confirm `flow.create`/`.addStep` accept the compiled StepDefinition shape (recon: yes, `formConfig: FormConfiguration | form`, `allowSkip: StepAllowSkip`, `onAfterValidation`).
