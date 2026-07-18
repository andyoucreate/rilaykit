# P3 — Agent Layer (`@rilaykit/agent`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@rilaykit/agent`: the part model + `<Parts>`/`<Part>` dispatch, `<Catalog>` context, `manifest()`, `uiTools()` with recursive `ComponentNode` trees, a partial-JSON parser driving progressive form mounting, the HITL `resolve` loop with structured self-correction errors, and the `/ai-sdk` + `/anthropic` adapters — closing the loop where an agent emits JSON and rilaykit renders it.

**Architecture:** The agent layer is a **dispatch front-end over the existing catalog and schema layers** — it adds no engine. A `Part` resolves to a renderer through the catalog's `part:*`/`tool:*` namespaces; `show_form`/`show_flow`/`show_component` are ordinary catalog tools whose built-in renderers call the P2 compilers (`compileForm`/`compileFlow`) and mount P1 chrome (`Form.*`/`Flow.*`). The server never sees React: `uiTools()`, `manifest()` and `tools(catalog)` project catalog entries to schemas only. Isomorphism is enforced by entry-point split, not by convention.

**Tech Stack:** TypeScript strict, React 19 (peer >=18), Standard Schema (`@standard-schema/spec`), zod v4 (tests + `z.toJSONSchema()`), vitest + jsdom + Testing Library, biome, tsup (multi-entry), turbo/pnpm. Branch `claude/rilaykit-agent-refactor-6015f4` (post-P2 + stabilization: 203 files / 1956 tests green).

## Global Constraints

- Stay on branch `claude/rilaykit-agent-refactor-6015f4`. NEVER `git checkout -b` / `git switch -c`. Verify `git branch --show-current` before each commit.
- `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"` before any shell work — verify `node -v` → v22.22.0. The default shell node is v16 and breaks vitest with `URL.canParse is not a function` and corepack noise that is NOT a real failure.
- Never `throw new Error(...)`. Use the core hierarchy (`packages/core/src/errors.ts`): `RilayError`, `ValidationError`, `DuplicateError`, `NotFoundError`, `InvalidSchemaError`, `ConfigurationError`. Schema-structural failures reuse forms' `SchemaValidationError` (`code='SCHEMA_VALIDATION_ERROR'`, `issues: SchemaIssue[]`) — do NOT migrate it into the core hierarchy; P1/P2 deliberately kept the two families apart.
- **Renderer-level failures NEVER throw** (spec §8): a bad agent emission produces an `error`-state part carrying `{ error, issues, expectedKeys }`, never an exception during render. This is the single most important rule of this phase — a model emitting bad JSON is the normal case, not an exception.
- No `console.*` — use `getLogger` from `@rilaykit/core`. No `any` — `unknown` over `any`; killing `any` is a design goal. `function` for declarations, arrows for callbacks. Strict TS. One component per file.
- Dependency direction: `agent → workflow → forms → core`. Core never imports agent/forms/workflow.
- TDD every task: red → watch it fail **for the right reason** → green. Exact assertions (`toBe`/`toEqual`), never `toBeDefined()`/`not.toThrow()` where an exact value exists. Error paths are first-class tests. Real `ril` catalogs and real stores — never `vi.mock('rilaykit')`.
- JSX tests MUST use `.tsx`. Vitest needs explicit aliases for `@rilaykit/*` + React dedup — mirror `packages/workflow/vitest.config.ts` when creating the agent package's config.
- Commands from repo root. Test: `pnpm vitest run <path>`. Typecheck: `pnpm type-check`. Build: `pnpm build`. Conventional commits.
- `pnpm lint` is RED at baseline (11 errors / 6 warnings, pre-existing formatter errors in `packages/forms` + `packages/core/tests`). Leave them; keep your own files lint-clean; end at exactly that baseline.

## Constraints inherited from the stabilization campaign

These are not style notes. Each is a bug class that was live and cost a round to close. Full record: `docs/superpowers/plans/2026-07-15-p2-stabilization-tracker.md`.

- **(b) `_reconcileStepSet` is an obligation, not an internal detail.** Anything owning a live step set AND a store owes it `_reconcileStepSet` on every render. `WorkflowProvider` discharges it (`packages/workflow/src/components/WorkflowProvider.tsx:259`). **If a P3 part mounts a workflow store outside `WorkflowProvider`, that obligation travels with it.** Task 8 mounts flows through `WorkflowProvider` specifically to inherit it — do not hand-roll a store.
- **(c) is RETIRED — do NOT add a form-id uniqueness check to `compileFlow`.** Two steps sharing a form id is legitimate input (`form.create()` auto-generates ids; a form id is never a coordinate into workflow data — that is keyed by step id throughout). Banning it is a breaking change dressed as a fix. Cross-step identity is carried by `FormProvider`'s `instanceId` instead.
- **Work that outlives a render must key on `configSignature`.** Anything mounted below `FormProvider` holding in-flight work (timers, subscriptions, promises, generation counters) must key on the form swap, or it crosses a step boundary and lands on the wrong step. This has no enforcement — it is carried as a documented constraint, and **P3's parts are exactly the new code authored under the provider**. Five carriers leaked this way in the final round (in-flight async validation, effect engine, in-flight submit, debounce timer, `_fieldConditions`).
- **HITL resolve is gated on Task 1.** Every leak of the final round was **in-flight work crossing a swap**. HITL resolve is in-flight work at the **workflow** altitude, where `instanceId`/`formInstanceKey` do not reach, and where the only sweep to date (`stepIdentityMembers()`) targeted *state*, never *in-flight work*. P3 makes step swaps routine rather than rare. **Task 1 sweeps that altitude before any resolve code is written.**

## Design decision made at authoring time (deviation from spec §4, flagged)

Spec §4 says `<Catalog value={r}>` is "React context in core". Placement in core is **correct and load-bearing** — `Form`/`Flow` may later read it as an override, and if the context lived in `@rilaykit/agent` that would invert the dependency direction (forms → agent).

But core is **genuinely isomorphic today**: it imports React only via `import type React` (type-only, erased at compile). A module-scope `createContext` in `packages/core/src/index.ts` would make **any RSC importing `@rilaykit/core` crash** ("createContext is not supported in Server Components") — and the isomorphic `lib/catalog.ts` blueprint is the pivot the entire server/client design rests on.

**Resolution: the context lives in core, behind a new `@rilaykit/core/react` subpath entry** (Task 2). Core's main entry stays runtime-React-free. The same split applies to `@rilaykit/agent` (isomorphic main: `uiTools`/`manifest`/parser/types) vs `@rilaykit/agent/react` (`Catalog`/`Parts`/`Part`). This honors the spec's placement and its isomorphism requirement at once.

## File Structure (end state)

```
packages/core/src/react/                      NEW  (runtime React lives ONLY here)
  catalog-context.tsx      NEW  <Catalog value={r}> + useCatalog() + useCatalogEntry(kind, name)
  index.ts                 NEW  exports
packages/core/tsup.config.ts                  MOD  entry: ['src/index.ts', 'src/react/index.ts']
packages/core/package.json                    MOD  + "./react" export subpath

packages/agent/                               NEW PACKAGE
  package.json             NEW  exports ".", "./react", "./ai-sdk", "./anthropic"
  tsup.config.ts           NEW  4 entries
  tsconfig.json            NEW  (copy packages/workflow/tsconfig.json)
  vitest.config.ts         NEW  (copy packages/workflow/vitest.config.ts + agent alias)
  src/
    types/part.ts          NEW  Part union, PartState, isTextPart/isToolPart/isDataPart
    types/component-node.ts NEW ComponentNode (recursive) + ComponentNodeFor<C>
    index.ts               NEW  ISOMORPHIC: uiTools, manifest, parsePartialJson, part types, errors
    tools/ui-tools.ts      NEW  uiTools() plugin — show_form/show_flow/show_component schemas
    tools/component-node-schema.ts NEW recursive Standard Schema for ComponentNode
    manifest/manifest.ts   NEW  manifest(catalog) → system-prompt string
    streaming/parse-partial-json.ts NEW  fixJson-style partial parser (no dependency)
    errors/emission-error.ts NEW  EmissionError + toEmissionResult({error, issues, expectedKeys})
    react/
      index.ts             NEW  Catalog re-export + Parts + Part
      Parts.tsx            NEW  <Parts parts onResolve fallback />
      Part.tsx             NEW  <Part part onResolve fallback />
      fallbacks/ShowForm.tsx      NEW  built-in show_form renderer (HITL resolve)
      fallbacks/ShowFlow.tsx      NEW  built-in show_flow renderer (mounts WorkflowProvider)
      fallbacks/ShowComponent.tsx NEW  built-in show_component renderer (recursive tree)
      fallbacks/DefaultTool.tsx   NEW  humanized unknown-tool fallback
      fallbacks/EmissionErrorView.tsx NEW bare structural render of a failed emission
    ai-sdk/index.ts        NEW  toParts(message) + tools(catalog)
    anthropic/index.ts     NEW  toParts(message) + tools(catalog)
  tests/                   NEW  mirrors src/

packages/forms/src/schema/compile-form.ts     MOD  + options.lenient (streaming mode)
packages/forms/src/components/FormProvider.tsx MOD + progressive field registration (no reset)
packages/workflow/src/stores/workflowStore.ts MOD  Task 1 (in-flight work generation)
packages/workflow/tests/stores/store-enforces-inflight-work.test.tsx NEW Task 1
packages/rilaykit/src/index.ts                MOD  re-export agent surface
packages/rilaykit/package.json                MOD  + agent dep
docs/superpowers/plans/2026-07-16-p3-proof-matrix.md NEW (Task 16)
```

---

### Task 1: The HITL gate — sweep the workflow store for in-flight work

**This task blocks Tasks 8 and 13.** Do not write resolve code before it is green. Rationale in "Constraints inherited" above: HITL resolve is in-flight work at the workflow altitude, and that altitude has never been swept for in-flight work — only for state.

**Files:**
- Test: `packages/workflow/tests/stores/store-enforces-inflight-work.test.tsx` (create)
- Modify: `packages/workflow/src/stores/workflowStore.ts`
- Reference (read these first — they are the technique): `packages/workflow/tests/stores/store-enforces-flat-shape.test.tsx` (`stepIdentityMembers()` runtime derivation), `packages/forms/tests/components/FormProvider.seam.test.tsx` (mounted-vs-navigated differential)

**Interfaces:**
- Produces: whatever guard you find is needed. If the sweep finds nothing, it produces the enumeration only — a tripwire for Tasks 8/13.

- [ ] **Step 1: Read the two reference enumerations before writing anything**

The class died only where a **runtime-derived** enumeration failed on a member added tomorrow. A hand-written list goes stale — that is the entire lesson. Read how `stepIdentityMembers()` reads a real store's state at runtime, and how the mounted-vs-navigated differential is built.

- [ ] **Step 2: Write the failing differential test**

The invariant: **in-flight work started for a step lands on that step, or is abandoned — never on another step.** The differential that found 4 of the last 5 bugs: *a store that MOUNTED with the step and a store that NAVIGATED to it must be indistinguishable.*

```tsx
// packages/workflow/tests/stores/store-enforces-inflight-work.test.tsx
import { describe, expect, it } from 'vitest';

/**
 * The workflow altitude has been swept for STATE (`stepIdentityMembers()`), never for
 * IN-FLIGHT WORK. Every leak of the P2 stabilization campaign's final round was in-flight
 * work crossing a step swap, and HITL resolve (P3) is in-flight work at THIS altitude —
 * where `instanceId`/`formInstanceKey` do not reach. This suite is that sweep.
 */
describe('the workflow store abandons in-flight work when the step it was started for is left', () => {
  it('a resolution begun on step A does not land on step B', async () => {
    // Drive a real store. Start async work naming step A (the shape HITL resolve will
    // have: a batch write while the user sits on a step). Navigate to B BEFORE it settles.
    // Assert B's slice is untouched and A's is correct.
    // EXACT assertion on both slices — never toBeDefined().
  });
});
```

Enumerate every asynchronous or deferred path the store exposes. Derive the list at runtime where possible (`Object.keys(state).filter((k) => typeof state[k] === 'function')`), and assert `Object.keys` equality so an action added tomorrow fails the enumeration rather than shipping.

