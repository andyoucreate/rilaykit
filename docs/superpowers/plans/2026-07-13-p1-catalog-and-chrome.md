# P1 — Unified Catalog & Headless Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-renderer-ify RilayKit: one namespaced catalog (`.component()/.tool()/.part()/.use()/.renderers()` + `propsSchema` + `meta` + typed errors) and compound headless chrome (`Form.*`, `Flow.*` with `of`/`defaults`), deleting the whole renderConfig layer.

**Architecture:** Spec is `docs/superpowers/specs/2026-07-13-rilaykit-agentic-engine-design.md` (§4, §5, §8, §10). The engine (providers/stores/conditions/validation) is untouched; only the registry and the presentation shell change. Old APIs stay alive mid-plan (temporary `addComponent` delegate) and die in Task 16.

**Tech Stack:** TypeScript strict, React 18, Zustand, Standard Schema (`@standard-schema/spec`), zod (tests), vitest + jsdom + @testing-library/react, biome, turbo/pnpm.

## Global Constraints

- Never `throw new Error(...)` — use the `RilayError` hierarchy (Task 1). Codes: `VALIDATION | DUPLICATE | NOT_FOUND | INVALID_SCHEMA | CONFIGURATION`.
- No `console.*`. No `any` — `unknown` over `any`; killing `any` is a design goal.
- `function` for declarations, arrows for callbacks. One component per file.
- Immutable builder: every registration returns a NEW `ril` instance.
- Dependency direction: `workflow → forms → core`. Core never imports from the others.
- Tests: test-first, exact assertions (`toBe`), real stores/catalogs (never mock rilaykit), error paths covered. JSX tests use `.tsx`.
- Commands run from repo root. Test: `pnpm vitest run <path>`. Typecheck: `pnpm type-check`. Lint: `pnpm check`.
- Conventional commits.
- The spec's naming is law: `Form.Body/Field/Submit/List`, `Flow.Body/Progress/Next/Back/Skip`, `of`/`defaults`, `useFlow*` hooks.

## File Structure (end state)

```
packages/core/src/
  errors.ts                       NEW  RilayError hierarchy (moved out of config/ril.ts, extended)
  types/catalog.ts                NEW  Catalog entries + renderer contexts + ToolState
  types/index.ts                  MOD  drops renderer/builder-metadata/V2 types (Task 16)
  config/ril.ts                   MOD  namespaced entries Map + fluent facades
  components/ComponentRendererWrapper.tsx   DELETED (Task 16)
  utils/componentHelpers.tsx                DELETED (Task 16)
  types/context.ts                          DELETED (Task 16)
packages/forms/src/
  components/Form.tsx             MOD  root (of/defaults) + compound assembly
  components/FormBody.tsx         MOD  render prop { rows }, bare default
  components/FormField.tsx        MOD  new ComponentRenderContext bridge
  components/FormSubmit.tsx       NEW  (replaces FormSubmitButton.tsx)
  components/FormList.tsx         NEW  (replaces repeatable-field.tsx)
  components/FormListItem.tsx     NEW  (replaces repeatable-item.tsx)
  components/FormRow.tsx          DELETED (Task 11; logic moves into useFormRows)
  hooks/useFormRows.ts            NEW
packages/workflow/src/
  components/Flow.tsx             NEW  root (of/defaults/onComplete) + compound assembly
  components/FlowBody.tsx         NEW  (replaces WorkflowBody.tsx)
  components/FlowProgress.tsx     NEW  (replaces WorkflowStepper.tsx)
  components/FlowNav.tsx          NEW  parametric Next/Back/Skip (replaces the 3 button files)
  components/WorkflowProvider.tsx MOD  exports useFlow (renamed useWorkflowContext)
  hooks/useStep.ts                NEW
  hooks/useFlowSteps.ts           NEW
  stores/workflowStore.ts         MOD  useFlow* selector renames
packages/rilaykit/src/           MOD  create-ril + index re-exports
MIGRATION.md                      NEW
```

---

### Task 1: Typed error hierarchy (`core/src/errors.ts`)

**Files:**
- Create: `packages/core/src/errors.ts`
- Test: `packages/core/tests/errors.test.ts`
- Modify: `packages/core/src/config/ril.ts` (import errors instead of defining them), `packages/core/src/index.ts` (export errors), `packages/core/src/utils/builderHelpers.ts` (throw `DuplicateError`)

**Interfaces:**
- Produces: `RilayErrorCode = 'VALIDATION' | 'DUPLICATE' | 'NOT_FOUND' | 'INVALID_SCHEMA' | 'CONFIGURATION'`; classes `RilayError` (with `code: RilayErrorCode`, `meta?: Record<string, unknown>`), `ValidationError`, `DuplicateError`, `NotFoundError`, `InvalidSchemaError`, `ConfigurationError`. All later tasks throw these.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/errors.test.ts
import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  DuplicateError,
  InvalidSchemaError,
  NotFoundError,
  RilayError,
  ValidationError,
} from '@rilaykit/core';

describe('RilayError hierarchy', () => {
  it('carries code and meta', () => {
    const err = new RilayError('boom', 'CONFIGURATION', { key: 'x' });
    expect(err.code).toBe('CONFIGURATION');
    expect(err.meta).toEqual({ key: 'x' });
    expect(err.name).toBe('RilayError');
    expect(err).toBeInstanceOf(Error);
  });

  it.each([
    [ValidationError, 'VALIDATION', 'ValidationError'],
    [DuplicateError, 'DUPLICATE', 'DuplicateError'],
    [NotFoundError, 'NOT_FOUND', 'NotFoundError'],
    [InvalidSchemaError, 'INVALID_SCHEMA', 'InvalidSchemaError'],
    [ConfigurationError, 'CONFIGURATION', 'ConfigurationError'],
  ] as const)('%o has code %s', (Ctor, code, name) => {
    const err = new Ctor('msg', { a: 1 });
    expect(err.code).toBe(code);
    expect(err.name).toBe(name);
    expect(err.message).toBe('msg');
    expect(err.meta).toEqual({ a: 1 });
    expect(err).toBeInstanceOf(RilayError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/errors.test.ts`
Expected: FAIL — `@rilaykit/core` has no export `NotFoundError` (module resolution error).

- [ ] **Step 3: Write the implementation**

```typescript
// packages/core/src/errors.ts
export type RilayErrorCode =
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'INVALID_SCHEMA'
  | 'CONFIGURATION';

export class RilayError extends Error {
  constructor(
    message: string,
    public readonly code: RilayErrorCode,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RilayError';
  }
}

export class ValidationError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'VALIDATION', meta);
    this.name = 'ValidationError';
  }
}

export class DuplicateError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'DUPLICATE', meta);
    this.name = 'DuplicateError';
  }
}

export class NotFoundError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', meta);
    this.name = 'NotFoundError';
  }
}

export class InvalidSchemaError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'INVALID_SCHEMA', meta);
    this.name = 'InvalidSchemaError';
  }
}

export class ConfigurationError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'CONFIGURATION', meta);
    this.name = 'ConfigurationError';
  }
}
```

Then in `packages/core/src/config/ril.ts`: delete the local `RilayError`, `ValidationError`, `DuplicateIdError` classes (lines 4-30) and replace with `import { ValidationError } from '../errors';` (keep `validateAsync` usage working — its `new ValidationError(msg, {…})` signature is unchanged). In `packages/core/src/index.ts` add `export * from './errors';`. In `packages/core/src/utils/builderHelpers.ts`, replace any `DuplicateIdError`/`new Error` throw in `ensureUnique` with `DuplicateError` from `../errors`. Search-and-fix compile fallout: `grep -rn "DuplicateIdError" packages/ --include="*.ts*" | grep -v node_modules` and update each site (imports + `instanceof` + `.code` assertions in existing tests, e.g. `packages/core/tests/config/ril.test.ts` if it references old codes `VALIDATION_ERROR`/`DUPLICATE_ID_ERROR` → new codes `VALIDATION`/`DUPLICATE`).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/core && pnpm type-check`
Expected: PASS (all core tests, including updated ones), typecheck green.

- [ ] **Step 5: Commit**

```bash
git add packages/core MIGRATION.md 2>/dev/null; git add -A packages/core
git commit -m "feat(core): extract typed RilayError hierarchy with stable codes"
```

---

### Task 2: Catalog entry types + `.component()` facade

**Files:**
- Create: `packages/core/src/types/catalog.ts`
- Test: `packages/core/tests/catalog/component.test.tsx`
- Modify: `packages/core/src/config/ril.ts`, `packages/core/src/types/index.ts` (append `export * from './catalog';`)

**Interfaces:**
- Consumes: errors from Task 1.
- Produces:
  - `ToolState = 'streaming' | 'ready' | 'done' | 'error'`
  - `FieldBinding { value: unknown; onChange: (v: unknown) => void; onBlur: () => void; error?: ValidationError[]; disabled?: boolean; isValidating?: boolean; touched?: boolean }` (this `ValidationError` is the *field* error shape `{ message, code?, path? }` from `types/index.ts`, not the error class)
  - `ComponentRenderContext<TProps> { id: string; props: TProps; field?: FieldBinding; conditions?: { visible: boolean; disabled: boolean; required: boolean; readonly: boolean }; children?: React.ReactNode; meta?: Record<string, unknown> }`
  - `ComponentEntry<TProps> { kind: 'component'; type: string; name?: string; description?: string; propsSchema?: StandardSchemaV1<unknown, TProps>; propsJsonSchema?: Record<string, unknown>; renderer?: (ctx: ComponentRenderContext<TProps>) => React.ReactElement; defaultProps?: Partial<TProps>; validation?: FieldValidationConfig; meta?: Record<string, unknown>; replace?: boolean }`
  - `ToolRenderContext<TInput, TOutput>`, `ToolEntry<TInput, TOutput>`, `PartRenderContext<TPart>`, `PartEntry<TPart>` (fields per spec §4; used by Task 3)
  - `ril.component(type, entry)` → new instance, key `component:${type}`, throws `DuplicateError` unless `entry.replace === true`; `getComponent/hasComponent/getAllComponents/removeComponent` keep working over the namespaced map; `addComponent` becomes a delegate to `.component()` (temporary, deleted in Task 16).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/core/tests/catalog/component.test.tsx
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DuplicateError, ril } from '@rilaykit/core';

const textEntry = {
  description: 'Text input',
  propsSchema: z.object({ label: z.string() }),
  renderer: ({ id, props }: { id: string; props: { label: string } }) => (
    <input aria-label={props.label} data-id={id} />
  ),
  meta: { icon: 'text' },
};

describe('ril.component()', () => {
  it('registers a component retrievable by type', () => {
    const r = ril.create().component('text', textEntry);
    const entry = r.getComponent('text');
    expect(entry?.kind).toBe('component');
    expect(entry?.type).toBe('text');
    expect(entry?.description).toBe('Text input');
    expect(entry?.meta).toEqual({ icon: 'text' });
  });

  it('is immutable — the original instance is untouched', () => {
    const base = ril.create();
    const extended = base.component('text', textEntry);
    expect(base.hasComponent('text')).toBe(false);
    expect(extended.hasComponent('text')).toBe(true);
  });

  it('throws DuplicateError on double registration', () => {
    const r = ril.create().component('text', textEntry);
    expect(() => r.component('text', textEntry)).toThrowError(DuplicateError);
    try {
      r.component('text', textEntry);
    } catch (e) {
      expect((e as DuplicateError).code).toBe('DUPLICATE');
      expect((e as DuplicateError).meta).toEqual({ key: 'component:text' });
    }
  });

  it('replaces the whole entry with replace: true', () => {
    const r = ril
      .create()
      .component('text', textEntry)
      .component('text', { ...textEntry, description: 'Replaced', replace: true });
    expect(r.getComponent('text')?.description).toBe('Replaced');
  });

  it('keeps addComponent working as a delegate during migration', () => {
    const r = ril.create().addComponent('legacy', {
      name: 'Legacy',
      renderer: () => <span />,
    });
    expect(r.hasComponent('legacy')).toBe(true);
    expect(r.getComponent('legacy')?.name).toBe('Legacy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/catalog/component.test.tsx`
Expected: FAIL — `r.component is not a function`.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/core/src/types/catalog.ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type React from 'react';
import type { FieldValidationConfig, ValidationError } from './index';

export type ToolState = 'streaming' | 'ready' | 'done' | 'error';

export interface FieldBinding {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly onBlur: () => void;
  readonly error?: ValidationError[];
  readonly disabled?: boolean;
  readonly isValidating?: boolean;
  readonly touched?: boolean;
}

export interface ComponentRenderContext<TProps = Record<string, unknown>> {
  readonly id: string;
  readonly props: TProps;
  readonly field?: FieldBinding;
  readonly conditions?: {
    readonly visible: boolean;
    readonly disabled: boolean;
    readonly required: boolean;
    readonly readonly: boolean;
  };
  readonly children?: React.ReactNode;
  readonly meta?: Record<string, unknown>;
}

export interface ComponentEntry<TProps = Record<string, unknown>> {
  readonly kind: 'component';
  readonly type: string;
  readonly name?: string;
  readonly description?: string;
  readonly propsSchema?: StandardSchemaV1<unknown, TProps>;
  readonly propsJsonSchema?: Record<string, unknown>;
  readonly renderer?: (ctx: ComponentRenderContext<TProps>) => React.ReactElement;
  readonly defaultProps?: Partial<TProps>;
  readonly validation?: FieldValidationConfig;
  readonly meta?: Record<string, unknown>;
  readonly replace?: boolean;
}

export interface ToolRenderContext<TInput = unknown, TOutput = unknown> {
  readonly toolCallId: string;
  readonly name: string;
  readonly state: ToolState;
  readonly input: TInput;
  readonly rawInput?: string;
  readonly output?: TOutput;
  readonly errorText?: string;
  readonly resolve: (output: TOutput) => void;
  readonly meta?: Record<string, unknown>;
}

export interface ToolEntry<TInput = unknown, TOutput = unknown> {
  readonly kind: 'tool';
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: StandardSchemaV1<unknown, TInput>;
  readonly inputJsonSchema?: Record<string, unknown>;
  readonly renderer?: (ctx: ToolRenderContext<TInput, TOutput>) => React.ReactElement;
  readonly meta?: Record<string, unknown>;
  readonly replace?: boolean;
}

export interface PartRenderContext<TPart = unknown> {
  readonly part: TPart;
  readonly meta?: Record<string, unknown>;
}

export interface PartEntry<TPart = unknown> {
  readonly kind: 'part';
  readonly type: string;
  readonly renderer: (ctx: PartRenderContext<TPart>) => React.ReactElement;
  readonly meta?: Record<string, unknown>;
  readonly replace?: boolean;
}

export type CatalogEntry = ComponentEntry<never> | ToolEntry<never, never> | PartEntry<never>;
```

In `packages/core/src/types/index.ts` append `export * from './catalog';`.

In `packages/core/src/config/ril.ts`:
1. Replace `private components = new Map<string, ComponentConfig>()` with `private entries = new Map<string, unknown>()` and add private helpers:

```typescript
private static componentKey(type: string): string {
  return `component:${type}`;
}

private cloneWith(mutate: (entries: Map<string, unknown>) => void): ril<C> {
  const next = new ril<C>();
  next.entries = new Map(this.entries);
  next.formRenderConfig = { ...this.formRenderConfig };
  next.workflowRenderConfig = { ...this.workflowRenderConfig };
  mutate(next.entries);
  return next;
}
```

2. Add the facade (import `DuplicateError` from `../errors`, entry types from `../types/catalog`):

```typescript
component<NewType extends string, TProps = Record<string, unknown>>(
  type: NewType,
  entry: Omit<ComponentEntry<TProps>, 'kind' | 'type'>
): ril<C & { [K in NewType]: TProps }> {
  const key = ril.componentKey(type);
  if (this.entries.has(key) && entry.replace !== true) {
    throw new DuplicateError(`Component "${type}" is already registered`, { key });
  }
  return this.cloneWith((entries) => {
    entries.set(key, { ...entry, kind: 'component', type } satisfies ComponentEntry<TProps>);
  }) as ril<C & { [K in NewType]: TProps }>;
}
```

3. Rewrite `addComponent` as a delegate (temporary shim — its old `ComponentConfig` arg shape maps onto the entry; keep its signature so existing callers compile):

```typescript
/** @deprecated Use .component() — removed in Task 16 */
addComponent<NewType extends string, TProps = Record<string, unknown>>(
  type: NewType,
  config: Omit<ComponentConfig<TProps>, 'id' | 'type'>
): ril<C & { [K in NewType]: TProps }> {
  const { renderer, ...rest } = config;
  return this.component<NewType, TProps>(type, {
    ...rest,
    renderer: renderer as unknown as ComponentEntry<TProps>['renderer'],
  });
}
```

4. Point the readers at the namespaced map — `getComponent(id)` returns `this.entries.get(ril.componentKey(id))` cast to `ComponentEntry`; `hasComponent(id)` → `this.entries.has(ril.componentKey(id))`; `getAllComponents()` → filter entries by `kind === 'component'`; `removeComponent(id)` → `cloneWith(e => e.delete(ril.componentKey(id)))`; `clear()`/`clone()` copy `entries`. Update `getStats`/`validate` internals to iterate `getAllComponents()`. Update the `RilayInstance<C>` interface accordingly (add `component`, keep `addComponent` marked deprecated; `getComponent` return type becomes `ComponentEntry<C[T]> | undefined`).
5. IMPORTANT compile note: `ComponentConfig.renderer` (old flat signature) and `ComponentEntry.renderer` (context signature) differ — the delegate casts once (`as unknown as`), confined to the deprecated shim. `FormField` keeps calling the old flat shape until Task 8; since entries stored via `addComponent` hold old-shape renderers at runtime, behavior is unchanged.
6. Dependency: bump root devDependency `zod` from `^3.25.76` to `^4` (`pnpm add -D -w zod@^4`) — zod 4 is the documented golden path (native Standard Schema + `z.toJSONSchema()` needed by P3); test syntax used in this plan is v4-compatible.

- [ ] **Step 4: Add type-level inference tests (the flagship DX promise)**

Append to `packages/core/tests/catalog/component.test.tsx`:

```tsx
import { expectTypeOf } from 'vitest';
import type { ComponentRenderContext } from '@rilaykit/core';

describe('propsSchema type inference', () => {
  it('infers renderer ctx props from the zod schema', () => {
    ril.create().component('select', {
      propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
      renderer: (ctx) => {
        expectTypeOf(ctx).toMatchTypeOf<ComponentRenderContext<{ label: string; options: string[] }>>();
        expectTypeOf(ctx.props.label).toBeString();
        return <div />;
      },
    });
  });

  it('accumulates the component map in the instance generic', () => {
    const r = ril.create().component('select', {
      propsSchema: z.object({ label: z.string() }),
    });
    const entry = r.getComponent('select');
    expectTypeOf(entry!.propsSchema!).toMatchTypeOf<
      import('@standard-schema/spec').StandardSchemaV1<unknown, { label: string }>
    >();
  });
});
```

Run: `pnpm vitest run packages/core/tests/catalog/component.test.tsx` — if inference does not flow (TS errors inside the test), adjust the `component()` signature so `TProps` is inferred from `entry.propsSchema` (contextual inference through `Omit<ComponentEntry<TProps>, 'kind' | 'type'>` — zod v4's Standard Schema output type drives it). The type test MUST pass without explicit generics at the call site.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run packages/core && pnpm type-check`
Expected: PASS. Existing `ril.test.ts` / `ril-immutable.test.ts` still pass through the delegate.

- [ ] **Step 6: Commit**

```bash
git add -A packages/core package.json pnpm-lock.yaml
git commit -m "feat(core): namespaced catalog with .component() facade and entry types"
```

---

### Task 3: `.tool()` and `.part()` facades

**Files:**
- Modify: `packages/core/src/config/ril.ts`
- Test: `packages/core/tests/catalog/tool-part.test.tsx`

**Interfaces:**
- Consumes: `ToolEntry`, `PartEntry` types (Task 2).
- Produces: `ril.tool(name, entry)`, `ril.part(type, entry)`, `getTool(name): ToolEntry | undefined`, `getPart(type): PartEntry | undefined`, `getAllTools(): ToolEntry[]`, `getAllParts(): PartEntry[]`. Keys `tool:${name}` / `part:${type}`; same `DuplicateError`/`replace` semantics as `.component()`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/core/tests/catalog/tool-part.test.tsx
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DuplicateError, ril } from '@rilaykit/core';

describe('ril.tool() / ril.part()', () => {
  it('registers a tool with schema and retrieves it', () => {
    const r = ril.create().tool('search_flights', {
      description: 'Search flights',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
    });
    const tool = r.getTool('search_flights');
    expect(tool?.kind).toBe('tool');
    expect(tool?.name).toBe('search_flights');
    expect(tool?.description).toBe('Search flights');
  });

  it('registers a renderer-only tool (no schema)', () => {
    const r = ril.create().tool('host_tool', {
      renderer: ({ state }) => <div data-state={state} />,
    });
    expect(r.getTool('host_tool')?.inputSchema).toBeUndefined();
  });

  it('registers a part and lists entries by kind', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => <input /> })
      .tool('t1', {})
      .part('text', { renderer: ({ part }) => <p>{String(part)}</p> });
    expect(r.getAllTools().map((t) => t.name)).toEqual(['t1']);
    expect(r.getAllParts().map((p) => p.type)).toEqual(['text']);
    expect(r.getAllComponents().map((c) => c.type)).toEqual(['text']);
    expect(r.getPart('text')?.kind).toBe('part');
  });

  it('component and part namespaces do not collide', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => <input /> })
      .part('text', { renderer: () => <p /> });
    expect(r.getComponent('text')?.kind).toBe('component');
    expect(r.getPart('text')?.kind).toBe('part');
  });

  it('throws DuplicateError on tool double registration without replace', () => {
    const r = ril.create().tool('x', {});
    expect(() => r.tool('x', {})).toThrowError(DuplicateError);
    expect(r.tool('x', { description: 'v2', replace: true }).getTool('x')?.description).toBe('v2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/catalog/tool-part.test.tsx`
Expected: FAIL — `r.tool is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/config/ril.ts` add (mirroring `component()`):

```typescript
private static toolKey(name: string): string {
  return `tool:${name}`;
}
private static partKey(type: string): string {
  return `part:${type}`;
}

tool<TInput = unknown, TOutput = unknown>(
  name: string,
  entry: Omit<ToolEntry<TInput, TOutput>, 'kind' | 'name'>
): ril<C> {
  const key = ril.toolKey(name);
  if (this.entries.has(key) && entry.replace !== true) {
    throw new DuplicateError(`Tool "${name}" is already registered`, { key });
  }
  return this.cloneWith((entries) => {
    entries.set(key, { ...entry, kind: 'tool', name } satisfies ToolEntry<TInput, TOutput>);
  });
}

part<TPart = unknown>(type: string, entry: Omit<PartEntry<TPart>, 'kind' | 'type'>): ril<C> {
  const key = ril.partKey(type);
  if (this.entries.has(key) && entry.replace !== true) {
    throw new DuplicateError(`Part "${type}" is already registered`, { key });
  }
  return this.cloneWith((entries) => {
    entries.set(key, { ...entry, kind: 'part', type } satisfies PartEntry<TPart>);
  });
}

getTool(name: string): ToolEntry | undefined {
  return this.entries.get(ril.toolKey(name)) as ToolEntry | undefined;
}
getPart(type: string): PartEntry | undefined {
  return this.entries.get(ril.partKey(type)) as PartEntry | undefined;
}
getAllTools(): ToolEntry[] {
  return [...this.entries.values()].filter(
    (e): e is ToolEntry => (e as ToolEntry).kind === 'tool'
  );
}
getAllParts(): PartEntry[] {
  return [...this.entries.values()].filter(
    (e): e is PartEntry => (e as PartEntry).kind === 'part'
  );
}
```

Add the same methods to the `RilayInstance<C>` interface.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/core && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/core
git commit -m "feat(core): add .tool() and .part() catalog facades"
```

---

### Task 4: `.use()` and `.renderers()`

**Files:**
- Modify: `packages/core/src/config/ril.ts`
- Test: `packages/core/tests/catalog/use-renderers.test.tsx`

**Interfaces:**
- Produces:
  - `type RilayPlugin = (r: ril<Record<string, unknown>>) => ril<Record<string, unknown>>` — exported from `config/ril.ts`. `r.use(plugin)` returns `plugin(this)`. A plain function type: plugin bodies need no generic gymnastics and no `as` cast; component types registered inside a plugin are not carried in `C` in P1 either way.
  - `r.renderers({ components?: Record<string, ComponentEntry['renderer']>, tools?: Record<string, ToolEntry['renderer']>, parts?: Record<string, PartEntry['renderer']> })` — attaches/overrides ONLY the renderer of existing entries; throws `NotFoundError` for unknown keys. Returns a new instance.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/core/tests/catalog/use-renderers.test.tsx
import { describe, expect, it } from 'vitest';
import { NotFoundError, ril } from '@rilaykit/core';

describe('ril.use()', () => {
  it('applies a plugin that registers entries', () => {
    const plugin = (r: ril<Record<string, unknown>>) =>
      r.tool('show_form', { description: 'from plugin' });
    const r = ril.create().use(plugin);
    expect(r.getTool('show_form')?.description).toBe('from plugin');
  });
});

describe('ril.renderers()', () => {
  it('attaches renderers to existing entries without touching schemas', () => {
    const base = ril
      .create()
      .component('text', { description: 'kept' })
      .tool('show_form', { description: 'kept too' });
    const r = base.renderers({
      components: { text: ({ id }) => <input data-id={id} /> },
      tools: { show_form: ({ state }) => <div data-state={state} /> },
    });
    expect(typeof r.getComponent('text')?.renderer).toBe('function');
    expect(r.getComponent('text')?.description).toBe('kept');
    // @ts-expect-error — unknown component key is rejected statically
    base.renderers({ components: { nope: () => <i /> } });
    expect(typeof r.getTool('show_form')?.renderer).toBe('function');
    expect(r.getTool('show_form')?.description).toBe('kept too');
    // immutability
    expect(base.getComponent('text')?.renderer).toBeUndefined();
  });

  it('throws NotFoundError for an unknown key', () => {
    const r = ril.create();
    expect(() => r.renderers({ components: { ghost: () => <i /> } })).toThrowError(NotFoundError);
    try {
      r.renderers({ tools: { ghost: () => <i /> } });
    } catch (e) {
      expect((e as NotFoundError).meta).toEqual({ key: 'tool:ghost' });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/catalog/use-renderers.test.tsx`
Expected: FAIL — `r.use is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/config/ril.ts`:

```typescript
export type RilayPlugin = (r: ril<Record<string, unknown>>) => ril<Record<string, unknown>>;

export interface RendererAttachments<C> {
  readonly components?: {
    readonly [K in keyof C & string]?: (ctx: ComponentRenderContext<C[K]>) => React.ReactElement;
  };
  readonly tools?: Record<string, ToolEntry<never, never>['renderer']>;
  readonly parts?: Record<string, PartEntry<never>['renderer']>;
}
```

(`components` keys are constrained to the instance's registered component map `C` with per-component ctx typing — the spec's ".renderers() typed against registered keys". Tools/parts stay string-keyed in P1: their keys are not accumulated in generics yet; the runtime `NotFoundError` covers them.)

Methods on the class:

```typescript
use(plugin: RilayPlugin): ril<C> {
  return plugin(this as ril<Record<string, unknown>>) as ril<C>;
}

renderers(attachments: RendererAttachments<C>): ril<C> {
  const patches: Array<[string, unknown]> = [];
  const collect = (bag: Record<string, unknown> | undefined, prefix: 'component' | 'tool' | 'part') => {
    for (const [name, renderer] of Object.entries(bag ?? {})) {
      const key = `${prefix}:${name}`;
      const existing = this.entries.get(key);
      if (!existing) {
        throw new NotFoundError(`Cannot attach renderer: no ${prefix} "${name}" registered`, { key });
      }
      patches.push([key, { ...(existing as object), renderer }]);
    }
  };
  collect(attachments.components as Record<string, unknown> | undefined, 'component');
  collect(attachments.tools, 'tool');
  collect(attachments.parts, 'part');
  return this.cloneWith((entries) => {
    for (const [key, entry] of patches) entries.set(key, entry);
  });
}
```

(`collect` is an arrow callback — allowed. Import `NotFoundError` from `../errors`.) Add both methods to `RilayInstance<C>`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/core && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/core
git commit -m "feat(core): add .use() plugin hook and .renderers() hydration"
```

---

### Task 5: `validateProps()` — schema projection groundwork

**Files:**
- Modify: `packages/core/src/config/ril.ts`
- Test: `packages/core/tests/catalog/validate-props.test.ts`

**Interfaces:**
- Produces: `ril.validateProps(type: string, props: unknown): PropsValidationResult` with
  `type PropsValidationResult = { success: true; value: unknown } | { success: false; issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }>; expectedKeys?: string[] }` (exported from `types/catalog.ts`). Throws `NotFoundError` (unknown component), `ConfigurationError` (async schema). P2's `compileForm` and P3's self-correction consume this.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/catalog/validate-props.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfigurationError, NotFoundError, ril } from '@rilaykit/core';

const r = ril.create().component('select', {
  propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
});

describe('ril.validateProps()', () => {
  it('returns success with the parsed value', () => {
    const result = r.validateProps('select', { label: 'Country', options: ['fr'] });
    expect(result).toEqual({ success: true, value: { label: 'Country', options: ['fr'] } });
  });

  it('returns issues and expectedKeys on invalid props', () => {
    const result = r.validateProps('select', { label: 42 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toContain('expected string');
      expect(result.expectedKeys).toEqual(['label', 'options']);
    }
  });

  it('passes through when the component has no propsSchema', () => {
    const loose = ril.create().component('free', {});
    expect(loose.validateProps('free', { anything: true })).toEqual({
      success: true,
      value: { anything: true },
    });
  });

  it('throws NotFoundError for an unknown component', () => {
    expect(() => r.validateProps('ghost', {})).toThrowError(NotFoundError);
  });

  it('throws ConfigurationError for async schemas', () => {
    const asyncSchema = {
      '~standard': { version: 1, vendor: 'test', validate: () => Promise.resolve({ value: {} }) },
    };
    const bad = ril.create().component('async', {
      propsSchema: asyncSchema as never,
    });
    expect(() => bad.validateProps('async', {})).toThrowError(ConfigurationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/catalog/validate-props.test.ts`
Expected: FAIL — `r.validateProps is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/types/catalog.ts` add:

```typescript
export type PropsValidationResult =
  | { readonly success: true; readonly value: unknown }
  | {
      readonly success: false;
      readonly issues: ReadonlyArray<{
        readonly message: string;
        readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
      }>;
      readonly expectedKeys?: string[];
    };
```

In `ril.ts` (import `ConfigurationError`, `NotFoundError`):

```typescript
validateProps(type: string, props: unknown): PropsValidationResult {
  const entry = this.getComponent(type);
  if (!entry) {
    throw new NotFoundError(`Component "${type}" not found in catalog`, {
      key: ril.componentKey(type),
    });
  }
  if (!entry.propsSchema) {
    return { success: true, value: props };
  }
  const outcome = entry.propsSchema['~standard'].validate(props);
  if (outcome instanceof Promise) {
    throw new ConfigurationError(
      `propsSchema of "${type}" is async — props schemas must validate synchronously`,
      { key: ril.componentKey(type) }
    );
  }
  if (outcome.issues) {
    const shape = (entry.propsSchema as { shape?: Record<string, unknown> }).shape;
    return {
      success: false,
      issues: outcome.issues,
      expectedKeys: shape ? Object.keys(shape) : undefined,
    };
  }
  return { success: true, value: outcome.value };
}
```

Add `validateProps` to `RilayInstance<C>`. (zod v4 object schemas expose `.shape`, giving best-effort `expectedKeys`; non-zod schemas simply omit it.)

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/core && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/core
git commit -m "feat(core): validateProps with structured issues and expectedKeys"
```

---

### Task 6: `Form` root — `of` / `defaults`

**Files:**
- Modify: `packages/forms/src/components/Form.tsx`
- Test: `packages/forms/tests/components/Form.test.tsx`
- Modify (mechanical prop sweep): every JSX usage of `<Form formConfig=` / `defaultValues=` in `tests/e2e/forms/*.e2e.test.tsx` and `packages/forms/tests/integration/*.test.tsx`

**Interfaces:**
- Produces: `FormProps { of: FormConfiguration<Record<string, never>> | form<Record<string, never>>; defaults?: Record<string, unknown>; onSubmit?: (data: Record<string, unknown>) => void | Promise<void>; onFieldChange?: (fieldId: string, value: unknown, formData: Record<string, unknown>) => void; className?: string; children: React.ReactNode }`. `FormProvider` and its props are UNCHANGED (engine).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/forms/tests/components/Form.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { Form, form, useFieldValue } from '@rilaykit/forms';

const r = ril.create().addComponent('text', {
  name: 'Text',
  renderer: ({ id, value, onChange }: { id: string; value?: string; onChange?: (v: unknown) => void }) => (
    <input data-testid={id} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
});

function Probe({ id }: { id: string }) {
  const value = useFieldValue<string>(id);
  return <span data-testid={`probe-${id}`}>{value}</span>;
}

describe('<Form of defaults>', () => {
  it('builds from a builder passed via of and seeds defaults', () => {
    const login = form.create(r, 'login').add({ id: 'email', type: 'text', props: {} });
    render(
      <Form of={login} defaults={{ email: 'karl@ayc.dev' }}>
        <Probe id="email" />
      </Form>
    );
    expect(screen.getByTestId('probe-email').textContent).toBe('karl@ayc.dev');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/components/Form.test.tsx`
Expected: FAIL — TS/prop error: `of` is not a valid prop (`formConfig` missing).

- [ ] **Step 3: Write the implementation**

Rewrite `packages/forms/src/components/Form.tsx`:

```tsx
import type { FormConfiguration } from '@rilaykit/core';
import { useMemo } from 'react';
import { form } from '../builders/form';
import { FormProvider } from './FormProvider';

export interface FormProps {
  /** Form definition: a built FormConfiguration or a form builder (auto-built). */
  of: FormConfiguration<Record<string, never>> | form<Record<string, never>>;
  defaults?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: unknown, formData: Record<string, unknown>) => void;
  className?: string;
  children: React.ReactNode;
}