- [ ] **Step 3: Run it and see what the truth is**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
pnpm vitest run packages/workflow/tests/stores/store-enforces-inflight-work.test.tsx
```

**Both outcomes are valid and valuable.** If it is GREEN, the store already abandons in-flight work correctly — say so, keep the enumeration as the tripwire for Tasks 8/13, and skip to Step 6. **Do not manufacture a finding.** If it is RED, you found the bug HITL resolve would have shipped.

- [ ] **Step 4: If red — fix structurally**

Derive at point of use from live state; do not ask a caller to remember. The lineage that worked nine times: a generation counter checked at settle time, keyed on the step identity the work was started for. Prefer *unrepresentable* over *proved-today*, and state plainly in the test's doc comment which you achieved.

- [ ] **Step 5: Mutation-check**

Revert your enforcement, run, paste the real failure output into the commit message, restore.

> **A repro that PASSES under mutation proves nothing.** Four agents paid for this lesson: one nearly shipped a self-healing test (a later render re-derived the value); one found its provider-level test passed because the provider incidentally re-derived elsewhere; one discarded an `if (false)` mutation as dishonest because it made the code *throw*, so the test passed for the wrong reason. Mutate every enforcement you add.

- [ ] **Step 6: Commit**

```bash
git add packages/workflow/tests/stores/store-enforces-inflight-work.test.tsx packages/workflow/src/stores/workflowStore.ts
git commit -m "test(workflow): sweep the store for in-flight work crossing a step swap"
```

---

### Task 2: `<Catalog>` context behind `@rilaykit/core/react`

**Files:**
- Create: `packages/core/src/react/catalog-context.tsx`, `packages/core/src/react/index.ts`
- Modify: `packages/core/tsup.config.ts`, `packages/core/package.json`
- Test: `packages/core/tests/react/catalog-context.test.tsx`

**Interfaces:**
- Produces: `<Catalog value={r}>{children}</Catalog>`; `useCatalog(): RilayInstance<Record<string, unknown>>` (throws `ConfigurationError` outside a provider); `useCatalogEntry(kind: 'component'|'tool'|'part', name: string): CatalogEntry | undefined`.
- Consumed by: Tasks 3, 4, 7, 8.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/core/tests/react/catalog-context.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src';
import { Catalog, useCatalog } from '../../src/react';
import { ConfigurationError } from '../../src/errors';

const catalog = ril.create().tool('search', { description: 'Search things' });

function Probe() {
  const value = useCatalog();
  return <span>{value.getTool('search')?.description}</span>;
}

describe('Catalog context', () => {
  it('exposes the catalog to descendants', () => {
    render(
      <Catalog value={catalog}>
        <Probe />
      </Catalog>
    );
    expect(screen.getByText('Search things')).toBeInTheDocument();
  });

  it('throws a typed ConfigurationError outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(ConfigurationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
pnpm vitest run packages/core/tests/react/catalog-context.test.tsx
```
Expected: FAIL — `Cannot find module '../../src/react'`.

- [ ] **Step 3: Implement**

```tsx
// packages/core/src/react/catalog-context.tsx
import React, { createContext, useContext } from 'react';
import { ConfigurationError } from '../errors';
import type { RilayInstance } from '../config/ril';
import type { CatalogEntry } from '../types/catalog';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

const CatalogContext = createContext<AnyCatalog | null>(null);

export interface CatalogProps {
  readonly value: AnyCatalog;
  readonly children: React.ReactNode;
}

/**
 * Makes a catalog available to <Parts>/<Part>. Form/Flow receive their catalog
 * embedded in their config via the builders — for them this provider is an
 * override, not a requirement.
 *
 * Lives behind the `@rilaykit/core/react` subpath on purpose: `@rilaykit/core`
 * itself must stay free of runtime React so the isomorphic `lib/catalog.ts`
 * blueprint can be imported from a server component without tripping
 * "createContext is not supported in Server Components".
 */
export function Catalog({ value, children }: CatalogProps) {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): AnyCatalog {
  const value = useContext(CatalogContext);
  if (!value) {
    throw new ConfigurationError('useCatalog must be used within a <Catalog value={...}> provider');
  }
  return value;
}

export function useCatalogEntry(
  kind: 'component' | 'tool' | 'part',
  name: string
): CatalogEntry | undefined {
  const catalog = useCatalog();
  if (kind === 'component') return catalog.getComponent(name) as CatalogEntry | undefined;
  if (kind === 'tool') return catalog.getTool(name) as CatalogEntry | undefined;
  return catalog.getPart(name) as CatalogEntry | undefined;
}
```

```ts
// packages/core/src/react/index.ts
export { Catalog, useCatalog, useCatalogEntry, type CatalogProps } from './catalog-context';
```

- [ ] **Step 4: Wire the subpath entry**

```ts
// packages/core/tsup.config.ts — change the entry line to:
  entry: ['src/index.ts', 'src/react/index.ts'],
```

```jsonc
// packages/core/package.json — replace the "exports" block with:
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./react": {
      "types": "./dist/react/index.d.ts",
      "import": "./dist/react/index.mjs",
      "require": "./dist/react/index.js"
    }
  },
```

- [ ] **Step 5: Write the isomorphism guard — this is the point of the whole task**

```ts
// packages/core/tests/isomorphic-entry.test.ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * The main entry must never import runtime React: `lib/catalog.ts` is imported by
 * server code (route handlers, RSC), and a module-scope createContext there crashes
 * a Server Component. Vitest aliases resolve to source, so this MUST run against the
 * real built artifact in a child process — the same blindness that let a broken CJS
 * bundle ship in P2 r3.
 */
describe('@rilaykit/core main entry', () => {
  it('does not pull React into the module graph', () => {
    const script = `
      require('${process.cwd()}/packages/core/dist/index.js');
      const pulled = Object.keys(require.cache).some((p) => /node_modules[\\\\/]react[\\\\/]/.test(p));
      if (pulled) { console.error('REACT_PULLED'); process.exit(1); }
      process.exit(0);
    `;
    expect(() => execFileSync('node', ['-e', script], { stdio: 'pipe' })).not.toThrow();
  });
});
```

- [ ] **Step 6: Run tests + build to verify they pass**

```bash
pnpm build --filter @rilaykit/core
pnpm vitest run packages/core/tests/react/catalog-context.test.tsx packages/core/tests/isomorphic-entry.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/react packages/core/tests/react packages/core/tests/isomorphic-entry.test.ts packages/core/tsup.config.ts packages/core/package.json
git commit -m "feat(core): Catalog context behind a react subpath, keeping the main entry isomorphic"
```

---

### Task 3: Package scaffold + the Part model

**Files:**
- Create: `packages/agent/package.json`, `packages/agent/tsup.config.ts`, `packages/agent/tsconfig.json`, `packages/agent/vitest.config.ts`, `packages/agent/src/types/part.ts`, `packages/agent/src/index.ts`
- Test: `packages/agent/tests/types/part.test.ts`
- Reference: copy `packages/workflow/tsconfig.json` and `packages/workflow/vitest.config.ts` verbatim, then add the `@rilaykit/agent` alias.

**Interfaces:**
- Produces:
  ```ts
  type PartState = 'streaming' | 'ready' | 'done' | 'error';
  type TextPart = { type: 'text'; text: string; state?: 'streaming' | 'done' };
  type ToolPart = { type: 'tool'; toolCallId: string; name: string; state: PartState;
                    input: unknown; rawInput?: string; output?: unknown; errorText?: string };
  type DataPart = { type: 'data'; name: string; data: unknown };
  type Part = TextPart | ToolPart | DataPart;
  function isTextPart(p: Part): p is TextPart;
  function isToolPart(p: Part): p is ToolPart;
  function isDataPart(p: Part): p is DataPart;
  ```
- Consumed by: every later task.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/types/part.test.ts
import { describe, expect, it } from 'vitest';
import { isDataPart, isTextPart, isToolPart, type Part } from '../../src/types/part';

describe('Part narrowing', () => {
  const text: Part = { type: 'text', text: 'hello', state: 'done' };
  const tool: Part = { type: 'tool', toolCallId: 'c1', name: 'show_form', state: 'ready', input: {} };
  const data: Part = { type: 'data', name: 'usage', data: { tokens: 12 } };

  it('narrows each member of the union exactly', () => {
    expect([isTextPart(text), isToolPart(text), isDataPart(text)]).toEqual([true, false, false]);
    expect([isTextPart(tool), isToolPart(tool), isDataPart(tool)]).toEqual([false, true, false]);
    expect([isTextPart(data), isToolPart(data), isDataPart(data)]).toEqual([false, false, true]);
  });

  it('carries the streaming carriage a tool renderer needs', () => {
    const streaming: Part = {
      type: 'tool', toolCallId: 'c2', name: 'show_form', state: 'streaming',
      input: { fields: [] }, rawInput: '{"fields":[',
    };
    expect(isToolPart(streaming) && streaming.rawInput).toBe('{"fields":[');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/types/part.test.ts
```
Expected: FAIL — package does not exist.

- [ ] **Step 3: Scaffold the package**

```jsonc
// packages/agent/package.json
{
  "name": "@rilaykit/agent",
  "version": "0.1.6",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".":          { "types": "./dist/index.d.ts",          "import": "./dist/index.mjs",          "require": "./dist/index.js" },
    "./react":    { "types": "./dist/react/index.d.ts",    "import": "./dist/react/index.mjs",    "require": "./dist/react/index.js" },
    "./ai-sdk":   { "types": "./dist/ai-sdk/index.d.ts",   "import": "./dist/ai-sdk/index.mjs",   "require": "./dist/ai-sdk/index.js" },
    "./anthropic":{ "types": "./dist/anthropic/index.d.ts","import": "./dist/anthropic/index.mjs","require": "./dist/anthropic/index.js" }
  },
  "files": ["dist"],
  "license": "MIT",
  "publishConfig": { "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "test:run": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@rilaykit/core": "workspace:*",
    "@rilaykit/forms": "workspace:*",
    "@rilaykit/workflow": "workspace:*"
  },
  "peerDependencies": { "react": ">=18.0.0" },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "zod": "^4.0.0"
  }
}
```

> Match the exact devDependency versions used by `packages/forms/package.json` — read it and copy, do not guess. React must dedupe with the rest of the monorepo or hooks break.

```ts
// packages/agent/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react/index.ts', 'src/ai-sdk/index.ts', 'src/anthropic/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  external: ['react', 'react-dom', 'ai', '@anthropic-ai/sdk'],
});
```

> `splitting: false` is deliberate. P2 r3 lost a day to `splitting: true` routing CJS through sucrase, whose `_createStarExport` installs star names as getters BEFORE explicit assignments — inverting ESM's "explicit shadows star" precedence and silently shadowing exports.

Copy `packages/workflow/tsconfig.json` → `packages/agent/tsconfig.json` verbatim. Copy `packages/workflow/vitest.config.ts` → `packages/agent/vitest.config.ts` and add an `@rilaykit/agent` alias next to the existing ones.

- [ ] **Step 4: Implement the part model**

```ts
// packages/agent/src/types/part.ts

/** Adapter-mapped from AI SDK v5: input-streaming | input-available | output-available | output-error */
export type PartState = 'streaming' | 'ready' | 'done' | 'error';

export interface TextPart {
  readonly type: 'text';
  readonly text: string;
  readonly state?: 'streaming' | 'done';
}

export interface ToolPart {
  readonly type: 'tool';
  readonly toolCallId: string;
  readonly name: string;
  readonly state: PartState;
  /** During `streaming`, a deep-partial parsed object. */
  readonly input: unknown;
  /** Raw partial JSON, for renderers that want to drive their own progressive parse. */
  readonly rawInput?: string;
  readonly output?: unknown;
  readonly errorText?: string;
}

export interface DataPart {
  readonly type: 'data';
  readonly name: string;
  readonly data: unknown;
}

/**
 * Structurally aligned with AI SDK v5 parts so the adapter is near-identity.
 * `reasoning`/`source`/`file` are deliberately deferred — the union stays extensible.
 */
export type Part = TextPart | ToolPart | DataPart;

export function isTextPart(part: Part): part is TextPart {
  return part.type === 'text';
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === 'tool';
}