export function Form({ of, defaults, onSubmit, onFieldChange, className, children }: FormProps) {
  const resolvedConfig = useMemo(() => (of instanceof form ? of.build() : of), [of]);

  return (
    <FormProvider
      formConfig={resolvedConfig}
      defaultValues={defaults}
      onSubmit={onSubmit}
      onFieldChange={onFieldChange}
      className={className}
    >
      {children}
    </FormProvider>
  );
}

export default Form;
```

Then the mechanical sweep — in `tests/e2e/forms/*.e2e.test.tsx` and `packages/forms/tests/integration/*.test.tsx`, replace JSX props on `<Form ...>` only (NOT `FormProvider`): `formConfig=` → `of=`, `defaultValues=` → `defaults=`. Verify with `grep -rn "<Form formConfig" tests packages | grep -v node_modules` → zero results.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms tests/e2e/forms && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms tests/e2e/forms
git commit -m "feat(forms)!: Form root takes of/defaults props"
```

---

### Task 7: `useFormRows()` + `Form.Body` render prop

**Files:**
- Create: `packages/forms/src/hooks/useFormRows.ts`
- Modify: `packages/forms/src/components/FormBody.tsx` (full rewrite), `packages/forms/src/hooks/index.ts` (export hook)
- Test: `packages/forms/tests/components/FormBody.test.tsx`

**Interfaces:**
- Consumes: `useFormConfigContext` (`{ formConfig, conditionsHelpers }`), `FormField`, `RepeatableField` (until Task 10 renames it).
- Produces:
  - `type VisibleRow = { kind: 'fields'; id: string; fields: FormFieldConfig[] } | { kind: 'repeatable'; id: string; repeatable: RepeatableFieldConfig }` (exported from the hook file and from the package).
  - `useFormRows(): VisibleRow[]` — rows with hidden fields filtered out; `fields`-rows with zero visible fields are dropped entirely.
  - `FormBodyProps { children?: (ctx: { rows: VisibleRow[] }) => React.ReactNode; className?: string }` — with children: render prop output only; without: bare default (`<div data-form-body>` → per row `<div data-form-row={id}>` → `<FormField>` / repeatable component).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/forms/tests/components/FormBody.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril, when } from '@rilaykit/core';
import { Form, FormBody, form } from '@rilaykit/forms';

const r = ril.create().addComponent('text', {
  name: 'Text',
  renderer: ({ id }: { id: string }) => <input data-testid={id} />,
});

const definition = form
  .create(r, 'profile')
  .add({ id: 'name', type: 'text', props: {} })
  .add({
    id: 'siren',
    type: 'text',
    props: {},
    conditions: { visible: when('name').equals('business') },
  });

describe('<Form.Body>', () => {
  it('renders bare rows and fields by default', () => {
    render(
      <Form of={definition}>
        <FormBody />
      </Form>
    );
    expect(screen.getByTestId('name')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-form-row]').length).toBe(1); // hidden row dropped
    expect(screen.queryByTestId('siren')).toBeNull();
  });

  it('exposes visible rows through the render prop', () => {
    render(
      <Form of={definition} defaults={{ name: 'business' }}>
        <FormBody>
          {({ rows }) => (
            <output data-testid="rows">
              {rows.map((row) => (row.kind === 'fields' ? row.fields.length : 0)).join(',')}
            </output>
          )}
        </FormBody>
      </Form>
    );
    expect(screen.getByTestId('rows').textContent).toBe('1,1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/components/FormBody.test.tsx`
Expected: FAIL — render-prop children not supported / `data-row-id` absent (old wrapper markup).

- [ ] **Step 3: Write the implementation**

```typescript
// packages/forms/src/hooks/useFormRows.ts
import type { FormFieldConfig, FormRowEntry, RepeatableFieldConfig } from '@rilaykit/core';
import { useMemo } from 'react';
import { useFormConfigContext } from '../components/FormProvider';

export type VisibleRow =
  | { readonly kind: 'fields'; readonly id: string; readonly fields: FormFieldConfig[] }
  | { readonly kind: 'repeatable'; readonly id: string; readonly repeatable: RepeatableFieldConfig };

export function useFormRows(): VisibleRow[] {
  const { formConfig, conditionsHelpers } = useFormConfigContext();

  return useMemo(() => {
    const rows: VisibleRow[] = [];
    for (const row of formConfig.rows as FormRowEntry[]) {
      if (row.kind === 'repeatable') {
        rows.push({ kind: 'repeatable', id: row.id, repeatable: row.repeatable });
        continue;
      }
      const fields = row.fields.filter((field) => conditionsHelpers.isFieldVisible(field.id));
      if (fields.length > 0) {
        rows.push({ kind: 'fields', id: row.id, fields });
      }
    }
    return rows;
  }, [formConfig.rows, conditionsHelpers]);
}
```

Rewrite `packages/forms/src/components/FormBody.tsx`:

```tsx
import React from 'react';
import { useFormRows, type VisibleRow } from '../hooks/useFormRows';
import { FormField } from './FormField';
import { RepeatableField } from './repeatable-field';

export interface FormBodyProps {
  children?: (ctx: { rows: VisibleRow[] }) => React.ReactNode;
  className?: string;
}

export const FormBody = React.memo(function FormBody({ children, className }: FormBodyProps) {
  const rows = useFormRows();

  if (children) {
    return <>{children({ rows })}</>;
  }

  return (
    <div className={className} data-form-body>
      {rows.map((row) =>
        row.kind === 'repeatable' ? (
          <RepeatableField key={row.id} repeatableId={row.repeatable.id} repeatableConfig={row.repeatable} />
        ) : (
          <div key={row.id} data-form-row={row.id}>
            {row.fields.map((field) => (
              <FormField key={field.id} id={field.id} />
            ))}
          </div>
        )
      )}
    </div>
  );
});

export default FormBody;
```

Export the hook: in `packages/forms/src/hooks/index.ts` add `export { useFormRows } from './useFormRows'; export type { VisibleRow } from './useFormRows';`. Update any e2e test asserting old FormBody DOM (search `data-form-body`-adjacent assertions; the old markup had no wrapper attribute — only adjust selectors if a test fails in Step 4).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms tests/e2e/forms && pnpm type-check`
Expected: PASS (fix any e2e selector fallout as part of this step).

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms tests/e2e/forms
git commit -m "feat(forms)!: FormBody render prop over useFormRows, bare default markup"
```

---

### Task 8: `Form.Field` — the catalog bridge with the new context

**Files:**
- Modify: `packages/forms/src/components/FormField.tsx`
- Test: `packages/forms/tests/components/FormField.test.tsx` (extend existing file; migrate its fixtures)
- Modify (fixture sweep): every test registering renderers with the OLD flat shape (`({ id, value, onChange, props })`) in `tests/e2e/**` and `packages/forms/tests/**`, `packages/rilaykit/tests/**` — renderers move to the new context shape (`({ id, props, field })`).

**Interfaces:**
- Consumes: `ComponentRenderContext`, `FieldBinding` (Task 2); granular store hooks (unchanged).
- Produces: `FormFieldProps { id: string; config?: FormFieldConfig; disabled?: boolean; overrides?: Record<string, unknown>; className?: string; forceVisible?: boolean }` (styled renames: `fieldId`→`id`, `fieldConfig`→`config`, `customProps`→`overrides`; sweep ALL plan-internal and codebase callers: `FormBody` default, `FormListItem`, tests). The registered component renderer is now called with `ComponentRenderContext`: `{ id, props, field: { value, onChange, onBlur, error, disabled, isValidating, touched }, conditions, meta }`. Throws `NotFoundError` (was bare `Error`) for unknown field/component. The `fieldRenderer`/`useFieldRenderer` indirection is REMOVED.

- [ ] **Step 1: Write the failing test**

Add to `packages/forms/tests/components/FormField.test.tsx` (replacing old-shape fixtures in that file):

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotFoundError, ril, type ComponentRenderContext } from '@rilaykit/core';
import { Form, FormField, form } from '@rilaykit/forms';

const r = ril.create().component('text', {
  meta: { tone: 'plain' },
  renderer: ({ id, props, field, meta }: ComponentRenderContext<{ label?: string }>) => (
    <div>
      <input
        data-testid={id}
        aria-label={props.label}
        data-tone={String(meta?.tone)}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.length ? <p data-testid={`${id}-error`}>{field.error[0]?.message}</p> : null}
    </div>
  ),
});

describe('<Form.Field> new context', () => {
  it('wires field binding (value/onChange) and entry meta into the renderer', () => {
    const def = form.create(r, 'f').add({ id: 'name', type: 'text', props: { label: 'Name' } });
    render(
      <Form of={def} defaults={{ name: 'Karl' }}>
        <FormField id="name" />
      </Form>
    );
    const input = screen.getByTestId('name') as HTMLInputElement;
    expect(input.value).toBe('Karl');
    expect(input.dataset.tone).toBe('plain');
    fireEvent.change(input, { target: { value: 'Mazier' } });
    expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('Mazier');
  });

  it('applies overrides with highest prop precedence', () => {
    const def = form.create(r, 'f').add({ id: 'name', type: 'text', props: { label: 'From config' } });
    render(
      <Form of={def}>
        <FormField id="name" overrides={{ label: 'Overridden' }} />
      </Form>
    );
    expect(screen.getByLabelText('Overridden')).toBeInTheDocument();
  });

  it('throws NotFoundError for an unknown field id', () => {
    const def = form.create(r, 'f').add({ id: 'name', type: 'text', props: {} });
    expect(() =>
      render(
        <Form of={def}>
          <FormField id="ghost" />
        </Form>
      )
    ).toThrowError(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/components/FormField.test.tsx`
Expected: FAIL — renderer receives old flat shape (`field` undefined), `overrides` prop unknown.

- [ ] **Step 3: Write the implementation**

Rewrite the bottom half of `packages/forms/src/components/FormField.tsx` (keep lines 31-139 mechanics: context, granular selectors, fieldConfig lookup, effectiveConditions, handleChange, handleBlur, mergedProps — destructure the new prop names at the top: `{ id: fieldId, config: fieldConfigProp, overrides, ... }` so the internal variable names survive unchanged):

```tsx
import type { ComponentRenderContext, FormFieldConfig } from '@rilaykit/core';
import { NotFoundError } from '@rilaykit/core';
// ...existing imports unchanged

export interface FormFieldProps {
  id: string;
  /** Pre-resolved field config (used by FormListItem to skip allFields lookup) */
  config?: FormFieldConfig;
  disabled?: boolean;
  overrides?: Record<string, unknown>;
  className?: string;
  forceVisible?: boolean;
}
```

Replace the two bare throws:

```tsx
if (!fieldConfig) {
  throw new NotFoundError(`Field "${fieldId}" not found`, { key: fieldId });
}
const componentEntry = formConfig.config.getComponent(fieldConfig.componentId);
if (!componentEntry?.renderer) {
  throw new NotFoundError(`Component "${fieldConfig.componentId}" not found in catalog`, {
    key: `component:${fieldConfig.componentId}`,
  });
}
```

Replace the `renderProps` memo + wrapper block (old lines 141-203) with:

```tsx
const context: ComponentRenderContext<Record<string, unknown>> = useMemo(
  () => ({
    id: fieldId,
    props: mergedProps,
    field: {
      value,
      onChange: handleChange,
      onBlur: handleBlur,
      error: fieldState.errors,
      disabled: effectiveConditions.isFieldDisabled,
      isValidating,
      touched: fieldState.touched,
    },
    conditions: {
      visible: effectiveConditions.isVisible,
      disabled: effectiveConditions.isFieldDisabled,
      required: effectiveConditions.isFieldRequired,
      readonly: effectiveConditions.isFieldReadonly,
    },
    meta: componentEntry.meta,
  }),
  [fieldId, mergedProps, value, handleChange, handleBlur, fieldState.errors, fieldState.touched, isValidating, effectiveConditions, componentEntry.meta]
);

if (!effectiveConditions.isVisible) {
  return null;
}

return (
  <div
    className={className}
    data-field-id={fieldId}
    data-field-type={componentEntry.type}
    data-field-visible={effectiveConditions.isVisible}
    data-field-disabled={effectiveConditions.isFieldDisabled}
    data-field-required={effectiveConditions.isFieldRequired}
    data-field-readonly={effectiveConditions.isFieldReadonly}
  >
    {componentEntry.renderer(context)}
  </div>
);
```

Then the fixture sweep: `grep -rln "addComponent\|renderer:" tests/e2e packages/forms/tests packages/rilaykit/tests packages/core/tests/integration | grep -v node_modules` — for each fixture renderer, migrate to `.component()` + context shape (`({ id, props, field })`; read `field.value`, call `field.onChange`, read `field.error`). This is the plan's biggest mechanical step; do it file by file, running each file's tests as you go.

- [ ] **Step 4: Run the full suite + typecheck**

Run: `pnpm test && pnpm type-check`
Expected: PASS — everything green with new-shape renderers everywhere.

- [ ] **Step 5: Commit**

```bash
git add -A packages tests
git commit -m "feat(forms)!: FormField renders through typed ComponentRenderContext"
```

---

### Task 9: `Form.Submit`

**Files:**
- Create: `packages/forms/src/components/FormSubmit.tsx`
- Delete: `packages/forms/src/components/FormSubmitButton.tsx`
- Test: `packages/forms/tests/components/FormSubmit.test.tsx`
- Modify: usages of `FormSubmitButton` in `tests/e2e/forms/*.e2e.test.tsx`

**Interfaces:**
- Consumes: `useFormSubmitting()` store hook, `useFormConfigContext().submit`.
- Produces: `FormSubmitProps { children?: React.ReactNode | ((ctx: { submitting: boolean; submit: () => void }) => React.ReactNode); className?: string }`. Default: `<button type="submit" disabled={submitting}>`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/forms/tests/components/FormSubmit.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { Form, FormSubmit, form } from '@rilaykit/forms';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });

describe('<Form.Submit>', () => {
  it('renders a bare submit button by default', () => {
    render(
      <Form of={def}>
        <FormSubmit>Send</FormSubmit>
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Send' });
    expect(btn.getAttribute('type')).toBe('submit');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('exposes submitting/submit through the render prop', () => {
    render(
      <Form of={def}>
        <FormSubmit>
          {({ submitting }) => <button type="submit">{submitting ? 'Sending…' : 'Go'}</button>}
        </FormSubmit>
      </Form>
    );
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/components/FormSubmit.test.tsx`
Expected: FAIL — no export `FormSubmit`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/forms/src/components/FormSubmit.tsx
import React, { useCallback } from 'react';
import { useFormSubmitting } from '../stores';
import { useFormConfigContext } from './FormProvider';

export interface FormSubmitProps {
  children?: React.ReactNode | ((ctx: { submitting: boolean; submit: () => void }) => React.ReactNode);
  className?: string;
}

export const FormSubmit = React.memo(function FormSubmit({ children, className }: FormSubmitProps) {
  const { submit } = useFormConfigContext();
  const submitting = useFormSubmitting();
  const handleSubmit = useCallback(() => void submit(), [submit]);

  if (typeof children === 'function') {
    return <>{children({ submitting, submit: handleSubmit })}</>;
  }

  return (
    <button type="submit" className={className} disabled={submitting} data-form-submit>
      {children ?? 'Submit'}
    </button>
  );
});

export default FormSubmit;
```

Delete `FormSubmitButton.tsx`. Update `packages/forms/src/index.ts`: replace the `FormSubmitButton` export with `export { FormSubmit } from './components/FormSubmit';`. Sweep e2e usages: `<FormSubmitButton>` → `<FormSubmit>` (imports too).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms tests/e2e/forms && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms tests/e2e/forms
git commit -m "feat(forms)!: FormSubmit render-prop component replaces FormSubmitButton"
```

---

### Task 10: `Form.List` (repeatables)

**Files:**
- Create: `packages/forms/src/components/FormList.tsx`, `packages/forms/src/components/FormListItem.tsx`
- Delete: `packages/forms/src/components/repeatable-field.tsx`, `packages/forms/src/components/repeatable-item.tsx`
- Test: `packages/forms/tests/components/FormList.test.tsx`
- Modify: `packages/forms/src/components/FormBody.tsx` (default branch uses `FormList`), `packages/forms/src/index.ts`, repeatable e2e/integration tests that mount `RepeatableField`

**Interfaces:**
- Consumes: `useRepeatableField(repeatableId)` → `{ items, append, remove, move, canAdd, canRemove }` (existing hook, unchanged); `FormField` with `fieldConfig` prop; composite-key utils from `../utils/repeatable-data`.
- Produces:
  - `FormListProps { id: string; children?: (ctx: FormListContext) => React.ReactNode; className?: string }`
  - `FormListContext { items: RepeatableFieldItem[]; add: () => void; remove: (key: string) => void; move: (from: number, to: number) => void; canAdd: boolean; canRemove: boolean }`
  - `FormListItem` (internal): renders one item's rows/fields with composite ids — port of `repeatable-item.tsx` renderRows logic, minus the `repeatableItemRenderer` dispatch.
  - Resolves its `RepeatableFieldConfig` from `formConfig.repeatableFields[id]`; throws `NotFoundError` when the id is unknown.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/forms/tests/components/FormList.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotFoundError, ril } from '@rilaykit/core';
import { Form, FormList, form } from '@rilaykit/forms';

const r = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <input data-testid={id} value={String(field?.value ?? '')} onChange={(e) => field?.onChange(e.target.value)} />
  ),
});

const def = form
  .create(r, 'contacts')
  .addRepeatable('phones', (rb) => rb.add({ id: 'number', type: 'text', props: {} }), { min: 1, max: 2 });

describe('<Form.List>', () => {
  it('renders one item per default entry with an add button (bare default)', () => {
    render(
      <Form of={def}>
        <FormList id="phones" />
      </Form>
    );
    expect(screen.getAllByRole('textbox').length).toBe(1);
    fireEvent.click(document.querySelector('[data-form-list-add="phones"]') as HTMLElement);
    expect(screen.getAllByRole('textbox').length).toBe(2);
  });

  it('exposes items/add/remove through the render prop', () => {
    render(
      <Form of={def}>
        <FormList id="phones">
          {({ items, add, canAdd }) => (
            <div>
              <output data-testid="count">{items.length}</output>
              <button type="button" disabled={!canAdd} onClick={add} data-testid="my-add">+</button>
            </div>
          )}
        </FormList>
      </Form>
    );
    expect(screen.getByTestId('count').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('my-add'));
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('throws NotFoundError for an unknown list id', () => {
    expect(() =>
      render(
        <Form of={def}>
          <FormList id="ghost" />
        </Form>
      )
    ).toThrowError(NotFoundError);
  });
});
```

NOTE: `addRepeatable` verified at `packages/forms/src/builders/form.ts:335-346`; mirror the exact option names from `packages/forms/tests/builders/form-repeatable.test.ts` in this fixture before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/components/FormList.test.tsx`
Expected: FAIL — no export `FormList`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/forms/src/components/FormList.tsx
import type { RepeatableFieldItem } from '@rilaykit/core';
import { NotFoundError } from '@rilaykit/core';
import React from 'react';
import { useRepeatableField } from '../hooks/use-repeatable-field';
import { useFormConfigContext } from './FormProvider';
import { FormListItem } from './FormListItem';

export interface FormListContext {
  items: RepeatableFieldItem[];
  add: () => void;
  remove: (key: string) => void;
  move: (from: number, to: number) => void;
  canAdd: boolean;
  canRemove: boolean;
}

export interface FormListProps {
  id: string;
  children?: (ctx: FormListContext) => React.ReactNode;
  className?: string;
}

export const FormList = React.memo(function FormList({ id, children, className }: FormListProps) {
  const { formConfig } = useFormConfigContext();
  const repeatable = formConfig.repeatableFields?.[id];
  if (!repeatable) {
    throw new NotFoundError(`Repeatable "${id}" not found in form "${formConfig.id}"`, { key: id });
  }

  const { items, append, remove, move, canAdd, canRemove } = useRepeatableField(id);

  if (children) {
    return <>{children({ items, add: () => append(), remove, move, canAdd, canRemove })}</>;
  }

  return (
    <div className={className} data-list-id={id}>
      {items.map((item) => (
        <FormListItem key={item.key} item={item} />
      ))}
      {canAdd && (
        <button type="button" onClick={() => append()} data-testid={`${id}-add`}>
          Add
        </button>
      )}
    </div>
  );
});

export default FormList;
```

`FormListItem.tsx`: port `repeatable-item.tsx` verbatim MINUS the `repeatableItemRenderer` dispatch — it builds the per-item field-config map (composite ids) and renders `<div data-form-list-item={item.key}>` wrapping `item.rows` → visible fields → `<FormField id={compositeId} config={resolvedTemplate} />`. Copy the existing composite-key construction exactly from the old file (it uses `parseCompositeKey`'s inverse — keep identical behavior).

Update `FormBody.tsx` default branch: `<RepeatableField repeatableId=… repeatableConfig=…/>` → `<FormList id={row.repeatable.id} />` (adjust import). Update `packages/forms/src/index.ts`: remove `RepeatableField`/`RepeatableItem` exports, add `export { FormList } from './components/FormList'; export type { FormListContext, FormListProps } from './components/FormList';`. Sweep tests mounting `RepeatableField` (`tests/e2e/forms/form-repeatable.e2e.test.tsx`, `tests/e2e/workflow/workflow-with-repeatables.e2e.test.tsx`, `packages/forms/tests/integration/repeatable-*.test.tsx`) to `FormList` or the `<FormBody/>` default path.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/forms tests/e2e && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms tests/e2e
git commit -m "feat(forms)!: FormList compound replaces RepeatableField/RepeatableItem"
```

---

### Task 11: Form compound assembly + forms public surface

**Files:**
- Modify: `packages/forms/src/components/Form.tsx`, `packages/forms/src/index.ts`
- Delete: `packages/forms/src/components/FormRow.tsx`
- Test: `packages/forms/tests/components/form-compound.test.tsx`

**Interfaces:**
- Produces: `Form.Body`, `Form.Field`, `Form.Submit`, `Form.List` attached via `Object.assign` on the root. `useFormConfigContext` is renamed **`useForm`** (the exact mirror of `useFlow` — same context value, styled name; rename at the definition site in `FormProvider.tsx`, sweep ALL internal callers: FormField, FormBody hooks, FormSubmit, FormList, workflow package imports, tests). Public surface of `@rilaykit/forms`: `Form` (compound), `FormProvider`/`useForm` (engine access), builders, stores, hooks (incl. `useFormRows`), schema module, repeatable utils. `FormBody/FormField/FormSubmit/FormList` remain individually importable (tree-shaking), `FormRow` is gone.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/forms/tests/components/form-compound.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { Form, form } from '@rilaykit/forms';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });

describe('Form compound namespace', () => {
  it('exposes Body/Field/Submit/List on Form', () => {
    render(
      <Form of={def}>
        <Form.Body />
        <Form.Submit>Send</Form.Submit>
      </Form>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(typeof Form.Field).toBe('object'); // React.memo component
    expect(typeof Form.List).toBe('object');
  });

  it('exports useForm and drops useFormConfigContext', async () => {
    const mod = await import('@rilaykit/forms');
    expect(typeof mod.useForm).toBe('function');
    expect('useFormConfigContext' in mod).toBe(false);
  });

  it('no longer exports FormRow', async () => {
    const mod = await import('@rilaykit/forms');
    expect('FormRow' in mod).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/forms/tests/components/form-compound.test.tsx`
Expected: FAIL — `Form.Body` undefined.

- [ ] **Step 3: Write the implementation**

In `Form.tsx`, rename the function to `FormRoot` (not exported) and assemble:

```tsx
import { FormBody } from './FormBody';
import { FormField } from './FormField';
import { FormList } from './FormList';
import { FormSubmit } from './FormSubmit';

// ...FormRoot function as written in Task 6 (renamed)...

export const Form = Object.assign(FormRoot, {
  Body: FormBody,
  Field: FormField,
  Submit: FormSubmit,
  List: FormList,
});

export default Form;
```

Delete `FormRow.tsx` (its visibility logic now lives in `useFormRows`; nothing imports it — verify with `grep -rn "FormRow" packages tests | grep -v node_modules` and clean stragglers). Rewrite `packages/forms/src/index.ts`:

```typescript
export { Form } from './components/Form';
export type { FormProps } from './components/Form';
export { FormBody } from './components/FormBody';
export type { FormBodyProps } from './components/FormBody';
export { FormField } from './components/FormField';
export type { FormFieldProps } from './components/FormField';
export { FormSubmit } from './components/FormSubmit';
export type { FormSubmitProps } from './components/FormSubmit';
export { FormList } from './components/FormList';
export type { FormListContext, FormListProps } from './components/FormList';
export { FormProvider, useForm } from './components/FormProvider';
export type { FormConfigContextValue, FormProviderProps } from './components/FormProvider';

export { form as FormBuilder, form } from './builders/form';
export type { FieldConfig } from './builders/form';
export { RepeatableBuilder } from './builders/repeatable-builder';

export * from './stores';
export * from './hooks';
export type { ConditionEvaluationResult } from './hooks/useConditionEvaluation';
export { structureFormValues, flattenRepeatableValues } from './utils/repeatable-data';
export * from './schema';
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/forms tests
git commit -m "feat(forms)!: Form compound namespace, FormRow removed"
```

---

### Task 12: `Flow` root + `Flow.Body`

**Files:**
- Create: `packages/workflow/src/components/Flow.tsx`, `packages/workflow/src/components/FlowBody.tsx`
- Delete: `packages/workflow/src/components/Workflow.tsx`, `packages/workflow/src/components/WorkflowBody.tsx`
- Test: `packages/workflow/tests/components/Flow.test.tsx`
- Modify: `packages/workflow/src/index.ts`; `tests/e2e/workflow/*.e2e.test.tsx` usages of `<Workflow>`/`<WorkflowBody>`

**Interfaces:**
- Consumes: `WorkflowProvider` + `WorkflowProviderProps` (engine, unchanged — check its exact prop names in `WorkflowProvider.tsx:98-106` before mapping), `flow` builder, new `FormBody`.
- Produces:
  - `FlowProps = Omit<WorkflowProviderProps, 'children' | 'workflowConfig' | 'defaultValues' | 'onWorkflowComplete'> & { of: WorkflowConfig | flow; defaults?: Record<string, unknown>; onComplete?: WorkflowProviderProps['onWorkflowComplete']; children: React.ReactNode }`
  - `FlowBodyProps { stepId?: string; children?: React.ReactNode | ((ctx: { step: StepConfig }) => React.ReactNode) }` — precedence: custom `step.renderer(step)` → render-prop/children → `<FormBody />` default (port the existing `WorkflowBody.tsx` dispatch, swapping the old FormBody).
  - Compound assembly happens in Task 14 (after Progress/Nav exist).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/workflow/tests/components/Flow.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, FlowBody, flow } from '@rilaykit/workflow';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const stepForm = form.create(r, 's1').add({ id: 'email', type: 'text', props: {} });
const wf = flow
  .create(r, 'onboarding', 'Onboarding')
  .addStep({ id: 'personal', title: 'Personal', formConfig: stepForm.build() });

describe('<Flow of> + <Flow.Body>', () => {
  it('renders the current step form through FlowBody default', () => {
    render(
      <Flow of={wf} defaults={{}}>
        <FlowBody />
      </Flow>
    );
    expect(screen.getByTestId('email')).toBeInTheDocument();
  });

  it('supports the render-prop children with step context', () => {
    render(
      <Flow of={wf}>
        <FlowBody>{({ step }) => <h1 data-testid="title">{step.title}</h1>}</FlowBody>
      </Flow>
    );
    expect(screen.getByTestId('title').textContent).toBe('Personal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/components/Flow.test.tsx`
Expected: FAIL — no export `Flow`.

- [ ] **Step 3: Write the implementation**

`Flow.tsx` (port of `Workflow.tsx` with renamed props):

```tsx
import type { WorkflowConfig } from '@rilaykit/core';
import type React from 'react';
import { useMemo } from 'react';
import { flow } from '../builders/flow';
import type { WorkflowProviderProps } from './WorkflowProvider';
import { WorkflowProvider } from './WorkflowProvider';

export type FlowProps = Omit<
  WorkflowProviderProps,
  'children' | 'workflowConfig' | 'defaultValues' | 'onWorkflowComplete'
> & {
  of: WorkflowConfig | flow;
  defaults?: Record<string, unknown>;
  onComplete?: WorkflowProviderProps['onWorkflowComplete'];
  children: React.ReactNode;
};

function FlowRoot({ children, of, defaults, onComplete, ...props }: FlowProps) {
  const resolvedConfig = useMemo(() => (of instanceof flow ? of.build() : of), [of]);

  return (
    <WorkflowProvider
      {...props}
      workflowConfig={resolvedConfig}
      defaultValues={defaults}
      onWorkflowComplete={onComplete}
    >
      {children}
    </WorkflowProvider>
  );
}

export { FlowRoot };
```

(Prop names verified against `WorkflowProvider.tsx:98-106`: `WorkflowProviderProps = { children, workflowConfig, defaultValues?, defaultStep?, onStepChange?, onWorkflowComplete?, className? }` — the mapping above is exact; `defaultStep`/`onStepChange`/`className` pass through untouched via `...props`.)

`FlowBody.tsx` (port of `WorkflowBody.tsx`, 42 lines — same current-step resolution via `useWorkflowContext`, then):

```tsx
if (currentStep.renderer) return currentStep.renderer(currentStep);
if (typeof children === 'function') return <>{children({ step: currentStep })}</>;
if (children) return <>{children}</>;
return <FormBody />;
```

Export both from `packages/workflow/src/index.ts` (add `Flow` root export as `export { FlowRoot as Flow }` temporarily — Task 14 replaces it with the compound). Delete old files; sweep e2e workflow tests: `<Workflow workflowConfig={x} …>` → `<Flow of={x} …>` (map `defaultValues`→`defaults`, `onWorkflowComplete`→`onComplete`), `<WorkflowBody>` → `<FlowBody>`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/workflow tests/e2e/workflow && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/workflow tests/e2e/workflow
git commit -m "feat(workflow)!: Flow root (of/defaults/onComplete) and FlowBody"
```

---

### Task 13: `Flow.Progress`

**Files:**
- Create: `packages/workflow/src/components/FlowProgress.tsx`, `packages/workflow/src/hooks/useFlowSteps.ts`
- Delete: `packages/workflow/src/components/WorkflowStepper.tsx`
- Test: `packages/workflow/tests/components/FlowProgress.test.tsx`
- Modify: `packages/workflow/src/index.ts`, `packages/workflow/src/hooks/index.ts`, e2e usages of `<WorkflowStepper>`

**Interfaces:**
- Consumes: `useWorkflowContext` (visible-step filtering + index mapping logic ported from `WorkflowStepper.tsx:1-87` — reuse its exact visibility computation).
- Produces:
  - `useFlowSteps(): { steps: StepConfig[]; currentIndex: number; goTo: (visibleIndex: number) => void }` — `steps` are VISIBLE steps, `currentIndex` is the index within them, `goTo` maps back to the original index before navigating.
  - `FlowProgressProps { children?: (ctx: ReturnType<typeof useFlowSteps>) => React.ReactNode; className?: string }`. Default: `<ol data-flow-progress>` with `<li data-active={i === currentIndex}>{step.title}</li>`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/workflow/tests/components/FlowProgress.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, FlowProgress, flow } from '@rilaykit/workflow';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const step = (id: string) => ({
  id,
  title: id.toUpperCase(),
  formConfig: form.create(r, id).add({ id: `${id}-f`, type: 'text', props: {} }).build(),
});

const wf = flow
  .create(r, 'wf', 'WF')
  .addStep(step('a'))
  .addStep({ ...step('b'), conditions: { visible: when('a.a-f').equals('show-b') } })
  .addStep(step('c'));

describe('<Flow.Progress>', () => {
  it('lists only visible steps, bare default', () => {
    render(
      <Flow of={wf}>
        <FlowProgress />
      </Flow>
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['A', 'C']);
    expect(items[0]?.dataset.active).toBe('true');
  });

  it('exposes steps/currentIndex/goTo via render prop', () => {
    render(
      <Flow of={wf}>
        <FlowProgress>
          {({ steps, currentIndex }) => (
            <output data-testid="p">{`${currentIndex}/${steps.length}`}</output>
          )}
        </FlowProgress>
      </Flow>
    );
    expect(screen.getByTestId('p').textContent).toBe('0/2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/components/FlowProgress.test.tsx`
Expected: FAIL — no export `FlowProgress`.

- [ ] **Step 3: Write the implementation**

`useFlowSteps.ts`: extract from `WorkflowStepper.tsx` its visible-steps computation and visible↔original index mapping (copy the existing memoized logic verbatim into the hook), plus `goTo`:

```typescript
import type { StepConfig } from '@rilaykit/core';
import { useCallback, useMemo } from 'react';
import { useWorkflowContext } from '../components/WorkflowProvider';

export interface FlowStepsContext {
  steps: StepConfig[];
  currentIndex: number;
  goTo: (visibleIndex: number) => void;
}

// Ported verbatim from WorkflowStepper.tsx:21-62 (deleted in this task)
export function useFlowSteps(): FlowStepsContext {
  const { workflowConfig, workflowState, goToStep, conditionsHelpers } = useWorkflowContext();

  const { visibleSteps, visibleToOriginal, originalToVisible } = useMemo(() => {
    const visible: StepConfig[] = [];
    const toOriginal = new Map<number, number>();
    const toVisible = new Map<number, number>();
    workflowConfig.steps.forEach((step, originalIndex) => {
      if (conditionsHelpers.isStepVisible(originalIndex)) {
        toOriginal.set(visible.length, originalIndex);
        toVisible.set(originalIndex, visible.length);
        visible.push(step);
      }
    });
    return { visibleSteps: visible, visibleToOriginal: toOriginal, originalToVisible: toVisible };
  }, [workflowConfig.steps, conditionsHelpers]);

  const currentIndex = useMemo(
    () => originalToVisible.get(workflowState.currentStepIndex) ?? -1,
    [originalToVisible, workflowState.currentStepIndex]
  );

  const goTo = useCallback(
    (visibleIndex: number) => {
      const originalIndex = visibleToOriginal.get(visibleIndex);
      if (originalIndex === undefined) return;
      void goToStep(originalIndex);
    },
    [visibleToOriginal, goToStep]
  );

  return { steps: visibleSteps, currentIndex, goTo };
}
```

`FlowProgress.tsx`:

```tsx
import React from 'react';
import { useFlowSteps } from '../hooks/useFlowSteps';
import type { FlowStepsContext } from '../hooks/useFlowSteps';

export interface FlowProgressProps {
  children?: (ctx: FlowStepsContext) => React.ReactNode;
  className?: string;
}

export const FlowProgress = React.memo(function FlowProgress({ children, className }: FlowProgressProps) {
  const ctx = useFlowSteps();

  if (children) {
    return <>{children(ctx)}</>;
  }

  return (
    <ol className={className} data-flow-progress>
      {ctx.steps.map((step, index) => (
        <li key={step.id} data-active={index === ctx.currentIndex ? 'true' : 'false'}>
          {step.title}
        </li>
      ))}
    </ol>
  );
});

export default FlowProgress;
```

Delete `WorkflowStepper.tsx`; export `FlowProgress` + `useFlowSteps` from the package indexes; sweep e2e `<WorkflowStepper>` usages.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/workflow tests/e2e/workflow && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/workflow tests/e2e/workflow
git commit -m "feat(workflow)!: FlowProgress + useFlowSteps replace WorkflowStepper"
```

---

### Task 14: `Flow.Next` / `Flow.Back` / `Flow.Skip` + dynamic `allowSkip` + compound assembly

**Files:**
- Create: `packages/workflow/src/components/FlowNav.tsx`
- Delete: `packages/workflow/src/components/WorkflowNextButton.tsx`, `WorkflowPreviousButton.tsx`, `WorkflowSkipButton.tsx`
- Modify: `packages/core/src/types/index.ts` (`StepConfig.allowSkip` type), `packages/workflow/src/components/Flow.tsx` (compound assembly), `packages/workflow/src/index.ts`, skip-resolution site(s) (grep `allowSkip` in `packages/workflow/src` — normalize through the new helper), e2e nav-button usages
- Test: `packages/workflow/tests/components/FlowNav.test.tsx`

**Interfaces:**
- Consumes: `useWorkflowContext` — members verified against `WorkflowProvider.tsx:46-90`: `{ context, workflowState, currentStep, goPrevious, skipStep, canSkipCurrentStep }`; `useFormConfigContext().submit` (becomes `useForm` after Task 11 — use whichever name exists at execution time), `useFormSubmitting`.
- Produces:
  - `StepConfig.allowSkip?: boolean | ((ctx: { allData: Record<string, unknown> }) => boolean)` (core type widened).
  - `resolveAllowSkip(step: StepConfig, allData: Record<string, unknown>): boolean` exported from `packages/workflow/src/utils/resolveAllowSkip.ts`.
  - `FlowNavContext { go: () => void; canGo: boolean; submitting: boolean; isLastStep: boolean; step: StepConfig }`
  - `FlowNextProps/FlowBackProps/FlowSkipProps { children?: React.ReactNode | ((ctx: FlowNavContext) => React.ReactNode); className?: string }`
  - `Flow` compound: `Flow.Body`, `Flow.Progress`, `Flow.Next`, `Flow.Back`, `Flow.Skip`.
  - Defaults: `<button type="button" data-flow-next|back|skip disabled={!canGo}>`; `Flow.Skip` renders `null` when `resolveAllowSkip` is false.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/workflow/tests/components/FlowNav.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, flow } from '@rilaykit/workflow';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  formConfig: form.create(r, id).add({ id: `${id}-f`, type: 'text', props: {} }).build(),
  ...extra,
});

describe('Flow nav buttons', () => {
  it('Next advances to the next step (bare default)', async () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Next>Continue</Flow.Next>
      </Flow>
    );
    expect(screen.getByTestId('a-f')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('b-f')).toBeInTheDocument();
  });

  it('Back render prop exposes canGo=false on first step', () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Back>{({ canGo }) => <output data-testid="can-back">{String(canGo)}</output>}</Flow.Back>
      </Flow>
    );
    expect(screen.getByTestId('can-back').textContent).toBe('false');
  });

  it('Skip honours a dynamic allowSkip predicate', () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a', { allowSkip: (ctx: { allData: Record<string, unknown> }) => ctx.allData.vip === true }))
      .addStep(step('b'));
    render(
      <Flow of={wf} defaults={{}}>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('Skip renders when allowSkip is true', () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a', { allowSkip: true })).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/components/FlowNav.test.tsx`
Expected: FAIL — `Flow.Next` undefined.

- [ ] **Step 3: Write the implementation**

Core type change (`packages/core/src/types/index.ts`, `StepConfig`):

```typescript
readonly allowSkip?: boolean | ((ctx: { allData: Record<string, unknown> }) => boolean);
```

`packages/workflow/src/utils/resolveAllowSkip.ts`:

```typescript
import type { StepConfig } from '@rilaykit/core';

export function resolveAllowSkip(step: StepConfig, allData: Record<string, unknown>): boolean {
  if (typeof step.allowSkip === 'function') {
    return step.allowSkip({ allData });
  }
  return step.allowSkip === true;
}
```

Grep `allowSkip` in `packages/workflow/src` (provider/navigation/submission) and route every boolean read through `resolveAllowSkip(step, allData)`.

Route the provider's skip logic through the predicate: in `WorkflowProvider.tsx`, `canSkipCurrentStep()` currently reads `currentStep.allowSkip` as a boolean — replace that read with `resolveAllowSkip(currentStep, <allData source used there>)` (grep `allowSkip` in `packages/workflow/src` and normalize every site).

`FlowNav.tsx` — one parametric internal + three thin exports (single file is deliberate: one *exported* concept per file, Next/Back/Skip are projections of FlowNav). Context member names verified against `WorkflowProvider.tsx:46-90` (`workflowState.{isSubmitting,isTransitioning}`, `context.{isFirstStep,isLastStep,allData}`, `goPrevious`, `skipStep`, `canSkipCurrentStep`):

```tsx
import type { StepConfig } from '@rilaykit/core';
import { useFormConfigContext, useFormSubmitting } from '@rilaykit/forms';
import React, { useCallback, useMemo } from 'react';
import { resolveAllowSkip } from '../utils/resolveAllowSkip';
import { useWorkflowContext } from './WorkflowProvider';

export interface FlowNavContext {
  go: () => void;
  canGo: boolean;
  submitting: boolean;
  isLastStep: boolean;
  step: StepConfig;
}

interface FlowNavProps {
  children?: React.ReactNode | ((ctx: FlowNavContext) => React.ReactNode);
  className?: string;
}

type Direction = 'next' | 'back' | 'skip';

function useFlowNav(direction: Direction): FlowNavContext & { hidden: boolean } {
  const { context, workflowState, currentStep, goPrevious, skipStep } = useWorkflowContext();
  const { submit } = useFormConfigContext();
  const formSubmitting = useFormSubmitting();

  const submitting = formSubmitting || workflowState.isSubmitting;
  const busy = workflowState.isTransitioning || submitting;
  const allowSkip = resolveAllowSkip(currentStep, context.allData);

  const canGo = useMemo(() => {
    if (direction === 'back') return !context.isFirstStep && !busy;
    if (direction === 'skip') return allowSkip && !busy;
    return !busy;
  }, [direction, context.isFirstStep, allowSkip, busy]);

  const go = useCallback(() => {
    if (!canGo) return;
    if (direction === 'next') void submit();
    else if (direction === 'back') void goPrevious();
    else void skipStep();
  }, [canGo, direction, submit, goPrevious, skipStep]);

  return {
    go,
    canGo,
    submitting,
    isLastStep: context.isLastStep,
    step: currentStep,
    hidden: direction === 'skip' && !allowSkip,
  };
}

function createNavButton(direction: Direction, label: string) {
  return React.memo(function FlowNavButton({ children, className }: FlowNavProps) {
    const { hidden, ...ctx } = useFlowNav(direction);

    if (hidden) {
      return null;
    }
    if (typeof children === 'function') {
      return <>{children(ctx)}</>;
    }
    return (
      <button
        type="button"
        className={className}
        disabled={!ctx.canGo}
        onClick={ctx.go}
        data-flow-nav={direction}
      >
        {children ?? label}
      </button>
    );
  });
}

export const FlowNext = createNavButton('next', 'Next');
export const FlowBack = createNavButton('back', 'Back');
export const FlowSkip = createNavButton('skip', 'Skip');
```

Compound assembly in `Flow.tsx`:

```tsx
import { FlowBody } from './FlowBody';
import { FlowProgress } from './FlowProgress';
import { FlowBack, FlowNext, FlowSkip } from './FlowNav';

export const Flow = Object.assign(FlowRoot, {
  Body: FlowBody,
  Progress: FlowProgress,
  Next: FlowNext,
  Back: FlowBack,
  Skip: FlowSkip,
});

export default Flow;
```

Update `packages/workflow/src/index.ts` (export compound `Flow` + individual components + `resolveAllowSkip` + `export type { FlowNavContext } from './components/FlowNav';`), delete the three old button files, sweep e2e usages (`WorkflowNextButton`→`Flow.Next` etc. — old render-prop children `{(p) => …}` shapes must map onto `FlowNavContext`).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/workflow tests/e2e/workflow && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/core packages/workflow tests/e2e/workflow
git commit -m "feat(workflow)!: parametric FlowNav buttons, dynamic allowSkip, Flow compound"
```

---

### Task 15: `useFlow*` hook family renames

**Files:**
- Modify: `packages/workflow/src/components/WorkflowProvider.tsx` (export rename), `packages/workflow/src/stores/workflowStore.ts` (selector renames), `packages/workflow/src/hooks/index.ts`, `packages/workflow/src/index.ts`
- Create: `packages/workflow/src/hooks/useStep.ts`
- Test: `packages/workflow/tests/hooks/flow-hooks.test.tsx`
- Modify: every internal + test caller of the old names

**Interfaces:**
- Produces (exact rename map — MIGRATION.md copies this):
  | Old | New |
  |---|---|
  | `useWorkflowContext` | `useFlow` |
  | `useWorkflowAllData` | `useFlowData` |
  | `useWorkflowStepData` | `useStepData` |
  | `useWorkflowActions` | `useFlowActions` |
  | `UseWorkflowActionsResult` (type) | `UseFlowActionsResult` |
  | `useWorkflowStore` | `useFlowStore` |
  | `useWorkflowStoreApi` | `useFlowStoreApi` |
  | `useCurrentStepIndex` | `useFlowStepIndex` |
  | `useWorkflowNavigationState` | `useFlowNavigationState` |
  | `useWorkflowSubmitState` | `useFlowSubmitState` |
  | `useWorkflowSubmitting` | `useFlowSubmitting` |
  | `useWorkflowTransitioning` | `useFlowTransitioning` |
  | `useWorkflowInitializing` | `useFlowInitializing` |

  Unchanged: `useVisitedSteps`, `usePassedSteps`, `useIsStepVisited`, `useIsStepPassed`, `useStepDataById`, logic hooks (`usePersistence`, `useWorkflowAnalytics` → stays, it names the analytics domain, etc.).
- New: `useStep(): { step: StepConfig; index: number; metadata: Record<string, unknown> }` — current step + its metadata (reads `useFlow().currentStep`, `context.currentStepIndex`, `currentStep.metadata ?? {}`).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/workflow/tests/hooks/flow-hooks.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, flow, useFlow, useFlowData, useStep } from '@rilaykit/workflow';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const wf = flow.create(r, 'wf', 'WF').addStep({
  id: 'a',
  title: 'Step A',
  metadata: { hero: 'yes' },
  formConfig: form.create(r, 'a').add({ id: 'a-f', type: 'text', props: {} }).build(),
});

function Probe() {
  const { currentStep } = useFlow();
  const { step, index, metadata } = useStep();
  const data = useFlowData();
  return (
    <output data-testid="probe">{`${currentStep.id}|${step.title}|${index}|${metadata.hero}|${Object.keys(data).length}`}</output>
  );
}

describe('useFlow* family', () => {
  it('exposes flow context, current step and data', () => {
    render(
      <Flow of={wf}>
        <Probe />
      </Flow>
    );
    expect(screen.getByTestId('probe').textContent).toBe('a|Step A|0|yes|0');
  });

  it('old names are gone from the public surface', async () => {
    const mod = await import('@rilaykit/workflow');
    expect('useWorkflowContext' in mod).toBe(false);
    expect('useWorkflowAllData' in mod).toBe(false);
    expect('useCurrentStepIndex' in mod).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow/tests/hooks/flow-hooks.test.tsx`
Expected: FAIL — no export `useFlow`.

- [ ] **Step 3: Write the implementation**

Rename per the map (definition site rename + `grep -rln "<oldName>" packages tests | grep -v node_modules` sweep per name, imports included). `useStep.ts`:

```typescript
import type { StepConfig } from '@rilaykit/core';
import { useFlow } from '../components/WorkflowProvider';

export interface StepContextValue {
  step: StepConfig;
  index: number;
  metadata: Record<string, unknown>;
}

export function useStep(): StepContextValue {
  const { currentStep, context } = useFlow();
  return {
    step: currentStep,
    index: context.currentStepIndex,
    metadata: currentStep.metadata ?? {},
  };
}
```

Export from hooks/index + package index (`export { useStep } from './hooks/useStep'; export type { StepContextValue } from './hooks/useStep'; export type { FlowStepsContext } from './hooks/useFlowSteps';`). Internal callers to update: `FlowNav.tsx`, `FlowBody.tsx`, `FlowProgress.tsx`/`useFlowSteps.ts`, any hook files importing `useWorkflowContext`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages tests
git commit -m "feat(workflow)!: rename hook family to useFlow*, add useStep"
```

---

### Task 16: The Delete — renderConfig layer, wrapper, metadata, V2, legacy shims

**Files:**
- Delete: `packages/core/src/components/ComponentRendererWrapper.tsx`, `packages/core/src/utils/componentHelpers.tsx`, `packages/core/src/types/context.ts`
- Modify: `packages/core/src/config/ril.ts`, `packages/core/src/types/index.ts`, `packages/core/src/index.ts`, `packages/forms/src/builders/form.ts:872`, `packages/workflow/src/builders/flow.ts:798`, `packages/forms/src/components/FormProvider.tsx` (if it reads renderConfig), core tests
- Test: `packages/core/tests/catalog/surface.test.ts`

**Interfaces:**
- Produces the FINAL core surface. Deleted symbols (none may remain exported): `ComponentRendererWrapper`, `resolveRendererChildren`, `ComponentRendererBaseProps`, `ComponentRendererWrapperProps`, `ComponentRenderProps`, `ComponentRenderer`, `RendererChildrenFunction`, `ComponentConfig`, `FormRenderConfig`, `WorkflowRenderConfig`, `FormRowRenderer(Props)`, `FormBodyRenderer(Props)`, `FormSubmitButtonRenderer(Props)`, `FieldRenderer(Props)`, `FormComponentRendererProps`, `RepeatableFieldRenderer(Props)`, `RepeatableItemRenderer(Props)`, `WorkflowStepperRenderer(Props)`, `WorkflowNextButtonRenderer(Props)`, `WorkflowPreviousButtonRenderer(Props)`, `WorkflowSkipButtonRenderer(Props)`, `WorkflowComponentRendererBaseProps`, `PropertyEditorDefinition`, `PropertyEditorProps`, `ComponentBuilderMetadata`, `FieldSchemaDefinition`, everything from `types/context.ts` (V2), `ril.addComponent`, `ril.configure`, `ril.getFormRenderConfig`, `ril.getWorkflowRenderConfig`, `useFieldRenderer` field, `FormConfiguration.renderConfig`, `WorkflowConfig.renderConfig`, `getStats().hasCustomRenderers`.
- `getStats()` slims to the flat, styled shape `{ total: number; components: number; tools: number; parts: number }`. `validate()` drops the renderer-key checks and the "components without renderer" error becomes a WARNING in `validateAsync` only (renderer-less entries are legit blueprints now).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/catalog/surface.test.ts
import { describe, expect, it } from 'vitest';
import * as core from '@rilaykit/core';
import { ril } from '@rilaykit/core';

describe('core public surface after de-renderer-ification', () => {
  it.each([
    'ComponentRendererWrapper',
    'ComponentBuilderMetadata',
    'PropertyEditorDefinition',
    'FieldSchemaDefinition',
  ])('does not export %s', (name) => {
    expect(name in core).toBe(false);
  });

  it('ril has no configure/addComponent anymore', () => {
    const r = ril.create();
    expect('configure' in r).toBe(false);
    expect('addComponent' in r).toBe(false);
  });

  it('getStats counts entries by kind', () => {
    const r = ril
      .create()
      .component('text', {})
      .tool('show_form', {})
      .part('text', { renderer: () => null as never });
    expect(r.getStats()).toEqual({ total: 3, components: 1, tools: 1, parts: 1 });
  });

  it('validate() accepts renderer-less blueprint entries', () => {
    const r = ril.create().component('text', { description: 'blueprint only' });
    expect(r.validate()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/catalog/surface.test.ts`
Expected: FAIL — `configure` still present / old getStats shape.

- [ ] **Step 3: Execute the delete**

Order of operations (compile-driven):
1. `ril.ts`: remove `addComponent`, `configure`, `getFormRenderConfig`, `getWorkflowRenderConfig`, the `formRenderConfig`/`workflowRenderConfig` fields (and their copies in `cloneWith`/`clone`/`clear`), `deepMerge` (now unused), the renderer-key blocks in `validate()`, and reshape `getStats()`:

```typescript
getStats(): { total: number; components: number; tools: number; parts: number } {
  const counts = { component: 0, tool: 0, part: 0 };
  for (const entry of this.entries.values()) {
    counts[(entry as { kind: 'component' | 'tool' | 'part' }).kind] += 1;
  }
  return { total: this.entries.size, components: counts.component, tools: counts.tool, parts: counts.part };
}
```

2. `types/index.ts`: delete sections 3's legacy renderer types, the builder-metadata block (lines 139-247), `FormRenderConfig` + `renderConfig` field on `FormConfiguration`, `WorkflowRenderConfig` + `renderConfig` on `WorkflowConfig`, all `*RendererProps`/`*Renderer` aliases listed above, `useFieldRenderer` and `builder` on the old `ComponentConfig`, then delete `ComponentConfig` itself. Delete `export * from './context'` + the file.
3. `core/src/index.ts`: drop the wrapper/componentHelpers exports.
4. `form.ts:872` and `flow.ts:798`: remove the `renderConfig:` line from the built object.
5. `FormProvider.tsx` / anything else: `grep -rn "renderConfig\|useFieldRenderer\|ComponentRendererWrapper\|ComponentRenderProps\|RendererChildrenFunction" packages tests | grep -v node_modules` → fix every hit (mostly deletions; remaining old core tests `ril.test.ts`/`ril-immutable.test.ts`/`form-builder.test.ts` are rewritten against the new facade: registration via `.component()`, no `configure`).

- [ ] **Step 4: Run the full suite + typecheck + lint**

Run: `pnpm test && pnpm type-check && pnpm check`
Expected: PASS, zero references to deleted symbols.

- [ ] **Step 5: Commit**

```bash
git add -A packages tests
git commit -m "refactor(core)!: delete renderConfig layer, wrapper, builder metadata and V2 types"
```

---

### Task 17: `rilaykit` all-in-one alignment

**Files:**
- Modify: `packages/rilaykit/src/create-ril.ts`, `packages/rilaykit/src/index.ts`
- Test: `packages/rilaykit/tests/create-ril.test.ts` (update), `packages/rilaykit/tests/surface.test.ts` (new)

**Interfaces:**
- Consumes: everything above.
- Produces: `rilaykit` re-exports the new surface: compound `Form`, `Flow`, `useFlow*` family (selective re-export replaces the old `use*Workflow*` list at `index.ts:52-74`), catalog facades chain on the enhanced `ril` — `ril.create().component(…).tool(…).use(…).renderers(…).form(…)`/`.flow(…)` all preserve the enhanced type (read `create-ril.ts` first: it wraps core's `ril` with `.form()`/`.flow()`; every facade returning `ril<C>` must keep returning the ENHANCED instance — apply the same wrapper technique create-ril already uses for `addComponent`… which is now `component`).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/rilaykit/tests/surface.test.ts
import { describe, expect, it } from 'vitest';
import * as kit from 'rilaykit';
import { ril } from 'rilaykit';

describe('rilaykit all-in-one surface', () => {
  it('exposes the compound components and flow hooks', () => {
    expect(typeof kit.Form).toBe('function');
    expect('Body' in kit.Form).toBe(true);
    expect(typeof kit.Flow).toBe('function');
    expect('Progress' in kit.Flow).toBe(true);
    expect(typeof kit.useFlow).toBe('function');
    expect('Workflow' in kit).toBe(false);
    expect('WorkflowStepper' in kit).toBe(false);
  });

  it('enhanced ril chains catalog facades and keeps .form()/.flow()', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => null as never })
      .tool('show_form', {});
    const f = r.form('login');
    expect(f).toBeDefined();
    const w = r.flow('wf', 'WF');
    expect(w).toBeDefined();
    expect(r.getTool('show_form')?.kind).toBe('tool');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/rilaykit/tests/surface.test.ts`
Expected: FAIL — old exports still present / chain loses `.form()`.

- [ ] **Step 3: Write the implementation**

Read `packages/rilaykit/src/create-ril.ts` fully, then: replace its `addComponent`/`configure` override list with the new facade set (`component`, `tool`, `part`, `use`, `renderers`, `removeComponent`, `clone`, `clear` — each override delegates to `super`/wrapped instance then re-wraps into the enhanced class so `.form()`/`.flow()` survive chaining; keep the existing wrapper technique of the file). Update `packages/rilaykit/src/index.ts`: re-export forms surface (`Form`, `FormBody`, `FormField`, `FormSubmit`, `FormList`, hooks, stores, schema), selective workflow re-exports become: `Flow`, `FlowBody`, `FlowProgress`, `FlowNext`, `FlowBack`, `FlowSkip`, `useFlow`, `useFlowData`, `useStep`, `useFlowSteps`, `useFlowActions`, `useFlowStore`, `useFlowStoreApi`, `useFlowStepIndex`, `useFlowNavigationState`, `useFlowSubmitState`, `useFlowSubmitting`, `useFlowTransitioning`, `useFlowInitializing`, `useStepData`, `useStepDataById`, `useVisitedSteps`, `usePassedSteps`, `useIsStepVisited`, `useIsStepPassed`, persistence exports, `flow`, `resolveAllowSkip`, `combineWorkflowDataForConditions`, `flattenObject` (KEEP excluding `useConditionEvaluation`/`ConditionEvaluationResult` from workflow — same clash rule as before). Update `create-ril.test.ts` fixtures to `.component()`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/rilaykit
git commit -m "feat(rilaykit)!: all-in-one re-exports new catalog and compound surface"
```

---

### Task 18: MIGRATION.md + final gate

**Files:**
- Create: `MIGRATION.md`
- Modify: `packages/*/README.md` ONLY if they show now-dead APIs in the quick-start snippet (check `packages/rilaykit/README.md` first)

**Interfaces:** none (documentation + verification).

- [ ] **Step 1: Write MIGRATION.md**

Content skeleton (fill every row from the actual diffs of Tasks 1-17 — the tables in the spec §10 and Task 15 are the source; verify each name against the final exports):

```markdown
# Migrating to RilayKit 0.2