export function isDataPart(part: Part): part is DataPart {
  return part.type === 'data';
}
```

```ts
// packages/agent/src/index.ts
export {
  isDataPart, isTextPart, isToolPart,
  type DataPart, type Part, type PartState, type TextPart, type ToolPart,
} from './types/part';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm install
pnpm vitest run packages/agent/tests/types/part.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent pnpm-lock.yaml
git commit -m "feat(agent): scaffold the package and the part model"
```

---

### Task 4: `<Part>` — single-part dispatch with fallbacks

**Files:**
- Create: `packages/agent/src/react/Part.tsx`, `packages/agent/src/react/fallbacks/DefaultTool.tsx`, `packages/agent/src/react/index.ts`
- Test: `packages/agent/tests/react/Part.test.tsx`

**Interfaces:**
- Consumes: `Part`/`isToolPart` (Task 3); `useCatalog` from `@rilaykit/core/react` (Task 2); `ToolRenderContext`/`PartRenderContext` from `@rilaykit/core` (P1, `packages/core/src/types/catalog.ts:46,69`).
- Produces:
  ```tsx
  interface PartProps {
    part: Part;
    onResolve?: (toolCallId: string, output: unknown) => void;
    catalog?: RilayInstance<Record<string, unknown>>;  // explicit override; else context
    fallback?: React.ComponentType<{ part: Part }>;
  }
  function Part(props: PartProps): React.ReactElement | null;
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// packages/agent/tests/react/Part.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { Part } from '../../src/react/Part';

const catalog = ril
  .create()
  .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
  .tool('search_flights', {
    description: 'Search flights',
    renderer: ({ state, input, resolve }) => (
      <button type="button" onClick={() => resolve({ picked: 'AF123' })}>
        {state}:{(input as { from?: string }).from}
      </button>
    ),
  });

function mount(ui: React.ReactNode) {
  return render(<Catalog value={catalog}>{ui}</Catalog>);
}