RilayKit 0.2 removes the renderer-configuration layer entirely. You now compose
markup with compound headless components; the `ril` instance is a pure catalog.

## Catalog
| 0.1 | 0.2 |
|---|---|
| `ril.create().addComponent('text', { name, renderer })` | `ril.create().component('text', { renderer })` |
| `renderer: ({ id, value, onChange, props }) => …` | `renderer: ({ id, props, field }) => …` (`field.value`, `field.onChange`, `field.onBlur`, `field.error`) |
| `.configure({ rowRenderer, bodyRenderer, … })` | deleted — write markup in `Form.Body`/`Flow.*` render props |
| `builder:` metadata on components | `propsSchema` (zod/Standard Schema) + `meta` |

## Forms
| 0.1 | 0.2 |
|---|---|
| `<Form formConfig={f} defaultValues={d}>` | `<Form of={f} defaults={d}>` |
| `<FormBody />` + `bodyRenderer`/`rowRenderer` | `<Form.Body>{({ rows }) => …}</Form.Body>` |
| `<FormField fieldId="x" customProps={p} />` | `<Form.Field id="x" overrides={p} />` |
| `<FormSubmitButton>` + `submitButtonRenderer` | `<Form.Submit>{({ submitting }) => …}</Form.Submit>` |
| `<RepeatableField />` / `<RepeatableItem />` | `<Form.List id="x">{({ items, add, remove }) => …}</Form.List>` |
| `useFormConfigContext()` | `useForm()` |