describe('<Part>', () => {
  it('resolves a text part through the part: namespace', () => {
    mount(<Part part={{ type: 'text', text: 'bonjour' }} />);
    expect(screen.getByText('bonjour')).toBeInTheDocument();
  });

  it('hands a tool renderer its state and input', () => {
    mount(<Part part={{ type: 'tool', toolCallId: 'c1', name: 'search_flights', state: 'streaming', input: { from: 'CDG' } }} />);
    expect(screen.getByRole('button')).toHaveTextContent('streaming:CDG');
  });

  it('wires resolve() to onResolve with the toolCallId — the HITL mirror', async () => {
    const onResolve = vi.fn();
    mount(<Part part={{ type: 'tool', toolCallId: 'c1', name: 'search_flights', state: 'ready', input: {} }} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { picked: 'AF123' });
  });

  it('falls back to a humanized name for an unregistered tool', () => {
    mount(<Part part={{ type: 'tool', toolCallId: 'c2', name: 'search_hotels', state: 'ready', input: {} }} />);
    expect(screen.getByText('Search hotels')).toBeInTheDocument();
  });

  it('prefers a consumer fallback over the built-in one', () => {
    const Fallback = ({ part }: { part: Part }) => <em>custom:{part.type}</em>;
    mount(<Part part={{ type: 'tool', toolCallId: 'c3', name: 'nope', state: 'ready', input: {} }} fallback={Fallback} />);
    expect(screen.getByText('custom:tool')).toBeInTheDocument();
  });

  it('renders nothing for an unregistered part type rather than crashing', () => {
    const { container } = mount(<Part part={{ type: 'data', name: 'usage', data: {} }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/react/Part.test.tsx
```
Expected: FAIL — `Cannot find module '../../src/react/Part'`.

- [ ] **Step 3: Implement the humanizing fallback**

```tsx
// packages/agent/src/react/fallbacks/DefaultTool.tsx
import React from 'react';
import type { ToolPart } from '../../types/part';

/** `search_hotels` → `Search hotels`. Bare but functional: no styles, no branding. */
export function humanizeToolName(name: string): string {
  const spaced = name.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function DefaultTool({ part }: { part: ToolPart }) {
  return <div data-part="tool" data-tool-name={part.name} data-tool-state={part.state}>{humanizeToolName(part.name)}</div>;
}
```

- [ ] **Step 4: Implement `<Part>`**

```tsx
// packages/agent/src/react/Part.tsx
import React, { useCallback } from 'react';
import type { RilayInstance } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import { isToolPart, type Part as PartType } from '../types/part';
import { DefaultTool } from './fallbacks/DefaultTool';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

export interface PartProps {
  readonly part: PartType;
  readonly onResolve?: (toolCallId: string, output: unknown) => void;
  /** Explicit override; defaults to the nearest <Catalog value={...}>. */
  readonly catalog?: AnyCatalog;
  readonly fallback?: React.ComponentType<{ part: PartType }>;
}

export function Part({ part, onResolve, catalog, fallback: Fallback }: PartProps) {
  const contextCatalog = useCatalog();
  const resolved = catalog ?? contextCatalog;

  const resolve = useCallback(
    (output: unknown) => {
      if (isToolPart(part)) onResolve?.(part.toolCallId, output);
    },
    [onResolve, part]
  );

  if (isToolPart(part)) {
    const entry = resolved.getTool(part.name);
    const Renderer = entry?.renderer;
    if (!Renderer) {
      return Fallback ? <Fallback part={part} /> : <DefaultTool part={part} />;
    }
    return (
      <Renderer
        toolCallId={part.toolCallId}
        name={part.name}
        state={part.state}
        input={part.input}
        rawInput={part.rawInput}
        output={part.output}
        errorText={part.errorText}
        resolve={resolve}
        meta={entry.meta}
      />
    );
  }

  const entry = resolved.getPart(part.type);
  const Renderer = entry?.renderer;
  if (!Renderer) {
    return Fallback ? <Fallback part={part} /> : null;
  }
  return <Renderer part={part} meta={entry.meta} />;
}
```

```ts
// packages/agent/src/react/index.ts
export { Catalog, useCatalog, type CatalogProps } from '@rilaykit/core/react';
export { Part, type PartProps } from './Part';
export { DefaultTool, humanizeToolName } from './fallbacks/DefaultTool';
```

> `<Part>` re-exports `Catalog` so consumers import one module. The context still *lives* in core (Task 2's rationale) — this is a convenience alias, not a second context. Creating a second `createContext` here would silently break `useCatalog` across the boundary.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/agent/tests/react/Part.test.tsx
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/react packages/agent/tests/react
git commit -m "feat(agent): <Part> dispatch with catalog resolution and HITL resolve wiring"
```

---

### Task 5: `<Parts>` — list dispatch

**Files:**
- Create: `packages/agent/src/react/Parts.tsx`
- Modify: `packages/agent/src/react/index.ts`
- Test: `packages/agent/tests/react/Parts.test.tsx`

**Interfaces:**
- Consumes: `Part` component (Task 4).
- Produces: `<Parts parts={Part[]} onResolve={(toolCallId, output) => void} catalog? fallback? />`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/agent/tests/react/Parts.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { Parts } from '../../src/react/Parts';
import type { Part } from '../../src/types/part';

const catalog = ril
  .create()
  .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
  .tool('pick', {
    description: 'Pick one',
    renderer: ({ toolCallId, resolve }) => (
      <button type="button" onClick={() => resolve({ id: toolCallId })}>pick-{toolCallId}</button>
    ),
  });

describe('<Parts>', () => {
  const parts: Part[] = [
    { type: 'text', text: 'first' },
    { type: 'tool', toolCallId: 'c1', name: 'pick', state: 'ready', input: {} },
    { type: 'tool', toolCallId: 'c2', name: 'pick', state: 'ready', input: {} },
  ];

  it('renders every part in order', () => {
    render(<Catalog value={catalog}><Parts parts={parts} /></Catalog>);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['pick-c1', 'pick-c2']);
  });

  it('routes each part its OWN toolCallId — not the last one rendered', async () => {
    const onResolve = vi.fn();
    render(<Catalog value={catalog}><Parts parts={parts} onResolve={onResolve} /></Catalog>);
    await userEvent.click(screen.getByText('pick-c1'));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { id: 'c1' });
  });

  it('renders an empty list without crashing', () => {
    const { container } = render(<Catalog value={catalog}><Parts parts={[]} /></Catalog>);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/react/Parts.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/agent/src/react/Parts.tsx
import React from 'react';
import type { RilayInstance } from '@rilaykit/core';
import type { Part as PartType } from '../types/part';
import { Part } from './Part';

export interface PartsProps {
  readonly parts: readonly PartType[];
  readonly onResolve?: (toolCallId: string, output: unknown) => void;
  readonly catalog?: RilayInstance<Record<string, unknown>>;
  readonly fallback?: React.ComponentType<{ part: PartType }>;
}

/**
 * Dispatches a message's parts. Message-thread concerns (grouping consecutive tool
 * parts, scrolling, composers) are the host's — this renders a list and nothing else.
 */
export function Parts({ parts, onResolve, catalog, fallback }: PartsProps) {
  return (
    <>
      {parts.map((part, index) => (
        <Part
          key={part.type === 'tool' ? part.toolCallId : `${part.type}-${index}`}
          part={part}
          onResolve={onResolve}
          catalog={catalog}
          fallback={fallback}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 4: Export it**

```ts
// packages/agent/src/react/index.ts — add:
export { Parts, type PartsProps } from './Parts';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/agent/tests/react/Parts.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/react/Parts.tsx packages/agent/src/react/index.ts packages/agent/tests/react/Parts.test.tsx
git commit -m "feat(agent): <Parts> list dispatch"
```

---

### Task 6: `ComponentNode` + the `uiTools()` plugin

**Files:**
- Create: `packages/agent/src/types/component-node.ts`, `packages/agent/src/tools/component-node-schema.ts`, `packages/agent/src/tools/ui-tools.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/tests/tools/ui-tools.test.ts`

**Interfaces:**
- Consumes: `RilayPlugin` (`packages/core/src/config/ril.ts:107`), `FormSchema` (`packages/forms/src/schema/types.ts:25`), `FlowSchema` (`packages/workflow/src/schema/flow-schema-types.ts:43`).
- Produces:
  ```ts
  interface ComponentNode { type: string; props?: Record<string, unknown>; children?: ComponentNode[] }
  function uiTools(): RilayPlugin;   // registers show_form / show_flow / show_component
  ```
- Consumed by: Tasks 7, 8, 9, 12, 13.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/tools/ui-tools.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('select', {
    description: 'Dropdown selection',
    propsSchema: z.object({ label: z.string() }),
  })
  .use(uiTools());

describe('uiTools()', () => {
  it('registers exactly the three premium tools, with intention verbs', () => {
    expect(catalog.getAllTools().map((t) => t.name).sort()).toEqual([
      'show_component', 'show_flow', 'show_form',
    ]);
  });

  it('registers schemas only — the server never sees React', () => {
    for (const tool of catalog.getAllTools()) {
      expect(tool.renderer).toBeUndefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('describes each tool for the model', () => {
    expect(catalog.getTool('show_form')?.description).toContain('form');
    expect(catalog.getTool('show_component')?.description).toContain('component');
  });

  it('is immutable — .use() returns a new instance', () => {
    const base = ril.create();
    expect(base.use(uiTools())).not.toBe(base);
    expect(base.getAllTools()).toEqual([]);
  });

  it('validates a recursive ComponentNode tree', () => {
    const schema = catalog.getTool('show_component')?.inputSchema;
    const result = schema?.['~standard'].validate({
      node: { type: 'select', props: { label: 'A' }, children: [{ type: 'select', props: { label: 'B' } }] },
    });
    expect(result && 'issues' in result ? result.issues : undefined).toBeUndefined();
  });

  it('rejects a node whose type is not a string', () => {
    const schema = catalog.getTool('show_component')?.inputSchema;
    const result = schema?.['~standard'].validate({ node: { type: 42 } });
    expect(result && 'issues' in result && result.issues?.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/tools/ui-tools.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the node type + schema**

```ts
// packages/agent/src/types/component-node.ts

/**
 * A renderable tree an agent may emit. `type` is validated against the catalog's
 * component union at RENDER time (Task 7), not here: the static tool schema cannot
 * know a consumer's catalog, and a wrong type must produce a structured error part
 * the model can retry from — never a render crash.
 */
export interface ComponentNode {
  readonly type: string;
  readonly props?: Record<string, unknown>;
  readonly children?: readonly ComponentNode[];
}
```

```ts
// packages/agent/src/tools/component-node-schema.ts
import { z } from 'zod';

/**
 * Recursive via z.lazy — `z.toJSONSchema()` emits a `$ref`/`$defs` cycle that both
 * Anthropic and the AI SDK accept. Depth is bounded at render time, not here.
 */
export const componentNodeSchema: z.ZodType<{
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}> = z.lazy(() =>
  z.object({
    type: z.string().describe('The component type, from the catalog listed in the system prompt'),
    props: z.record(z.string(), z.unknown()).optional().describe("The component's props"),
    children: z.array(componentNodeSchema).optional().describe('Nested components'),
  })
);
```

- [ ] **Step 4: Implement the plugin**

```ts
// packages/agent/src/tools/ui-tools.ts
import { z } from 'zod';
import type { RilayPlugin } from '@rilaykit/core';
import { componentNodeSchema } from './component-node-schema';

/**
 * Registers the premium UI tools as PURE SCHEMAS — this module is imported by
 * `lib/catalog.ts`, which the server imports. It must never pull React.
 *
 * Renderers come from <Parts>' built-in fallbacks or the app's `.renderers()`.
 *
 * Tool names use intention verbs (`show_*`, not `render_*`): the agent *shows*
 * something to a human. Proven to steer models better (cf. stndrds `ask_questions`).
 */
export function uiTools(): RilayPlugin {
  return (r) =>
    r
      .tool('show_form', {
        description:
          'Show an interactive form to the user and wait for their answers. Use for collecting structured input.',
        inputSchema: z.object({
          schema: z.unknown().describe('A FormSchema: { id, fields: [{ id, type, props }] }'),
        }),
      })
      .tool('show_flow', {
        description:
          'Show a multi-step flow to the user. Use when input is long enough to warrant steps.',
        inputSchema: z.object({
          schema: z.unknown().describe('A FlowSchema: { id, name, steps: [{ id, title, form }] }'),
        }),
      })
      .tool('show_component', {
        description:
          'Show a component, or a tree of components, from the catalog. Use for display — not for collecting input.',
        inputSchema: z.object({ node: componentNodeSchema }),
      });
}
```

> `schema: z.unknown()` is deliberate. `FormSchema`/`FlowSchema` are large recursive structures whose static zod mirror would be a second source of truth that drifts. The real validation is `validateFormSchema`/`validateFlowSchema` at render time (P2), which produce `SchemaValidationError` with structured `issues` — exactly what Task 11 turns into a self-correction part. `manifest()` (Task 10) is what teaches the model the shape.

- [ ] **Step 5: Export and run**

```ts
// packages/agent/src/index.ts — add:
export { uiTools } from './tools/ui-tools';
export { componentNodeSchema } from './tools/component-node-schema';
export type { ComponentNode } from './types/component-node';
```

```bash
pnpm vitest run packages/agent/tests/tools/ui-tools.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/tools packages/agent/src/types/component-node.ts packages/agent/src/index.ts packages/agent/tests/tools
git commit -m "feat(agent): uiTools() plugin with recursive ComponentNode schema"
```

---

### Task 7: Structured self-correction errors

**Files:**
- Create: `packages/agent/src/errors/emission-error.ts`, `packages/agent/src/react/fallbacks/EmissionErrorView.tsx`
- Modify: `packages/agent/src/index.ts`, `packages/agent/src/react/index.ts`
- Test: `packages/agent/tests/errors/emission-error.test.ts`

**Interfaces:**
- Consumes: `SchemaValidationError`/`SchemaIssue` (`packages/forms/src/schema/types.ts`), `StandardSchemaV1` (`@standard-schema/spec`).
- Produces:
  ```ts
  interface EmissionResult { error: string; issues: EmissionIssue[]; expectedKeys: string[] }
  interface EmissionIssue { path: string; message: string }
  function toEmissionResult(error: unknown, expectedKeys?: string[]): EmissionResult;
  function validateNodeProps(propsSchema, props): EmissionResult | null;  // null = valid
  ```
- Consumed by: Tasks 8, 9.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/errors/emission-error.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SchemaValidationError } from '@rilaykit/forms';
import { toEmissionResult, validateNodeProps } from '../../src/errors/emission-error';

describe('toEmissionResult', () => {
  it('carries a SchemaValidationError\'s issues verbatim', () => {
    const error = new SchemaValidationError('Invalid form schema', [
      { path: 'fields[0].type', message: 'Unknown component "slect"' },
    ]);
    expect(toEmissionResult(error, ['id', 'fields'])).toEqual({
      error: 'Invalid form schema',
      issues: [{ path: 'fields[0].type', message: 'Unknown component "slect"' }],
      expectedKeys: ['id', 'fields'],
    });
  });

  it('never leaks a raw throw — an unknown error still yields the structured shape', () => {
    expect(toEmissionResult('boom')).toEqual({ error: 'boom', issues: [], expectedKeys: [] });
  });
});

describe('validateNodeProps', () => {
  const propsSchema = z.object({ label: z.string() });

  it('returns null for valid props', () => {
    expect(validateNodeProps(propsSchema, { label: 'Name' })).toBeNull();
  });

  it('names the offending path and the keys the model should have emitted', () => {
    const result = validateNodeProps(propsSchema, { labl: 'Name' });
    expect(result?.expectedKeys).toEqual(['label']);
    expect(result?.issues[0]?.path).toBe('label');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/errors/emission-error.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/agent/src/errors/emission-error.ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { SchemaValidationError } from '@rilaykit/forms';

export interface EmissionIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * The payload an invalid agent emission produces. Fed back to the model as a tool
 * result so it can retry. Format proven in production in stndrds `wrappers.ts`.
 */
export interface EmissionResult {
  readonly error: string;
  readonly issues: readonly EmissionIssue[];
  readonly expectedKeys: readonly string[];
}

function pathToString(path: readonly unknown[] | undefined): string {
  if (!path) return '';
  return path
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String((segment as { key: unknown }).key)
        : String(segment)
    )
    .join('.');
}

/** Never throws. An emission failure is data the model retries from, not an exception. */
export function toEmissionResult(error: unknown, expectedKeys: readonly string[] = []): EmissionResult {
  if (error instanceof SchemaValidationError) {
    return {
      error: error.message,
      issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      expectedKeys,
    };
  }
  if (error instanceof Error) {
    return { error: error.message, issues: [], expectedKeys };
  }
  return { error: String(error), issues: [], expectedKeys };
}

function expectedKeysOf(schema: StandardSchemaV1): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

/** Returns null when the props are valid; an EmissionResult when they are not. */
export function validateNodeProps(
  schema: StandardSchemaV1,
  props: unknown
): EmissionResult | null {
  const result = schema['~standard'].validate(props);
  if (result instanceof Promise) {
    return {
      error: 'propsSchema must validate synchronously to render an agent emission',
      issues: [],
      expectedKeys: expectedKeysOf(schema),
    };
  }
  if (!result.issues) return null;
  return {
    error: 'Invalid props',
    issues: result.issues.map((issue) => ({
      path: pathToString(issue.path),
      message: issue.message,
    })),
    expectedKeys: expectedKeysOf(schema),
  };
}
```

```tsx
// packages/agent/src/react/fallbacks/EmissionErrorView.tsx
import React from 'react';
import type { EmissionResult } from '../../errors/emission-error';

/** Bare structural markup — data-* hooks for styling, no styles of our own. */
export function EmissionErrorView({ result }: { result: EmissionResult }) {
  return (
    <div data-agent-error="emission">
      <p data-agent-error-message>{result.error}</p>
      {result.issues.length > 0 && (
        <ul data-agent-error-issues>
          {result.issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`} data-agent-error-path={issue.path}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Export and run**

```ts
// packages/agent/src/index.ts — add:
export { toEmissionResult, validateNodeProps, type EmissionIssue, type EmissionResult } from './errors/emission-error';
// packages/agent/src/react/index.ts — add:
export { EmissionErrorView } from './fallbacks/EmissionErrorView';
```

```bash
pnpm vitest run packages/agent/tests/errors/emission-error.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/errors packages/agent/src/react/fallbacks/EmissionErrorView.tsx packages/agent/src/index.ts packages/agent/src/react/index.ts packages/agent/tests/errors
git commit -m "feat(agent): structured self-correction errors for invalid emissions"
```

---

### Task 8: `show_component` default renderer — recursive tree with failing-node isolation

**Files:**
- Create: `packages/agent/src/react/fallbacks/ShowComponent.tsx`
- Modify: `packages/agent/src/react/Part.tsx` (wire built-in fallbacks), `packages/agent/src/react/index.ts`
- Test: `packages/agent/tests/react/ShowComponent.test.tsx`

**Interfaces:**
- Consumes: `ComponentNode` (Task 6), `validateNodeProps`/`EmissionErrorView` (Task 7), `useCatalog` (Task 2), `ComponentRenderContext` (`packages/core/src/types/catalog.ts:23`).
- Produces: `ShowComponent({ node })`, wired as `<Part>`'s built-in fallback for the `show_component` tool.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/agent/tests/react/ShowComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('stack', {
    description: 'Vertical stack',
    propsSchema: z.object({ gap: z.number() }),
    renderer: ({ props, children }) => <div data-gap={props.gap}>{children}</div>,
  })
  .component('badge', {
    description: 'A badge',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props }) => <span>{props.label}</span>,
  })
  .use(uiTools());

function showComponent(node: unknown) {
  return render(
    <Catalog value={catalog}>
      <Part part={{ type: 'tool', toolCallId: 'c1', name: 'show_component', state: 'ready', input: { node } }} />
    </Catalog>
  );
}

describe('show_component built-in renderer', () => {
  it('renders a leaf node with validated props', () => {
    showComponent({ type: 'badge', props: { label: 'New' } });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('resolves a tree recursively and hands each renderer its rendered children', () => {
    showComponent({
      type: 'stack',
      props: { gap: 8 },
      children: [
        { type: 'badge', props: { label: 'A' } },
        { type: 'badge', props: { label: 'B' } },
      ],
    });
    const stack = document.querySelector('[data-gap="8"]');
    expect(stack?.textContent).toBe('AB');
  });

  it('ISOLATES a failing node — its siblings still render', () => {
    showComponent({
      type: 'stack',
      props: { gap: 8 },
      children: [
        { type: 'badge', props: { labl: 'typo' } },   // invalid props
        { type: 'badge', props: { label: 'survivor' } },
      ],
    });
    expect(screen.getByText('survivor')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });

  it('names the expected keys so the model can retry', () => {
    showComponent({ type: 'badge', props: { labl: 'typo' } });
    expect(document.querySelector('[data-agent-error-path="label"]')).not.toBeNull();
  });

  it('reports an unknown component type instead of crashing', () => {
    showComponent({ type: 'buton', props: {} });
    expect(screen.getByText(/buton/)).toBeInTheDocument();
  });

  it('reports a malformed node instead of crashing', () => {
    showComponent({ nope: true });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/react/ShowComponent.test.tsx
```
Expected: FAIL — the tool has no renderer, so `DefaultTool` renders "Show component".

- [ ] **Step 3: Implement**

```tsx
// packages/agent/src/react/fallbacks/ShowComponent.tsx
import React from 'react';
import type { RilayInstance } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import type { ComponentNode } from '../../types/component-node';
import { toEmissionResult, validateNodeProps } from '../../errors/emission-error';
import { EmissionErrorView } from './EmissionErrorView';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

function isNode(value: unknown): value is ComponentNode {
  return typeof value === 'object' && value !== null && typeof (value as ComponentNode).type === 'string';
}

/**
 * Renders one node. A failure here is LOCAL: it returns an error view rather than
 * throwing, so a sibling's typo cannot take down the tree. That is the spec's
 * "a failing node produces a structured error part, never a render crash".
 */
function renderNode(node: unknown, catalog: AnyCatalog, key: string): React.ReactNode {
  if (!isNode(node)) {
    return <EmissionErrorView key={key} result={toEmissionResult('Malformed component node: expected { type, props?, children? }')} />;
  }

  const entry = catalog.getComponent(node.type);
  if (!entry) {
    return (
      <EmissionErrorView
        key={key}
        result={toEmissionResult(
          `Unknown component "${node.type}"`,
          catalog.getAllComponents().map((component) => component.id)
        )}
      />
    );
  }

  if (entry.propsSchema) {
    const invalid = validateNodeProps(entry.propsSchema, node.props ?? {});
    if (invalid) return <EmissionErrorView key={key} result={invalid} />;
  }

  const Renderer = entry.renderer;
  if (!Renderer) {
    return <EmissionErrorView key={key} result={toEmissionResult(`No renderer attached for component "${node.type}"`)} />;
  }

  const children = node.children?.map((child, index) => renderNode(child, catalog, `${key}.${index}`));

  return (
    <Renderer
      key={key}
      id={node.type}
      props={node.props ?? {}}
      children={children}
      meta={entry.meta}
    />
  );
}

export function ShowComponent({ node }: { node: unknown }) {
  const catalog = useCatalog();
  return <>{renderNode(node, catalog, 'root')}</>;
}
```

> Renderers receive **already-rendered** children (`ReactNode`) and place or ignore them — a renderer never resolves the tree itself. `getAllComponents()` feeds `expectedKeys` so the model gets the real catalog union back on a typo.

- [ ] **Step 4: Wire the built-in fallbacks into `<Part>`**

In `packages/agent/src/react/Part.tsx`, before the `DefaultTool` fallback, add the built-in `show_*` table:

```tsx
import { ShowComponent } from './fallbacks/ShowComponent';

const BUILT_IN_TOOLS: Record<string, (input: unknown, resolve: (output: unknown) => void) => React.ReactElement> = {
  show_component: (input) => <ShowComponent node={(input as { node?: unknown }).node} />,
};
```

and in the `!Renderer` branch, before falling back:

```tsx
    if (!Renderer) {
      const builtIn = Object.hasOwn(BUILT_IN_TOOLS, part.name) ? BUILT_IN_TOOLS[part.name] : undefined;
      if (builtIn) return builtIn(part.input, resolve);
      return Fallback ? <Fallback part={part} /> : <DefaultTool part={part} />;
    }
```

> `Object.hasOwn`, not `BUILT_IN_TOOLS[part.name]` directly. A tool named `toString` resolves to the inherited method — this exact class escaped **seven times** in P1/P2 and once rendered a field permanently hidden. The repo's primitive is `getOwn`/`hasOwn` from `@rilaykit/core` (`packages/core/src/utils/ownProperty.ts`); prefer it.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/agent/tests/react/ShowComponent.test.tsx
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/react packages/agent/tests/react/ShowComponent.test.tsx
git commit -m "feat(agent): show_component recursive renderer with failing-node isolation"
```

---

### Task 9: `show_form` / `show_flow` renderers + the HITL resolve loop

**Depends on Task 1 being green.**

**Files:**
- Create: `packages/agent/src/react/fallbacks/ShowForm.tsx`, `packages/agent/src/react/fallbacks/ShowFlow.tsx`
- Modify: `packages/agent/src/react/Part.tsx`, `packages/agent/src/react/index.ts`
- Test: `packages/agent/tests/react/ShowForm.test.tsx`, `packages/agent/tests/react/ShowFlow.test.tsx`

**Interfaces:**
- Consumes: `compileForm` (`packages/forms/src/schema/compile-form.ts:124`), `compileFlow` (`packages/workflow/src/schema/compile-flow.ts`), `Form.*` chrome (P1), `WorkflowProvider` + `Flow.*` (P1), `toEmissionResult` (Task 7).
- Produces: `ShowForm({ schema, resolve })`, `ShowFlow({ schema, resolve })`. **HITL payload convention:** `resolve({ status: 'submitted', values })` | `resolve({ status: 'cancelled' })`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/agent/tests/react/ShowForm.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('text', {
    description: 'Text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }) => (
      <label>
        {props.label}
        <input value={String(field.value ?? '')} onChange={(e) => field.onChange(e.target.value)} />
      </label>
    ),
  })
  .use(uiTools());

function showForm(schema: unknown, onResolve?: (id: string, output: unknown) => void) {
  return render(
    <Catalog value={catalog}>
      <Part
        part={{ type: 'tool', toolCallId: 'c1', name: 'show_form', state: 'ready', input: { schema } }}
        onResolve={onResolve}
      />
    </Catalog>
  );
}

const schema = { id: 'contact', fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }] };

describe('show_form built-in renderer (HITL)', () => {
  it('compiles the emitted schema and renders it', () => {
    showForm(schema);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('resolves { status: "submitted", values } — the agent receives ENGINE-VALIDATED values', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { status: 'submitted', values: { name: 'Karl' } });
  });

  it('resolves { status: "cancelled" } — cancellation is in the contract from day one', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { status: 'cancelled' });
  });

  it('renders a structured error for a malformed schema instead of crashing', () => {
    showForm({ id: 'bad', fields: [{ id: 'x', type: 'nonexistent' }] });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });

  it('does not resolve twice on a double submit', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    const submit = screen.getByRole('button', { name: /submit/i });
    await userEvent.dblClick(submit);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/react/ShowForm.test.tsx
```
Expected: FAIL — `DefaultTool` renders instead.

- [ ] **Step 3: Implement `ShowForm`**

```tsx
// packages/agent/src/react/fallbacks/ShowForm.tsx
import React, { useMemo, useRef } from 'react';
import { useCatalog } from '@rilaykit/core/react';
import { compileForm, Form } from '@rilaykit/forms';
import { toEmissionResult } from '../../errors/emission-error';
import { EmissionErrorView } from './EmissionErrorView';

export interface ShowFormProps {
  readonly schema: unknown;
  readonly resolve: (output: unknown) => void;
}

/**
 * Bare but functional out of the box — apps override via `.renderers()`.
 * The agent only ever receives engine-validated values: `Form.Submit` fires
 * onSubmit after the engine validates, so `resolve` cannot carry invalid input.
 */
export function ShowForm({ schema, resolve }: ShowFormProps) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo(() => {
    try {
      return { config: compileForm(schema as never, catalog as never), error: null };
    } catch (error) {
      return { config: null, error: toEmissionResult(error, ['id', 'fields']) };
    }
  }, [schema, catalog]);

  if (compiled.error) return <EmissionErrorView result={compiled.error} />;

  // The agent gets exactly one answer per tool call: a double-click must not resolve twice.
  const settle = (output: unknown) => {
    if (settled.current) return;
    settled.current = true;
    resolve(output);
  };

  return (
    <Form.Body of={compiled.config} onSubmit={(values) => settle({ status: 'submitted', values })}>
      <Form.Fields />
      <Form.Submit>Submit</Form.Submit>
      <button type="button" onClick={() => settle({ status: 'cancelled' })}>Cancel</button>
    </Form.Body>
  );
}
```

> Read `packages/forms/src/components/` before writing this — use the real P1 compound names and the real `compileForm` signature. If `Form.Fields` is not the actual name, use the one that exists; do not invent it.

- [ ] **Step 4: Implement `ShowFlow`**

```tsx
// packages/agent/src/react/fallbacks/ShowFlow.tsx
import React, { useMemo, useRef } from 'react';
import { useCatalog } from '@rilaykit/core/react';
import { compileFlow, Flow, WorkflowProvider } from '@rilaykit/workflow';
import { toEmissionResult } from '../../errors/emission-error';
import { EmissionErrorView } from './EmissionErrorView';

export interface ShowFlowProps {
  readonly schema: unknown;
  readonly resolve: (output: unknown) => void;
}

/**
 * Mounts through WorkflowProvider ON PURPOSE. The provider discharges the store's
 * `_reconcileStepSet` obligation on every render (WorkflowProvider.tsx:259);
 * a hand-rolled store would inherit that obligation and silently fail it — see
 * constraint (b) in the P2 stabilization tracker.
 */
export function ShowFlow({ schema, resolve }: ShowFlowProps) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo(() => {
    try {
      return { config: compileFlow(schema as never, catalog as never), error: null };
    } catch (error) {
      return { config: null, error: toEmissionResult(error, ['id', 'name', 'steps']) };
    }
  }, [schema, catalog]);

  if (compiled.error) return <EmissionErrorView result={compiled.error} />;

  const settle = (output: unknown) => {
    if (settled.current) return;
    settled.current = true;
    resolve(output);
  };

  return (
    <WorkflowProvider
      workflowConfig={compiled.config}
      onWorkflowComplete={(values) => settle({ status: 'submitted', values })}
    >
      <Flow.Body />
      <Flow.Back />
      <Flow.Next />
      <button type="button" onClick={() => settle({ status: 'cancelled' })}>Cancel</button>
    </WorkflowProvider>
  );
}
```

Write `packages/agent/tests/react/ShowFlow.test.tsx` mirroring the ShowForm suite: compile + render step 1, navigate with `Flow.Next`, complete → `{ status: 'submitted', values }`, cancel → `{ status: 'cancelled' }`, malformed schema → error view, and **one test asserting a flow renders only at `state: 'ready'`** (spec: "Flows: render at `ready`" — a deliberate scope cut; no progressive multi-step mounting).

- [ ] **Step 5: Wire both into `<Part>`'s built-in table**

```tsx
const BUILT_IN_TOOLS: Record<string, (input: unknown, resolve: (output: unknown) => void) => React.ReactElement> = {
  show_component: (input) => <ShowComponent node={(input as { node?: unknown }).node} />,
  show_form: (input, resolve) => <ShowForm schema={(input as { schema?: unknown }).schema} resolve={resolve} />,
  show_flow: (input, resolve) => <ShowFlow schema={(input as { schema?: unknown }).schema} resolve={resolve} />,
};
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm vitest run packages/agent/tests/react/ShowForm.test.tsx packages/agent/tests/react/ShowFlow.test.tsx
```
Expected: PASS (11 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/react packages/agent/tests/react
git commit -m "feat(agent): show_form and show_flow renderers closing the HITL resolve loop"
```

---

### Task 10: `manifest()` — teaching the model the catalog

**Files:**
- Create: `packages/agent/src/manifest/manifest.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/tests/manifest/manifest.test.ts`

**Interfaces:**
- Consumes: `RilayInstance` (`getAllComponents()`, `getAllTools()`).
- Produces: `manifest(catalog: RilayInstance<Record<string, unknown>>): string` — provider-neutral, main (isomorphic) entry.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/manifest/manifest.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { manifest } from '../../src/manifest/manifest';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('select', {
    description: 'Dropdown selection with predefined options',
    propsSchema: z.object({
      label: z.string().describe('Visible field label'),
      placeholder: z.string().optional(),
    }),
  })
  .component('badge', { description: 'A small status badge', propsSchema: z.object({ label: z.string() }) })
  .tool('search_flights', { description: 'Search flights', inputSchema: z.object({ from: z.string() }) })
  .use(uiTools());

describe('manifest()', () => {
  const output = manifest(catalog);

  it('lists every component with its description', () => {
    expect(output).toContain('select');
    expect(output).toContain('Dropdown selection with predefined options');
    expect(output).toContain('badge');
  });

  it('lists each component\'s props so the model can emit them', () => {
    expect(output).toContain('label');
    expect(output).toContain('Visible field label');
  });

  it('marks optional props as optional', () => {
    expect(output).toMatch(/placeholder.*optional/i);
  });

  it('teaches when to use show_form vs show_component', () => {
    expect(output).toContain('show_form');
    expect(output).toContain('show_component');
  });

  it('is deterministic — same catalog, same string', () => {
    expect(manifest(catalog)).toBe(output);
  });

  it('does not list host tools that are renderer-only (no inputSchema)', () => {
    const withRendererOnly = ril.create().tool('internal_only', { description: 'Host executed' });
    expect(manifest(withRendererOnly)).not.toContain('internal_only');
  });

  it('handles an empty catalog without crashing', () => {
    expect(typeof manifest(ril.create())).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/manifest/manifest.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/agent/src/manifest/manifest.ts
import type { RilayInstance } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

interface PropDescription {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly description?: string;
}

/**
 * Reads a zod shape when present. Non-zod Standard Schemas degrade to the
 * component's description alone — correct, just less specific. Do NOT write a
 * custom JSON-Schema converter: zod's native `z.toJSONSchema()` and the AI SDK's
 * pass-through are the sanctioned paths (spec §13).
 */
function describeProps(schema: StandardSchemaV1 | undefined): PropDescription[] {
  const shape = (schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  if (!shape) return [];
  return Object.entries(shape).map(([name, value]) => {
    const def = value as { description?: string; isOptional?: () => boolean; _def?: { typeName?: string } };
    return {
      name,
      type: def._def?.typeName?.replace(/^Zod/, '').toLowerCase() ?? 'unknown',
      optional: typeof def.isOptional === 'function' ? def.isOptional() : false,
      description: def.description,
    };
  });
}

function renderProp(prop: PropDescription): string {
  const suffix = prop.optional ? ' (optional)' : '';
  const note = prop.description ? ` — ${prop.description}` : '';
  return `    - ${prop.name}: ${prop.type}${suffix}${note}`;
}

/**
 * Generates the compact catalog description for a system prompt: which components
 * exist, their props, and when to use show_form vs show_component. This is how the
 * model learns the patterns it may emit.
 *
 * Provider-neutral and isomorphic — safe to import in a route handler.
 */
export function manifest(catalog: AnyCatalog): string {
  const lines: string[] = [];

  const components = catalog.getAllComponents();
  if (components.length > 0) {
    lines.push('## Available components');
    lines.push('');
    for (const component of components) {
      lines.push(`- **${component.id}**${component.description ? ` — ${component.description}` : ''}`);
      for (const prop of describeProps(component.propsSchema)) lines.push(renderProp(prop));
    }
    lines.push('');
  }

  const tools = catalog.getAllTools().filter((tool) => tool.inputSchema !== undefined);
  if (tools.length > 0) {
    lines.push('## Available tools');
    lines.push('');
    for (const tool of tools) {
      lines.push(`- **${tool.name}**${tool.description ? ` — ${tool.description}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## How to show UI');
  lines.push('');
  lines.push('- Use `show_form` to collect structured input from the user in one screen.');
  lines.push('- Use `show_flow` when the input is long enough to warrant multiple steps.');
  lines.push('- Use `show_component` to display information — not to collect input.');
  lines.push('- Component `props` must match the props listed above exactly.');

  return lines.join('\n');
}
```

- [ ] **Step 4: Export and run**

```ts
// packages/agent/src/index.ts — add:
export { manifest } from './manifest/manifest';
```

```bash
pnpm vitest run packages/agent/tests/manifest/manifest.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/manifest packages/agent/src/index.ts packages/agent/tests/manifest
git commit -m "feat(agent): manifest() catalog description for system prompts"
```

---

### Task 11: The partial-JSON parser

**Files:**
- Create: `packages/agent/src/streaming/parse-partial-json.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/tests/streaming/parse-partial-json.test.ts`

**Interfaces:**
- Produces: `parsePartialJson(text: string): { value: unknown; complete: boolean }` — never throws.
- Consumed by: Tasks 12, 13, 14.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/streaming/parse-partial-json.test.ts
import { describe, expect, it } from 'vitest';
import { parsePartialJson } from '../../src/streaming/parse-partial-json';

describe('parsePartialJson', () => {
  it('parses complete JSON and reports it complete', () => {
    expect(parsePartialJson('{"a":1}')).toEqual({ value: { a: 1 }, complete: true });
  });

  it('closes a truncated object', () => {
    expect(parsePartialJson('{"a":1,"b"')).toEqual({ value: { a: 1 }, complete: false });
  });

  it('closes a truncated array', () => {
    expect(parsePartialJson('{"fields":[{"id":"name"}')).toEqual({
      value: { fields: [{ id: 'name' }] }, complete: false,
    });
  });

  it('drops a half-written string value rather than yielding a torn one', () => {
    expect(parsePartialJson('{"label":"Na')).toEqual({ value: {}, complete: false });
  });

  it('keeps a completed sibling when the next key is half-written', () => {
    expect(parsePartialJson('{"id":"name","ty')).toEqual({ value: { id: 'name' }, complete: false });
  });

  it('handles escaped quotes inside strings', () => {
    expect(parsePartialJson('{"q":"say \\"hi\\""}')).toEqual({ value: { q: 'say "hi"' }, complete: true });
  });

  it('never throws on garbage — it reports incompleteness', () => {
    expect(parsePartialJson('not json at all')).toEqual({ value: undefined, complete: false });
  });

  it('handles the empty string', () => {
    expect(parsePartialJson('')).toEqual({ value: undefined, complete: false });
  });

  it('parses every prefix of a real emission without throwing', () => {
    const full = '{"schema":{"id":"contact","fields":[{"id":"name","type":"text","props":{"label":"Name"}}]}}';
    for (let i = 0; i <= full.length; i++) {
      expect(() => parsePartialJson(full.slice(0, i))).not.toThrow();
    }
    expect(parsePartialJson(full).complete).toBe(true);
  });
});
```

> The last test is the important one: **every prefix**, not a handful of hand-picked ones. A streaming parser is exactly the kind of code where the case you did not think of is the one the model emits.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/streaming/parse-partial-json.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/agent/src/streaming/parse-partial-json.ts

export interface PartialJsonResult {
  /** `undefined` when nothing parseable has arrived yet. */
  readonly value: unknown;
  /** True only when `text` was itself complete, valid JSON. */
  readonly complete: boolean;
}

/**
 * fixJson-style: scan the prefix, track the open structures, discard any torn tail,
 * then close what is open and hand it to JSON.parse. ~100 lines, no dependency.
 *
 * Contract: NEVER throws. A model streaming JSON produces torn input by definition,
 * so a throw here would be a crash on the golden path.
 */
export function parsePartialJson(text: string): PartialJsonResult {
  if (text.length === 0) return { value: undefined, complete: false };

  try {
    return { value: JSON.parse(text), complete: true };
  } catch {
    // fall through to repair
  }

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escaped = false;
  /** Index just past the last structurally safe cut point. */
  let safeEnd = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') {
        inString = false;
        safeEnd = i + 1;
      }
      continue;
    }

    if (char === '"') { inString = true; continue; }
    if (char === '{' || char === '[') { stack.push(char); safeEnd = i + 1; continue; }
    if (char === '}' || char === ']') { stack.pop(); safeEnd = i + 1; continue; }
    if (char === ',' || char === ':') { safeEnd = i + 1; continue; }
    if (!/\s/.test(char)) { safeEnd = i + 1; continue; }
  }

  let candidate = text.slice(0, safeEnd).replace(/[,:]\s*$/, '');

  // A dangling key ("id":"name","ty) leaves a trailing comma once the torn tail is cut.
  for (let i = stack.length - 1; i >= 0; i--) {
    candidate += stack[i] === '{' ? '}' : ']';
  }

  try {
    return { value: JSON.parse(candidate), complete: false };
  } catch {
    // Retry once with the last incomplete member dropped.
    const trimmed = candidate.replace(/[,{[]\s*"[^"]*"?\s*:?\s*$/, '');
    try {
      let repaired = trimmed;
      for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === '{' ? '}' : ']';
      return { value: JSON.parse(repaired), complete: false };
    } catch {
      return { value: undefined, complete: false };
    }
  }
}
```

> This implementation is a **starting point, not a specification**. Let the tests drive it: if a prefix fails, fix the parser, do not weaken the test. Add every failing prefix you find as a named test case.

- [ ] **Step 4: Export and run**

```ts
// packages/agent/src/index.ts — add:
export { parsePartialJson, type PartialJsonResult } from './streaming/parse-partial-json';
```

```bash
pnpm vitest run packages/agent/tests/streaming/parse-partial-json.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/streaming packages/agent/src/index.ts packages/agent/tests/streaming
git commit -m "feat(agent): partial-JSON parser for streaming emissions"
```

---

### Task 12: `compileForm` lenient mode + progressive mounting

**Files:**
- Modify: `packages/forms/src/schema/compile-form.ts`, `packages/forms/src/components/FormProvider.tsx`
- Test: `packages/forms/tests/schema/compile-form-lenient.test.ts`, `packages/agent/tests/react/ShowForm.streaming.test.tsx`

**Interfaces:**
- Produces: `compileForm(schema, catalog, { lenient?: boolean })`. Lenient mode: skip fields whose definition is incomplete (missing `id`, missing `type`, unparseable props) instead of raising; never throw on a partial schema.
- Consumed by: `ShowForm` during `state === 'streaming'`.

- [ ] **Step 1: Write the failing test for lenient compilation**

```ts
// packages/forms/tests/schema/compile-form-lenient.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { compileForm } from '../../src/schema/compile-form';
import { SchemaValidationError } from '../../src/schema/types';

const catalog = ril.create().component('text', {
  description: 'Text',
  propsSchema: z.object({ label: z.string() }),
});

describe('compileForm lenient mode', () => {
  it('mounts a field as soon as its definition is complete', () => {
    const config = compileForm(
      { id: 'f', fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }, { id: 'ema' }] } as never,
      catalog as never,
      { lenient: true }
    );
    expect(config.fields.map((f) => f.id)).toEqual(['name']);
  });

  it('skips an unknown type rather than raising, so the next chunk can fix it', () => {
    const config = compileForm(
      { id: 'f', fields: [{ id: 'x', type: 'tex' }] } as never,
      catalog as never,
      { lenient: true }
    );
    expect(config.fields).toEqual([]);
  });

  it('still raises in strict mode — lenient is opt-in, never the default', () => {
    expect(() => compileForm({ id: 'f', fields: [{ id: 'x', type: 'tex' }] } as never, catalog as never))
      .toThrow(SchemaValidationError);
  });

  it('tolerates a missing fields array entirely', () => {
    expect(compileForm({ id: 'f' } as never, catalog as never, { lenient: true }).fields).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/forms/tests/schema/compile-form-lenient.test.ts
```
Expected: FAIL — `lenient` is not an option.

- [ ] **Step 3: Implement lenient mode in `compileForm`**

Read `packages/forms/src/schema/compile-form.ts:124` first. Add `lenient?: boolean` to the existing options interface. In lenient mode, wrap each field's compilation: a field that fails validation is **skipped**, not raised. Keep strict the default — reuse the existing per-field path; do not fork it (DRY: a second compile path would drift from the first).

- [ ] **Step 4: Write the failing streaming test**

```tsx
// packages/agent/tests/react/ShowForm.streaming.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
// ... same catalog fixture as ShowForm.test.tsx

const FULL = '{"schema":{"id":"c","fields":[{"id":"name","type":"text","props":{"label":"Name"}},{"id":"email","type":"text","props":{"label":"Email"}}]}}';

function streamTo(chars: number) {
  const { value } = parsePartialJson(FULL.slice(0, chars));
  return render(
    <Catalog value={catalog}>
      <Part part={{ type: 'tool', toolCallId: 'c1', name: 'show_form', state: 'streaming',
                    input: value ?? {}, rawInput: FULL.slice(0, chars) }} />
    </Catalog>
  );
}

describe('show_form progressive mounting', () => {
  it('mounts a field as soon as its definition is complete', () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('makes a mounted field IMMEDIATELY interactive', async () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    await userEvent.type(screen.getByLabelText('Name'), 'K');
    expect(screen.getByLabelText('Name')).toHaveValue('K');
  });

  it('LOCKS submit until the schema is complete', () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('unlocks submit once the emission completes', () => {
    streamTo(FULL.length);
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('PRESERVES what the user typed as later chunks arrive — append-only, no reset', async () => {
    const { rerender } = streamTo(FULL.indexOf('{"id":"email"'));
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    const { value } = parsePartialJson(FULL);
    rerender(
      <Catalog value={catalog}>
        <Part part={{ type: 'tool', toolCallId: 'c1', name: 'show_form', state: 'streaming', input: value ?? {} }} />
      </Catalog>
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Karl');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('reconciles by stable field id — a re-emitted field does not duplicate', () => {
    streamTo(FULL.length);
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
  });
});
```

> The append-only test is the load-bearing one. **This is the exact shape of the bug class that cost the stabilization campaign twelve rounds**: a store re-seeded on a config change destroys what the user typed. `FormProvider` resets on `configSignature` — a growing field list changes that signature. Fields must register **incrementally without reset**.

- [ ] **Step 5: Implement progressive registration in `FormProvider`**

Read `packages/forms/src/components/FormProvider.tsx` — particularly `buildConfigSignature` (~line 127) and the reset path (~line 191). A field ADDED to a streaming schema must register incrementally; it must NOT trip the reset that a genuine form swap trips.

**This is the constraint's live edge.** The swap identity (`instanceId` + shape) and the streaming growth must not be confused: an appended field is the same form growing; a different `instanceId` is a different form. Add the growth path so it is distinguishable **structurally**, and prove both halves — a growing schema preserves values, a real swap still clears them (`packages/forms/tests/components/FormProvider.configSwap.test.tsx` must stay green).

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm vitest run packages/forms/tests/schema/compile-form-lenient.test.ts packages/agent/tests/react/ShowForm.streaming.test.tsx packages/forms/tests/components/
```
Expected: PASS — including every pre-existing FormProvider test.

- [ ] **Step 7: Mutation-check the append-only property**

Make `buildConfigSignature` include the field COUNT so a growing schema trips the reset. Run — the "preserves what the user typed" test MUST fail. Revert. Paste the output in the commit body.

- [ ] **Step 8: Commit**

```bash
git add packages/forms/src packages/forms/tests packages/agent/tests/react/ShowForm.streaming.test.tsx
git commit -m "feat(forms): lenient compilation and progressive field mounting for streaming emissions"
```

---

### Task 13: The `/ai-sdk` adapter

**Files:**
- Create: `packages/agent/src/ai-sdk/index.ts`
- Test: `packages/agent/tests/ai-sdk/adapter.test.ts`

**Interfaces:**
- Produces the **uniform adapter pair**: `toParts(message: unknown): Part[]` and `tools(catalog: AnyCatalog): Record<string, unknown>`.
- `ai` is an optional peer — the adapter maps plain objects and must not import the SDK at runtime (it is in tsup's `external`, and consumers who never import `/ai-sdk` must not need `ai` installed).

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/ai-sdk/adapter.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { toParts, tools } from '../../src/ai-sdk';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .tool('search_flights', { description: 'Search flights', inputSchema: z.object({ from: z.string() }) })
  .tool('render_only', { description: 'Host executed' })
  .use(uiTools());

describe('ai-sdk toParts()', () => {
  it('maps every AI SDK state to a rilaykit state', () => {
    const message = {
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'tool-show_form', toolCallId: 'c1', state: 'input-streaming', input: { a: 1 } },
        { type: 'tool-show_form', toolCallId: 'c2', state: 'input-available', input: { a: 1 } },
        { type: 'tool-show_form', toolCallId: 'c3', state: 'output-available', input: {}, output: { ok: true } },
        { type: 'tool-show_form', toolCallId: 'c4', state: 'output-error', input: {}, errorText: 'boom' },
      ],
    };
    expect(toParts(message).map((p) => (p.type === 'tool' ? p.state : p.type))).toEqual([
      'text', 'streaming', 'ready', 'done', 'error',
    ]);
  });

  it('recovers the tool name from the AI SDK\'s `tool-${name}` type', () => {
    const parts = toParts({ parts: [{ type: 'tool-search_flights', toolCallId: 'c1', state: 'input-available', input: {} }] });
    expect(parts[0]).toMatchObject({ type: 'tool', name: 'search_flights' });
  });

  it('carries output and errorText through', () => {
    const parts = toParts({ parts: [{ type: 'tool-x', toolCallId: 'c1', state: 'output-error', input: {}, errorText: 'boom' }] });
    expect(parts[0]).toMatchObject({ errorText: 'boom', state: 'error' });
  });

  it('ignores unknown part types rather than crashing', () => {
    expect(toParts({ parts: [{ type: 'reasoning', text: 'hmm' }] })).toEqual([]);
  });

  it('handles a message with no parts', () => {
    expect(toParts({})).toEqual([]);
  });
});

describe('ai-sdk tools()', () => {
  const generated = tools(catalog);

  it('emits UI tools WITHOUT execute — the SDK\'s native HITL pattern', () => {
    expect(generated.show_form).toBeDefined();
    expect((generated.show_form as { execute?: unknown }).execute).toBeUndefined();
  });

  it('passes zod schemas through untouched', () => {
    expect((generated.search_flights as { inputSchema: unknown }).inputSchema)
      .toBe(catalog.getTool('search_flights')?.inputSchema);
  });

  it('EXCLUDES renderer-only tools — a tool without inputSchema is not the agent\'s to call', () => {
    expect(generated.render_only).toBeUndefined();
  });

  it('carries descriptions so the model knows what each tool does', () => {
    expect((generated.search_flights as { description: string }).description).toBe('Search flights');
  });

  it('survives a tool named __proto__ as an OWN property', () => {
    const hostile = ril.create().tool('__proto__', { description: 'Hostile', inputSchema: z.object({}) });
    const result = tools(hostile);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/ai-sdk/adapter.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/agent/src/ai-sdk/index.ts
import type { RilayInstance } from '@rilaykit/core';
import type { Part, PartState } from '../types/part';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

const STATE_MAP: ReadonlyMap<string, PartState> = new Map([
  ['input-streaming', 'streaming'],
  ['input-available', 'ready'],
  ['output-available', 'done'],
  ['output-error', 'error'],
]);

interface SdkPart {
  readonly type?: string;
  readonly text?: string;
  readonly toolCallId?: string;
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorText?: string;
  readonly data?: unknown;
}

/**
 * Near-identity: the Part model is structurally aligned with AI SDK v5 on purpose.
 * A Map, not an object literal — an object literal would resolve a state named
 * `toString` to the inherited method (this class escaped seven times in P1/P2).
 */
export function toParts(message: unknown): Part[] {
  const parts = (message as { parts?: readonly SdkPart[] } | undefined)?.parts;
  if (!Array.isArray(parts)) return [];

  const result: Part[] = [];
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      result.push({ type: 'text', text: part.text, state: part.state === 'streaming' ? 'streaming' : 'done' });
      continue;
    }
    if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      const state = STATE_MAP.get(part.state ?? '');
      if (!state || !part.toolCallId) continue;
      result.push({
        type: 'tool',
        toolCallId: part.toolCallId,
        name: part.type.slice('tool-'.length),
        state,
        input: part.input ?? {},
        output: part.output,
        errorText: part.errorText,
      });
      continue;
    }
    if (typeof part.type === 'string' && part.type.startsWith('data-')) {
      result.push({ type: 'data', name: part.type.slice('data-'.length), data: part.data });
    }
  }
  return result;
}

/**
 * Emits UI tools WITHOUT `execute`: the SDK's native HITL pattern — the stream stays
 * pending, the client renders from `input`, and `addToolResult` resumes the agent.
 * zod schemas pass through untouched; the SDK converts them itself.
 *
 * A tool registered without `inputSchema` is renderer-only (spec §4) — it renders a
 * host-executed tool and is excluded from generated definitions.
 */
export function tools(catalog: AnyCatalog): Record<string, unknown> {
  // A Map, then Object.fromEntries — never `generated[tool.name] = ...`. A tool named
  // `__proto__` would reassign the prototype instead of creating an own property; the
  // repo's rule for untrusted-id accumulators is Map + fromEntries (P2 r1).
  const generated = new Map<string, unknown>();
  for (const tool of catalog.getAllTools()) {
    if (!tool.inputSchema) continue;
    generated.set(tool.name, { description: tool.description, inputSchema: tool.inputSchema });
  }
  return Object.fromEntries(generated);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run packages/agent/tests/ai-sdk/adapter.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/ai-sdk packages/agent/tests/ai-sdk
git commit -m "feat(agent): ai-sdk adapter (toParts + tools)"
```

---

### Task 14: The `/anthropic` adapter

**Files:**
- Create: `packages/agent/src/anthropic/index.ts`
- Test: `packages/agent/tests/anthropic/adapter.test.ts`

**Interfaces:**
- Produces the same uniform pair: `toParts(message)` + `tools(catalog)` → `{ name, description, input_schema }[]`.
- Uses zod's native `z.toJSONSchema()`; falls back to a manual `inputJsonSchema` on the entry for non-zod Standard Schemas. **Do not write a custom converter** (spec §13).

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent/tests/anthropic/adapter.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { toParts, tools } from '../../src/anthropic';

const catalog = ril
  .create()
  .tool('search_flights', {
    description: 'Search flights',
    inputSchema: z.object({ from: z.string().describe('IATA code') }),
  })
  .tool('render_only', { description: 'Host executed' });

describe('anthropic toParts()', () => {
  it('maps text and tool_use blocks', () => {
    const message = {
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 'tu_1', name: 'search_flights', input: { from: 'CDG' } },
      ],
    };
    expect(toParts(message)).toEqual([
      { type: 'text', text: 'hello', state: 'done' },
      { type: 'tool', toolCallId: 'tu_1', name: 'search_flights', state: 'ready', input: { from: 'CDG' } },
    ]);
  });

  it('ignores block types it does not model', () => {
    expect(toParts({ content: [{ type: 'thinking', thinking: 'hmm' }] })).toEqual([]);
  });

  it('handles a message with no content', () => {
    expect(toParts({})).toEqual([]);
  });
});

describe('anthropic tools()', () => {
  it('emits { name, description, input_schema } via native z.toJSONSchema()', () => {
    const [tool] = tools(catalog);
    expect(tool.name).toBe('search_flights');
    expect(tool.description).toBe('Search flights');
    expect(tool.input_schema).toMatchObject({
      type: 'object',
      properties: { from: { type: 'string', description: 'IATA code' } },
    });
  });

  it('excludes renderer-only tools', () => {
    expect(tools(catalog).map((t) => t.name)).toEqual(['search_flights']);
  });

  it('falls back to a manual inputJsonSchema for a non-zod Standard Schema', () => {
    const manual = ril.create().tool('custom', {
      description: 'Custom',
      inputSchema: { '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) } } as never,
      inputJsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
    } as never);
    expect(tools(manual)[0].input_schema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
  });

  it('skips a tool whose schema cannot be converted rather than throwing', () => {
    const broken = ril.create().tool('broken', {
      description: 'Broken',
      inputSchema: { '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) } } as never,
    } as never);
    expect(tools(broken)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/agent/tests/anthropic/adapter.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/agent/src/anthropic/index.ts
import { z } from 'zod';
import { getLogger } from '@rilaykit/core';
import type { RilayInstance } from '@rilaykit/core';
import type { Part } from '../types/part';

type AnyCatalog = RilayInstance<Record<string, unknown>>;
const logger = getLogger('agent:anthropic');

export interface AnthropicToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly input_schema: Record<string, unknown>;
}

interface AnthropicBlock {
  readonly type?: string;
  readonly text?: string;
  readonly id?: string;
  readonly name?: string;
  readonly input?: unknown;
}

export function toParts(message: unknown): Part[] {
  const content = (message as { content?: readonly AnthropicBlock[] } | undefined)?.content;
  if (!Array.isArray(content)) return [];

  const result: Part[] = [];
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      result.push({ type: 'text', text: block.text, state: 'done' });
      continue;
    }
    if (block.type === 'tool_use' && block.id && block.name) {
      // The Messages API delivers tool_use complete: there is no `streaming` state
      // to map here. Streaming callers drive `rawInput` through parsePartialJson.
      result.push({ type: 'tool', toolCallId: block.id, name: block.name, state: 'ready', input: block.input ?? {} });
    }
  }
  return result;
}

function toJsonSchema(entry: { inputSchema?: unknown; inputJsonSchema?: unknown }): Record<string, unknown> | null {
  if (entry.inputJsonSchema) return entry.inputJsonSchema as Record<string, unknown>;
  try {
    return z.toJSONSchema(entry.inputSchema as z.ZodType) as Record<string, unknown>;
  } catch (error) {
    return null;
  }
}

/**
 * Native `z.toJSONSchema()` — no custom converter (spec §13). Non-zod Standard
 * Schemas supply `inputJsonSchema` manually. A tool we cannot convert is SKIPPED
 * and logged, never thrown: one unconvertible tool must not take down the request.
 */
export function tools(catalog: AnyCatalog): AnthropicToolDefinition[] {
  const definitions: AnthropicToolDefinition[] = [];
  for (const tool of catalog.getAllTools()) {
    if (!tool.inputSchema) continue;
    const input_schema = toJsonSchema(tool);
    if (!input_schema) {
      logger.warn(`Skipping tool "${tool.name}": inputSchema is not zod and no inputJsonSchema was provided`);
      continue;
    }
    definitions.push({ name: tool.name, description: tool.description, input_schema });
  }
  return definitions;
}
```

> If `ToolEntry` has no `inputJsonSchema` field, add it in this task (`packages/core/src/types/catalog.ts:58`) — it is the sanctioned escape hatch for non-zod Standard Schemas, and the test above requires it.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run packages/agent/tests/anthropic/adapter.test.ts
```
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/anthropic packages/agent/tests/anthropic packages/core/src/types/catalog.ts
git commit -m "feat(agent): anthropic adapter (toParts + tools)"
```

---

### Task 15: Exports, all-in-one surface, and the published-artifact guard

**Files:**
- Modify: `packages/rilaykit/src/index.ts`, `packages/rilaykit/package.json`, `packages/rilaykit/tests/published-bundle.test.ts`
- Test: `packages/rilaykit/tests/agent-surface.test.ts`

**Interfaces:**
- Produces: `rilaykit` re-exports the agent surface. Resolve any name collision with the existing selective-export pattern (`packages/rilaykit/src/index.ts` already does this for `useConditionEvaluation`/`ConditionEvaluationResult`, which exist in both forms and workflow).

- [ ] **Step 1: Write the failing test**

```ts
// packages/rilaykit/tests/agent-surface.test.ts
import { describe, expect, it } from 'vitest';
import * as rilaykit from '../src';

describe('all-in-one agent surface', () => {
  it('exposes the isomorphic agent API', () => {
    expect(typeof rilaykit.uiTools).toBe('function');
    expect(typeof rilaykit.manifest).toBe('function');
    expect(typeof rilaykit.parsePartialJson).toBe('function');
    expect(typeof rilaykit.isToolPart).toBe('function');
  });

  it('does NOT re-export React components from the main entry — it must stay isomorphic', () => {
    expect('Parts' in rilaykit).toBe(false);
    expect('Catalog' in rilaykit).toBe(false);
  });
});
```

> The second test is the design's load-bearing rule, not a nicety: `lib/catalog.ts` does `import { ril, uiTools } from 'rilaykit'` and is imported by the server. If the all-in-one's main entry pulls `createContext`, every RSC importing it crashes. React components go to `rilaykit/react`, mirroring core.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/rilaykit/tests/agent-surface.test.ts
```
Expected: FAIL — `uiTools` is not exported.

- [ ] **Step 3: Wire the exports**

Add `@rilaykit/agent` to `packages/rilaykit/package.json` dependencies. Re-export the isomorphic agent surface from `packages/rilaykit/src/index.ts`; add a `rilaykit/react` entry (mirroring Task 2's core split) re-exporting `@rilaykit/agent/react`. Add the `./react`, `./ai-sdk`, `./anthropic` subpaths to the package's `exports` and to `tsup.config.ts`'s entry list.

- [ ] **Step 4: Extend the published-bundle guard to the agent package**

`packages/rilaykit/tests/published-bundle.test.ts` loads the real dist in a **child node process** — vitest aliases resolve to source, so this is the ONLY test that sees the published artifact. It already covers 4 packages. Add `@rilaykit/agent` and each of its 4 entry points: CJS ≡ ESM export parity, and `require()` must not throw.

> P2 r3 shipped a package that could not be `require()`d: two `LocalStorageAdapter` classes collided in the all-in-one barrel, and the entire suite was blind because everything resolved to source. This guard is why that cannot happen again — a new package with 4 entry points is exactly the shape that reopens it.

- [ ] **Step 5: Run tests + build to verify they pass**

```bash
pnpm build
pnpm vitest run packages/rilaykit/tests/
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rilaykit packages/agent
git commit -m "feat(rilaykit): export the agent surface through the all-in-one"
```

---

### Task 16: P3 Feature Proof Matrix — the phase gate (mandatory per spec §9)

**Files:**
- Create: `docs/superpowers/plans/2026-07-16-p3-proof-matrix.md`
- Create: `packages/agent/tests/e2e/agent-loop.proof.test.tsx`
- Modify: whatever the gate proves is missing

**This task is not paperwork. Spec §9 makes it mandatory for every phase; P1's Task 19 and P2's Task 9 are the precedent.**

- [ ] **Step 1: Write the feature proof matrix**

Enumerate **every user-facing capability of P3**, each with the exact test (`file:testname`) that fails if it breaks. **A row without a proving test is a test to write, not a row to delete.** Minimum rows:

| Capability | Proving test |
|---|---|
| A text part renders through the catalog | `Part.test.tsx:resolves a text part through the part: namespace` |
| A tool part reaches its renderer with state + input | `Part.test.tsx:hands a tool renderer its state and input` |
| Unknown tool falls back, humanized | `Part.test.tsx:falls back to a humanized name` |
| `resolve()` mirrors `onResolve` with the right toolCallId | `Parts.test.tsx:routes each part its OWN toolCallId` |
| `show_component` renders a recursive tree | `ShowComponent.test.tsx:resolves a tree recursively` |
| A failing node is isolated | `ShowComponent.test.tsx:ISOLATES a failing node` |
| Bad props yield structured `expectedKeys` | `ShowComponent.test.tsx:names the expected keys` |
| `show_form` compiles and renders an emission | `ShowForm.test.tsx:compiles the emitted schema` |
| HITL submitted payload | `ShowForm.test.tsx:resolves { status: "submitted", values }` |
| HITL cancelled payload | `ShowForm.test.tsx:resolves { status: "cancelled" }` |
| Double-submit resolves once | `ShowForm.test.tsx:does not resolve twice` |
| `show_flow` renders at `ready` only | `ShowFlow.test.tsx:...` |
| Progressive mounting | `ShowForm.streaming.test.tsx:mounts a field as soon as its definition is complete` |
| Submit locked while streaming | `ShowForm.streaming.test.tsx:LOCKS submit until the schema is complete` |
| Streaming preserves user input | `ShowForm.streaming.test.tsx:PRESERVES what the user typed` |
| Partial JSON never throws on any prefix | `parse-partial-json.test.ts:parses every prefix` |
| `manifest()` teaches components + props | `manifest.test.ts:...` |
| ai-sdk state mapping | `adapter.test.ts:maps every AI SDK state` |
| ai-sdk emits UI tools without execute | `adapter.test.ts:emits UI tools WITHOUT execute` |
| Renderer-only tools excluded | `adapter.test.ts:EXCLUDES renderer-only tools` |
| anthropic `input_schema` via native converter | `adapter.test.ts:emits { name, description, input_schema }` |
| Main entries stay isomorphic | `isomorphic-entry.test.ts` + `agent-surface.test.ts` |
| Published artifact loads (CJS ≡ ESM) | `published-bundle.test.ts` |
| In-flight work does not cross a step swap | `store-enforces-inflight-work.test.tsx` |

- [ ] **Step 2: Write the end-to-end loop proof**

```tsx
// packages/agent/tests/e2e/agent-loop.proof.test.tsx
/**
 * The whole thesis of P3 in one test: an agent emits JSON → rilaykit renders it →
 * a human answers → the agent receives engine-validated values. No mocks of rilaykit;
 * a real catalog, a real store, a real compile.
 */
it('closes the loop: emission → render → human answer → resolved values', async () => {
  // 1. server: manifest(catalog) + tools(catalog) — assert show_form is offered without execute
  // 2. model emits a show_form tool call (a literal JSON fixture — the shape a model really emits)
  // 3. toParts() → <Parts> renders it
  // 4. user fills and submits
  // 5. onResolve receives { status: 'submitted', values: {...} } with EXACT values
});
```

- [ ] **Step 3: Write the hardening tests spec §9 requires**

Scenarios unit tests miss: partial-JSON chunk simulation at **every** prefix boundary of a real emission; a HITL round-trip where the agent re-emits after an error part; an emission naming a component that exists but has no renderer attached; a `ComponentNode` tree 5 levels deep; a tool part arriving `done` with no prior `streaming`; two `show_form` parts in one message resolving independently; an emission with a `__proto__` component type (the class that escaped 7 times).

- [ ] **Step 4: Run the coverage gate**

```bash
pnpm vitest run --coverage
```
Thresholds are the repo's configured 90/85/90/90. **Never lower a threshold to pass** — write the test.

- [ ] **Step 5: Adversarial checker pass over the whole P3 diff**

Four lenses over `git diff main...HEAD -- packages/agent packages/core/src/react packages/forms/src`: **tests-prove-behavior** (would this test fail if the feature broke? mutate and see), **DRY**, **elegance**, **conventions** (typed errors, no `console.*`, no `any`, one component per file). Fix every confirmed finding. Refuting a finding with evidence is a valid outcome — record why.

- [ ] **Step 6: Full gate**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
pnpm vitest run && pnpm vitest run && pnpm vitest run   # 3× consecutive identical
pnpm type-check
pnpm build
```
All green; run counts identical across the three runs. Lint back to its 11-error baseline with none in P3 files.

- [ ] **Step 7: Commit the proof record**

```bash
git add docs/superpowers/plans/2026-07-16-p3-proof-matrix.md packages/agent/tests
git commit -m "test(agent): P3 feature proof matrix and phase gate"
```

---

## Plan Self-Review (done at authoring time)

**1. Spec coverage (§7 walked line by line):**
- Part model (own discriminated union, AI SDK-aligned, `reasoning`/`source`/`file` deferred) → Task 3 ✓
- `<Parts>` + granular `<Part>` + `part:*`/`tool:*` resolution + `<Catalog>` context + `onResolve` mirror + humanized unknown-tool fallback + consumer fallback → Tasks 2, 4, 5 ✓
- Built-in `show_form`/`show_flow`/`show_component` fallbacks living in `<Parts>` → Tasks 8, 9 ✓
- `uiTools()` isomorphic pure schemas → Task 6 ✓
- Recursive `ComponentNode`, per-node `propsSchema` validation, already-rendered children, failing node → structured error not a crash → Tasks 6, 8 ✓
- Intention verbs (`show_*`) → Task 6 ✓
- `manifest()` provider-neutral in the main package → Task 10 ✓
- `tools(catalog)` per adapter; ai-sdk passes zod through + no `execute`; anthropic native `z.toJSONSchema()` + manual fallback → Tasks 13, 14 ✓
- Uniform adapter pair `toParts` + `tools` → Tasks 13, 14 ✓
- Partial-JSON parser (~100 lines, no dependency) → Task 11 ✓
- `compileForm` lenient mode, mount on complete definition, reconcile by stable id, append-only, no reset, immediately interactive, submit locked until complete → Task 12 ✓
- Flows render at `ready` (scope cut) → Task 9 ✓
- HITL `resolve` + `{status:'submitted'|'cancelled'}` + engine-validated values → Task 9 ✓
- Self-correction `{ error, issues, expectedKeys }` → Task 7 ✓
- §9 proof gate (matrix + hardening + coverage + adversarial pass) → Task 16 ✓

**2. Placeholder scan:** every code step carries real code. Three steps deliberately say "read the real file first, use the names that exist" (Task 9's `Form.*`/`Flow.*` compounds, Task 12's `FormProvider` internals, Task 3's devDependency versions) — that is an instruction to verify against source, not a placeholder, and inventing those names is the failure mode it prevents.

**3. Type consistency:** `Part`/`ToolPart`/`PartState` (Task 3) are used unchanged in 4, 5, 13, 14. `EmissionResult` (Task 7) is consumed by 8 and 9. `ComponentNode` (Task 6) by 8. `useCatalog` (Task 2) by 4, 8, 9. `toParts`/`tools` have identical signatures in 13 and 14 (the spec's "uniform pair"). `resolve(output)` (core's `ToolRenderContext.resolve`, `catalog.ts:54`) is threaded 4 → 9 unchanged.

**4. Known risks flagged at authoring time, for the executor to resolve against source, not to guess:**
- Task 9 assumes P1's compound names are `Form.Body`/`Form.Fields`/`Form.Submit` and `Flow.Body`/`Flow.Next`/`Flow.Back`. **Verify before writing.**
- Task 10's `describeProps` reads zod v4 internals (`_def.typeName`, `isOptional()`). If v4 moved them, prefer `z.toJSONSchema()` and describe from the JSON Schema — one source of truth beats two.
- Task 12 is the highest-risk task in the plan: it touches `FormProvider`'s reset path, which the stabilization campaign closed **twice**. Its mutation-check (Step 7) is not optional.