## Styling hooks
Bare defaults ship a coherent data-attribute system — style them without wrappers:
`[data-form-body]`, `[data-form-row]`, `[data-form-submit]`, `[data-form-list]`, `[data-form-list-item]`, `[data-form-list-add]`, `[data-field-id]` (+ `data-field-*` state attrs), `[data-flow-progress]`, `[data-flow-nav="next|back|skip"]`.

## Workflows → Flows
(component table + the full hook rename table from Task 15 + `allowSkip` predicate + metadata-smuggling replacement examples: `metadata.hideNextButton` → conditional render around `<Flow.Next>`; `metadata.skipVisible` → `allowSkip: (ctx) => …`; `metadata.submitLabel` → render prop children)

## Errors
`RilayError.code` values changed: `VALIDATION_ERROR`→`VALIDATION`, `DUPLICATE_ID_ERROR`→`DUPLICATE`; new `NOT_FOUND`, `INVALID_SCHEMA`, `CONFIGURATION`.
```

- [ ] **Step 2: Write the DX showcase e2e (living documentation)**

Create `tests/e2e/dx/compound-showcase.e2e.test.tsx` — one test that exercises the WHOLE new surface as a consumer would: fluent catalog (`.component()` with zod `propsSchema` + `meta`, `.tool()`, `.part()`, `.renderers()`), `<Form of defaults>` with `Form.Body` render prop + `Form.Field id` + `Form.Submit` render prop, a `<Flow of onComplete>` with `Flow.Progress`/`Flow.Body`/`Flow.Back`/`Flow.Next`/`Flow.Skip` (one step with an `allowSkip` predicate), `useForm()` + `useFlow()` + `useStep()` probes, and a submit that asserts the exact submitted payload. Assert real user-visible behavior end-to-end (type into fields, navigate steps, submit, check `onComplete` data). This file doubles as the canonical usage example — write it to be READ.

Run: `pnpm vitest run tests/e2e/dx/compound-showcase.e2e.test.tsx`
Expected: PASS.

- [ ] **Step 3: Refresh the quick-starts**

Rewrite the usage snippets in `README.md` (root) and `packages/rilaykit/README.md` with the new styled API (catalog fluent + compound components — mirror the showcase test). Check `packages/{core,forms,workflow}/README.md` for dead API mentions and update them.

- [ ] **Step 4: Full gate**

Run: `pnpm test && pnpm type-check && pnpm check && pnpm build`
Expected: ALL PASS. Fix anything red before proceeding (build catches tsup/export issues the tests don't).

- [ ] **Step 5: Verify no stale references**

Run: `grep -rn "addComponent\|configure(\|renderConfig\|WorkflowStepper\|FormSubmitButton\|RepeatableField\|useWorkflowContext\|useFormConfigContext\|customProps\|fieldId=" packages tests README.md --include="*.ts*" --include="*.md" | grep -v node_modules | grep -v "docs/superpowers" | grep -v MIGRATION.md`
Expected: zero hits.

- [ ] **Step 6: Commit**

```bash
git add MIGRATION.md README.md packages tests/e2e/dx
git commit -m "docs: add 0.2 migration guide, DX showcase and refreshed quick-starts"
```

---

---

### Task 19: Feature Proof Matrix — the phase gate

Per-task TDD proves units; this task proves FEATURES. Every user-facing capability of P1 must have a test that fails if the capability breaks — an exact-assertion, real-store, user-level test. No feature ships on "the suite is green"; it ships on "here is the test that proves it".

**Files:**
- Create: `tests/e2e/proof/catalog.proof.e2e.test.tsx`, `tests/e2e/proof/form-chrome.proof.e2e.test.tsx`, `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx`
- Create: `docs/superpowers/plans/2026-07-13-p1-proof-matrix.md` (the filled matrix — committed as the phase's proof record)

**Interfaces:** none produced — this task only adds tests and the matrix document.

- [ ] **Step 1: Fill the feature matrix**

Copy this matrix into `docs/superpowers/plans/2026-07-13-p1-proof-matrix.md` and fill the "Proven by" column with `file:testname` for EVERY row — pointing either at an existing test (unit/e2e migrated in T1-T18) or at one of the new proof tests written in Steps 2-4. A row with no proving test = a test to write, not a row to delete. Matrix rows (grouped by feature area):

| Feature | Proven by |
|---|---|
| catalog: `.component()` register + retrieve + immutability | |
| catalog: `.tool()` / `.part()` register + namespace isolation | |
| catalog: duplicate → `DuplicateError`; `replace: true` swaps whole entry | |
| catalog: `.renderers()` attaches without touching schemas; `NotFoundError` on unknown key; static key constraint | |
| catalog: `.use()` plugin chain | |
| catalog: `validateProps` success / issues+expectedKeys / no-schema passthrough / `NotFoundError` / async → `ConfigurationError` | |
| catalog: propsSchema → renderer ctx type inference (type-level) | |
| catalog: `meta` reaches the renderer context | |
| catalog: `getStats` flat counts; `validate()` tolerates blueprint entries | |
| form: `<Form of={builder}>` auto-build + `of={config}`; `defaults` seeding | |
| form: `Form.Body` bare markup (`data-form-body`/`data-form-row`); render prop `{ rows }`; hidden-field row dropped; repeatable row delegated to `Form.List` | |
| form: `Form.Field` binding (value/onChange/onBlur), error render path, `overrides` precedence, `defaultProps` merge, conditions (visible/disabled/required/readonly), `NotFoundError` ghost field/component | |
| form: `Form.Submit` bare + render prop; disabled during async submit; no double-submit | |
| form: `Form.List` default render + add/remove; `min`/`max` bounds drive `canAdd`/`canRemove`; validation inside items; `NotFoundError` ghost id | |
| form: validation — mixed zod + built-ins, validateOnBlur/validateOnChange, submit blocked on invalid, error messages exact | |
| form: effects (`onChange` handler `setValue`/`setProps`) still fire through new chrome | |
| flow: `<Flow of>` + `defaults` + `onComplete` exact payload; `defaultStep` passthrough | |
| flow: `Flow.Body` default renders current step form; custom `step.renderer` precedence; render-prop children | |
| flow: `Flow.Progress` visible-only steps, active index, `goTo` navigates with hidden-step index mapping | |
| flow: `Flow.Next` validates then advances; invalid step blocks; last step triggers `onComplete` | |
| flow: `Flow.Back` disabled on first step; navigates back; entered values preserved | |
| flow: `Flow.Skip` hidden when disallowed; `allowSkip` boolean; `allowSkip` predicate over `allData` (both truth values); skip advances without validating | |
| flow: cross-step data (`onAfterValidation` + `setStepFields`/`setNextStepFields`) prefills later steps | |
| flow: conditional steps — hidden step skipped in navigation both directions | |
| flow: workflows containing repeatables still work end-to-end | |
| flow: persistence save/restore unaffected; analytics `onStepStart`/`onStepComplete` fire | |
| hooks: `useForm`/`useFlow`/`useFlowData`/`useStep`/`useFlowSteps`/`useFormRows` return documented shapes; old names absent from surfaces | |
| errors: every public throw is a `RilayError` subclass with stable `code` (grep `throw new Error(` in `packages/*/src` → zero) | |

- [ ] **Step 2: Write the catalog proof tests**

`tests/e2e/proof/catalog.proof.e2e.test.tsx` — the rows above not already proven by `packages/core/tests/catalog/*`. At minimum (real code, exact assertions):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { Form, form } from '@rilaykit/forms';

describe('PROOF catalog end-to-end', () => {
  it('meta and inferred props flow from registration to the rendered field', () => {
    const r = ril.create().component('badge', {
      propsSchema: z.object({ label: z.string() }),
      meta: { tone: 'brand' },
      renderer: ({ props, meta }) => (
        <span data-tone={String(meta?.tone)}>{props.label}</span>
      ),
    });
    const def = form.create(r, 'p').add({ id: 'b', type: 'badge', props: { label: 'Pro' } });
    render(
      <Form of={def}>
        <Form.Body />
      </Form>
    );
    const badge = screen.getByText('Pro');
    expect(badge.dataset.tone).toBe('brand');
  });

  it('a plugin-registered tool and a hydrated renderer survive the full chain', () => {
    const plugin = (r: ril<Record<string, unknown>>) =>
      r.tool('confirm', { description: 'Ask confirmation' });
    const r = ril
      .create()
      .use(plugin)
      .renderers({ tools: { confirm: ({ state }) => <output>{state}</output> } });
    expect(r.getTool('confirm')?.description).toBe('Ask confirmation');
    expect(typeof r.getTool('confirm')?.renderer).toBe('function');
  });
});
```

- [ ] **Step 3: Write the form-chrome proof tests**

`tests/e2e/proof/form-chrome.proof.e2e.test.tsx` — hardening scenarios NOT covered by migrated e2e (verify against the matrix; expected new ones below, full user-level flows with `@testing-library/user-event` if present, else `fireEvent`):

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { required, ril } from '@rilaykit/core';
import { Form, form } from '@rilaykit/forms';

const r = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <div>
      <input
        data-testid={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.map((e) => (
        <p key={e.message} role="alert">{e.message}</p>
      ))}
    </div>
  ),
});

describe('PROOF form chrome hardening', () => {
  it('submit is blocked while invalid and the exact message renders on blur', async () => {
    const onSubmit = vi.fn();
    const def = form.create(r, 'f').add({
      id: 'email',
      type: 'text',
      props: {},
      validation: { validate: [required('Email is required'), z.string().email('Invalid email')], validateOnBlur: true },
    });
    render(
      <Form of={def} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>Send</Form.Submit>
      </Form>
    );
    fireEvent.blur(screen.getByTestId('email'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email is required');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('double-clicking submit fires onSubmit exactly once', async () => {
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((res) => { release = res; }));
    const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });
    render(
      <Form of={def} onSubmit={onSubmit}>
        <Form.Submit>Go</Form.Submit>
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(btn);
    fireEvent.click(btn); // second click while submitting
    release();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('Form.List enforces min/max: remove disabled at min, add disabled at max', () => {
    const def = form
      .create(r, 'f')
      .addRepeatable('phones', (rb) => rb.add({ id: 'n', type: 'text', props: {} }), { min: 1, max: 2 });
    render(
      <Form of={def}>
        <Form.List id="phones">
          {({ items, add, remove, canAdd, canRemove }) => (
            <div>
              <output data-testid="state">{`${items.length}|${canAdd}|${canRemove}`}</output>
              <button type="button" onClick={add} data-testid="add" />
              <button type="button" onClick={() => items[0] && remove(items[0].key)} data-testid="rm" />
            </div>
          )}
        </Form.List>
      </Form>
    );
    expect(screen.getByTestId('state').textContent).toBe('1|true|false');
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('state').textContent).toBe('2|false|true');
  });

  it('a form whose every field is hidden renders an empty body and still submits {}', async () => {
    const onSubmit = vi.fn();
    const { when } = await import('@rilaykit/core');
    const def = form.create(r, 'f').add({
      id: 'ghost',
      type: 'text',
      props: {},
      conditions: { visible: when('never').equals('yes') },
    });
    render(
      <Form of={def} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>Send</Form.Submit>
      </Form>
    );
    expect(document.querySelectorAll('[data-form-row]').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
```

(Adjust the exact submitted-payload assertion of the last test to the engine's real hidden-field semantics — assert the EXACT object, whatever the engine's contract is, and document it in the matrix.)

- [ ] **Step 4: Write the flow-chrome proof tests**

`tests/e2e/proof/flow-chrome.proof.e2e.test.tsx` — expected new hardening scenarios:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, flow } from '@rilaykit/workflow';

const r = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <input data-testid={id} value={String(field?.value ?? '')} onChange={(e) => field?.onChange(e.target.value)} />
  ),
});
const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  formConfig: form.create(r, id).add({ id: `${id}-f`, type: 'text', props: {} }).build(),
  ...extra,
});

describe('PROOF flow chrome hardening', () => {
  it('completes a 2-step flow and delivers the exact namespaced payload to onComplete', async () => {
    const onComplete = vi.fn();
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf} onComplete={onComplete}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(await screen.findByTestId('b-f'), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({ a: { 'a-f': 'one' }, b: { 'b-f': 'two' } })
    );
  });

  it('Back preserves the values typed on the previous step', async () => {
    const wf = flow.create(r, 'wf', 'WF').addStep(step('a')).addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Back>Back</Flow.Back>
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'kept' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByTestId('b-f');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(((await screen.findByTestId('a-f')) as HTMLInputElement).value).toBe('kept');
  });

  it('allowSkip predicate flips live when allData changes', async () => {
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a', { allowSkip: (ctx: { allData: Record<string, unknown> }) => ctx.allData['a']?.['a-f'] === 'vip' }))
      .addStep(step('b'));
    render(
      <Flow of={wf}>
        <Flow.Body />
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.change(screen.getByTestId('a-f'), { target: { value: 'vip' } });
    expect(await screen.findByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('Progress goTo lands on the right step when a middle step is hidden', async () => {
    const { when } = await import('@rilaykit/core');
    const wf = flow
      .create(r, 'wf', 'WF')
      .addStep(step('a'))
      .addStep({ ...step('hidden'), conditions: { visible: when('a.a-f').equals('never') } })
      .addStep(step('c'));
    render(
      <Flow of={wf}>
        <Flow.Progress>
          {({ steps, goTo }) => (
            <button type="button" onClick={() => goTo(1)} data-testid="jump">
              {steps.map((s) => s.id).join(',')}
            </button>
          )}
        </Flow.Progress>
        <Flow.Body />
      </Flow>
    );
    expect(screen.getByTestId('jump').textContent).toBe('a,c');
    fireEvent.click(screen.getByTestId('jump'));
    expect(await screen.findByTestId('c-f')).toBeInTheDocument();
  });
});
```

(If `goTo` legitimately refuses forward jumps to unvisited steps — check `canGoToStep` — assert THAT contract instead and record it in the matrix; the proof is the exact documented behavior, not a wished-for one.)

- [ ] **Step 5: Coverage + adversarial gate**

Run: `pnpm vitest run --coverage`
Expected: PASS with the repo's configured thresholds (lines 90 / branches 85 / functions 90 / statements 90). If a P1 file is under threshold, the matrix has a hole — write the missing proof test (do NOT lower thresholds).

Then dispatch the inquisition checker panel over the WHOLE P1 diff (`git diff main...HEAD`) with the four lenses (tests-prove-behavior / DRY / elegance / conventions) — read-only subagents, structured verdicts, fix everything they confirm, re-run the failing lens.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/proof docs/superpowers/plans/2026-07-13-p1-proof-matrix.md
git commit -m "test: P1 feature proof matrix and hardening suite"
```

---

## Plan Self-Review (done at authoring time)

- **Spec coverage (P1 items)**: catalog facades T2-T4 ✔, propsSchema+meta T2/T5 ✔, typed errors T1 ✔, deletions T16 ✔, chrome compound T6-T14 ✔, hook renames T15 ✔, `of`/`defaults` T6/T12 ✔, allowSkip predicate T14 ✔, MIGRATION.md T18 ✔, phase proof gate T19 ✔. Out of P1 scope (per spec §11): compileForm/FlowSchema (P2), Parts/manifest/uiTools/adapters (P3).
- **Review pass (2026-07-13, post-authoring)**: provider/context member names verified against the real files (T12/T14 hedges removed); `useFlowSteps` now contains the real ported code (T13); the T14 rules-of-hooks bug is fixed in-plan (`hidden` computed inside the hook); styled renames applied (`Form.Field id`/`config`, `useForm`, flat `getStats`, `data-form-*`/`data-flow-*` attribute system); `.renderers()` components map typed against the registered keys; type-level inference tests added (T2 Step 4); zod bumped to v4 (T2); DX showcase e2e + README refresh added (T18). Remaining executor judgment: mirror `form-repeatable.test.ts` option names in the T10 fixture.
- **Type consistency**: `ComponentRenderContext`/`FieldBinding` (T2) are consumed by T8's FormField and T10's fixtures; `VisibleRow` (T7) by T11; `FlowNavContext` (T14) by e2e sweeps; error classes (T1) by T2/T4/T5/T8/T10. Names verified consistent across tasks.
```
