# P3 Feature Proof Matrix — Agent Layer

> Phase gate record (Task 16, spec §9). Every user-facing capability of P3 is
> pinned by at least one exact-assertion, real-catalog test. `file:testname`
> points at the test that fails if the capability breaks. Paths are relative to
> `packages/agent/tests/` unless another package is named. The end-to-end proof
> added by this gate lives in `packages/agent/tests/e2e/agent-loop.proof.test.tsx`.
> Mirrors the P1 gate (`2026-07-13-p1-proof-matrix.md`) and the P2 gate
> (`2026-07-14-p2-proof-matrix.md`).

## The loop itself (e2e, nothing mocked)

| Feature | Proven by |
|---|---|
| **Emission → render → human answer → resolved values.** Server: `manifest(catalog)` teaches components/props/tools, ai-sdk `tools(catalog)` offers `show_form` WITHOUT `execute`. Model: a literal AI SDK v5 `UIMessage` JSON fixture. Client: `toParts()` → `<Parts>` through a real catalog, real compile, real store. Human types and submits. Agent receives `('call_42', { status: 'submitted', values: { name: 'Karl', email: 'karl@example.com' } })` — exactly. | **flagship** `e2e/agent-loop.proof.test.tsx: closes the loop: emission → render → human answer → resolved values` |
| `show_flow` resolves the **step-keyed authored shape** (`values[stepId][fieldId]`, never a flat merge) — pinned at the loop level for downstream consumers | `e2e/agent-loop.proof.test.tsx: show_flow resolves the step-keyed AUTHORED shape — each step id keys exactly its own fields`; unit: `react/ShowFlow.test.tsx: resolves { status: "submitted", values } with the ENGINE-VALIDATED step-keyed data on completion` |
| Two `show_form` parts in ONE message resolve independently, each to its own `toolCallId`, in any submit order | `e2e/agent-loop.proof.test.tsx: two show_form parts in ONE message resolve independently — each answer reaches its own toolCallId` |
| HITL re-emission after an error part: the failed call renders settled, the fresh call is fully live | `e2e/agent-loop.proof.test.tsx: HITL re-emission after an error part: the failed call renders settled, the fresh call resolves` |
| A tool part arriving `done` with NO prior streaming (rehydrated conversation) renders the settled marker and never re-arms | `e2e/agent-loop.proof.test.tsx: a tool part arriving `done` with NO prior streaming renders the settled marker and never re-arms the loop`; per-state unit: `react/ShowForm.test.tsx` / `react/ShowFlow.test.tsx: at %s: no … controls, no resolve — only the bare DefaultTool marker` |
| `__proto__` as a FIELD ID through the FULL pipeline (parser → compile → render → submit) stays an own key; no prototype graft anywhere | `e2e/agent-loop.proof.test.tsx: an emission whose field id is __proto__ walks the FULL loop as an own key — parser → compile → render → submit` |

## `<Parts>` / `<Part>` dispatch

| Feature | Proven by |
|---|---|
| A text part renders through the catalog `part:` namespace | `react/Part.test.tsx: resolves a text part through the part: namespace` |
| A tool part reaches its renderer with state + input | `react/Part.test.tsx: hands a tool renderer its state and input` |
| `resolve()` mirrors `onResolve` with the right `toolCallId` | `react/Part.test.tsx: wires resolve() to onResolve with the toolCallId — the HITL mirror`; `react/Parts.test.tsx: routes each part its OWN toolCallId — not the last one rendered` |
| Unknown tool falls back, humanized | `react/Part.test.tsx: falls back to a humanized name for an unregistered tool` |
| Consumer fallback beats the built-in | `react/Part.test.tsx: prefers a consumer fallback over the built-in one` |
| Tools named after `Object.prototype` members (`toString`, `constructor`, `__proto__`) fall back safely — the built-in lookup never resolves an inherited member | `react/Part.test.tsx: a tool named %s falls back to the DefaultTool marker …` (×3; kills the `getOwn` → direct-access mutation, replayed at this gate) |
| Unregistered part type renders nothing, never crashes | `react/Part.test.tsx: renders nothing for an unregistered part type rather than crashing` |
| Explicit `catalog` prop works with no `<Catalog>` ancestor; neither → typed `ConfigurationError` | `react/Part.test.tsx: renders using an explicit catalog prop with no <Catalog> ancestor`; `…: throws a ConfigurationError with neither a catalog prop nor a <Catalog> ancestor` |
| Every part renders in order; empty list is fine | `react/Parts.test.tsx: renders every part in order`; `…: renders an empty list without crashing` |
| `<Catalog>` context: descendants read the catalog; `useCatalog` outside → typed error; `useCatalogOrNull` → null; `useCatalogEntry` resolves each namespace without bleed | `packages/core/tests/react/catalog-context.test.tsx: exposes the catalog to descendants`; `…: throws a typed ConfigurationError outside a provider`; `…: useCatalogOrNull returns null outside a provider …`; `…: useCatalogEntry resolves each namespace to ITS entry — and misses to undefined` (the last two written at this gate — the hooks were shipped untested) |

## `show_component`

| Feature | Proven by |
|---|---|
| Leaf node renders with validated props | `react/ShowComponent.test.tsx: renders a leaf node with validated props` |
| Recursive tree; each renderer gets its rendered children | `react/ShowComponent.test.tsx: resolves a tree recursively and hands each renderer its rendered children` |
| **5-level heterogeneous tree, exact DOM nesting** (Task 6 review mandate — coverage previously stopped at 2 levels) | `react/ShowComponent.test.tsx: renders a 5-LEVEL heterogeneous tree with the exact nesting — every level receives its own validated props and its rendered children` |
| A failing node is ISOLATED — siblings render | `react/ShowComponent.test.tsx: ISOLATES a failing node — its siblings still render` |
| Bad props yield structured `expectedKeys` | `react/ShowComponent.test.tsx: names the expected keys so the model can retry`; unit: `errors/emission-error.test.ts: names the offending path and the keys the model should have emitted` |
| Unknown component type → structured error | `react/ShowComponent.test.tsx: reports an unknown component type instead of crashing` |
| A component that EXISTS but has no renderer attached → structured error, sibling survives | `react/ShowComponent.test.tsx: reports a component that EXISTS in the catalog but has no renderer attached — a schema-only entry is not renderable` (written at this gate) |
| `__proto__`/`constructor`/`toString` as component TYPE → unknown, never an inherited member | `react/ShowComponent.test.tsx: treats a %s component type as UNKNOWN — the catalog lookup never resolves an inherited Object member` (×3, written at this gate) |
| Streaming renders nothing; the same part at `ready` renders | `react/ShowComponent.test.tsx: renders NOTHING while the part is streaming …`; `…: renders the tree once the same part reaches ready` |
| Malformed node / non-array children → structured error | `react/ShowComponent.test.tsx: reports a malformed node instead of crashing`; `…: reports non-array children instead of crashing` |
| Depth cap: 10k-deep tree errors (no stack overflow), exactly-at-cap renders, one-past-cap errors while its sibling renders | `react/ShowComponent.test.tsx: caps recursion …`; `…: renders a tree exactly at the depth cap`; `…: errors one past the depth cap, and the SIBLING of the too-deep subtree still renders` |
| Renderer receives the PARSED props — hostile excess keys stripped | `react/ShowComponent.test.tsx: hands the renderer the PARSED props — an excess hostile key is stripped`; unit: `errors/emission-error.test.ts: returns the PARSED value, not the raw input …` |
| A THROWING renderer is contained per node (`NodeBoundary`) | `react/ShowComponent.test.tsx: CONTAINS a throwing renderer — its sibling still renders, nothing propagates`. Known limitation: the boundary is sticky per instance — documented in `NodeBoundary.tsx` (accepted for P3; nominal pipeline remounts via new `toolCallId`) |

## `show_form` (HITL)

| Feature | Proven by |
|---|---|
| Compiles and renders an emitted schema | `react/ShowForm.test.tsx: compiles the emitted schema and renders it` |
| Submitted payload `{ status: 'submitted', values }` — ENGINE-validated, exact values | `react/ShowForm.test.tsx: resolves { status: "submitted", values } — the agent receives ENGINE-VALIDATED values`; e2e flagship |
| Cancelled payload `{ status: 'cancelled' }` | `react/ShowForm.test.tsx: resolves { status: "cancelled" } — cancellation is in the contract from day one` |
| Double-submit resolves once | `react/ShowForm.test.tsx: does not resolve twice on a double submit` |
| **Cancel AFTER a resolved submit does not double-resolve** (Task 9 review mandate) | `react/ShowForm.test.tsx: a cancel AFTER a resolved submit does not double-resolve — the answer stays the submitted one` (written at this gate; `settled`-ref mutation replayed — 3 tests fail without it) |
| Cancel RACING an in-flight submit yields exactly one answer | `react/ShowForm.test.tsx: a cancel RACING an in-flight submit yields exactly one answer` (written at this gate) |
| Malformed schema → structured emission error with pathed issues | `react/ShowForm.test.tsx: renders a structured error for a malformed schema instead of crashing` |
| Wrong prop key on a KNOWN component → per-issue `expectedKeys` | `react/ShowForm.test.tsx: validates props of KNOWN components …` |
| Warning-severity issues never block | `react/ShowForm.test.tsx: warning-severity issues do not block an otherwise-valid schema — only errors block` |
| Emitted `submitOptions.force`/`skipInvalid` CANNOT bypass engine validation | `react/ShowForm.test.tsx: force: true with an invalid required field → submit does NOT resolve`; `…: force: true with the field filled validly → resolves with the exact values`; `…: skipInvalid: true with an invalid required field → submit does NOT resolve` |
| At `done`/`error`: bare settled marker, no controls, no resolve | `react/ShowForm.test.tsx: at %s: no form controls, no resolve …` (×2) |
| A CATALOG defect (async propsSchema) surfaces raw — never converted into a model-blaming emission error | `react/ShowForm.test.tsx: a CATALOG defect (async propsSchema) is not an emission error …` (written at this gate; same pin for flows) |

## `show_form` progressive streaming

| Feature | Proven by |
|---|---|
| A field mounts as soon as its definition is complete | `react/ShowForm.streaming.test.tsx: mounts a field as soon as its definition is complete` |
| Mounted fields are IMMEDIATELY interactive | `react/ShowForm.streaming.test.tsx: makes a mounted field IMMEDIATELY interactive` |
| Submit AND cancel locked until the emission is provably complete; unlock on completion | `react/ShowForm.streaming.test.tsx: LOCKS submit until the schema is complete`; `…: LOCKS cancel too …`; `…: unlocks submit once the emission completes`; no-`rawInput` degrade: `react/ShowForm.test.tsx: mounts progressively while the part is streaming, with submit LOCKED …` |
| Nothing renders before a stable identity (schema `id`) — nor before the schema value itself exists | `react/ShowForm.streaming.test.tsx: renders NOTHING before the schema id has arrived …`; `…: renders NOTHING before the schema VALUE itself has arrived …` (second written at this gate) |
| User input survives chunk growth AND the streaming → ready transition; reconcile by stable id, no duplicates | `react/ShowForm.streaming.test.tsx: PRESERVES what the user typed as later chunks arrive — append-only, no reset`; `…: PRESERVES what the user typed across the streaming → ready transition`; `…: reconciles by stable field id — a re-emitted field does not duplicate` |
| Late-arriving streamed `default`: applies after the field core, never overwrites typed input, values are chunk-boundary-INDEPENDENT (4 cut points against a single-chunk oracle) | `react/ShowForm.streaming.test.tsx: applies a default that arrives one chunk AFTER the field core`; `…: a late default NEVER overwrites what the user typed before its chunk arrived`; `…: values at ready are chunk-boundary-INDEPENDENT — cut %s` (×4); store-level: `packages/forms/tests/components/FormProvider.configGrowth.test.tsx` (7 growth/late-default tests incl. the workflow-echo pin and the reset-restores-late-default pin) |
| **A repeatable whose template GAINS a field mid-stream keeps its live rows** — the new field renders empty on them; a late template `defaultValue` never re-seeds existing rows (documented family, comment in `FormProvider.tsx`) | `packages/forms/tests/components/FormProvider.configGrowth.test.tsx: an EXISTING repeatable whose template GAINS a field mid-growth keeps its live rows …` (written at this gate; skip-guard mutation replayed — the test fails without it) |
| Lenient compilation is the SAME rule set as strict (subset → one assembly path) | `packages/forms/tests/schema/` compile-form lenient suites (Task 12) + the streaming suites above driving it end-to-end |

## `show_flow` (HITL)

| Feature | Proven by |
|---|---|
| Renders at `ready` ONLY — streaming renders NOTHING (deliberate spec cut) | `react/ShowFlow.test.tsx: renders NOTHING while streaming — flows render at ready ONLY (deliberate spec cut)` |
| Compiles and renders the first step through the real `WorkflowProvider`; real Flow chrome navigates | `react/ShowFlow.test.tsx: compiles the emitted schema and renders the first step through WorkflowProvider`; `…: navigates to the next step with the real Flow chrome` |
| Completion resolves engine-validated, step-keyed values | `react/ShowFlow.test.tsx: resolves { status: "submitted", values } with the ENGINE-VALIDATED step-keyed data on completion`; e2e authored-shape pin |
| Cancelled payload; cancel AFTER completion resolves exactly once | `react/ShowFlow.test.tsx: resolves { status: "cancelled" } …`; `…: a cancel AFTER completion does not double-resolve — one answer per tool call` (second written at this gate) |
| Malformed schema → structured error with flow-pathed issues; wrong props → per-issue `expectedKeys` | `react/ShowFlow.test.tsx: renders a structured error for a malformed schema instead of crashing`; `…: validates props of KNOWN components …` |
| Per-step emitted `submitOptions.force` neutralized | `react/ShowFlow.test.tsx: a step form emitting submitOptions.force cannot bypass engine validation` |
| At `done`/`error`: settled marker only | `react/ShowFlow.test.tsx: at %s: no flow controls, no resolve …` (×2) |
| Catalog defect surfaces raw | `react/ShowFlow.test.tsx: a CATALOG defect (async propsSchema) is not an emission error …` (written at this gate) |

## Partial-JSON parser

| Feature | Proven by |
|---|---|
| Never throws on ANY prefix of a real emission — and only the whole emission reports complete | `streaming/parse-partial-json.test.ts: parses every prefix of a real emission without throwing`; property suites over three realistic fixtures (show_form / show_flow / show_component wire shapes): `…: %s: never throws on any prefix`; `…: %s: every defined value survives a JSON round-trip`; `…: %s: only the whole emission reports complete`. **This satisfies the plan's "chunk simulation at every prefix boundary" hardening item — verified present (Task 11), referenced, not duplicated.** Reviewer fuzz record: 56k + 43k cases (Task 11 review). |
| Truncated containers close; torn tokens drop (strings incl. mid-escape/mid-unicode, ambiguous numbers, torn keywords); completed siblings survive | `streaming/parse-partial-json.test.ts` torn-token + regression suites (15 tests) |
| `__proto__` keys stay OWN properties (top-level, nested, escaped-unicode, array-valued), descriptor bit-identical to `JSON.parse` | `streaming/parse-partial-json.test.ts: keeps a top-level __proto__ key as an own property …` (+3 variants) |
| Garbage, empty string, trailing garbage, bare-scalar-root contract | `streaming/parse-partial-json.test.ts: never throws on garbage …`; `…: handles the empty string`; `…: does not report complete when trailing garbage follows a complete value`; `…: reports a bare root number as complete, per the documented contract` |

## Server surface: `uiTools()`, `manifest()`, adapters

| Feature | Proven by |
|---|---|
| `uiTools()` registers exactly the three premium tools, intention verbs, schemas only (no React), immutable, recursive `ComponentNode` schema | `tools/ui-tools.test.ts` (all 6 tests) |
| `manifest()` teaches components + props (+ optionality), teaches show_form vs show_component, deterministic, excludes renderer-only tools, empty catalog fine | `manifest/manifest.test.ts` (7 tests) |
| `manifest()` never throws: malformed propsSchema, schema-less component, throwing converter, non-object schema, type-less (union) prop → `unknown`, description-less component/tool | `manifest/manifest.test.ts` degrade suite (6 tests; the last 3 written at this gate) |
| ai-sdk `toParts`: maps every AI SDK state; recovers `tool-${name}`; carries output/errorText; maps `data-${name}`; streaming vs done text; normalizes missing input to `{}`; skips unmapped state / missing toolCallId / null slots / unknown types | `ai-sdk/adapter.test.ts` toParts suite (11 tests; 4 written at this gate — DataPart mapping had NO test) |
| ai-sdk `tools`: UI tools WITHOUT `execute`; zod schemas pass through BY REFERENCE; renderer-only excluded; descriptions carried; `__proto__` tool name stays an own property | `ai-sdk/adapter.test.ts` tools suite (5 tests) |
| anthropic `toParts`: text + `tool_use` → ready; ignores unmodeled blocks; no content / garbage / null slots never throw | `anthropic/adapter.test.ts` toParts suite (5 tests) |
| anthropic `tools`: `{ name, description, input_schema }` via native `z.toJSONSchema()`; renderer-only excluded; zod conversion WINS over manual `inputJsonSchema`; manual fallback for non-zod vendors; unconvertible tool skipped, never thrown | `anthropic/adapter.test.ts` tools suite (5 tests) |
| Part model narrows exactly; streaming carriage (`rawInput` et al.) | `types/part.test.ts` (2 tests + type-level assertions) |
| Structured emission errors: severity + per-issue `expectedKeys` carried; never throws (throwing getters, null issues, rogue toString); structural discriminant pinned both ways; async propsSchema rejected sync; vendor-agnostic issue paths | `errors/emission-error.test.ts` (15 tests; 2 written at this gate) |

## Entry isomorphism & published artifacts

| Feature | Proven by |
|---|---|
| `@rilaykit/agent` main entry pulls neither React nor `@rilaykit/forms` into the module graph | `packages/rilaykit/tests/published-bundle.test.ts: @rilaykit/agent: the main entry does not pull React or @rilaykit/forms into the module graph` |
| `@rilaykit/core` main entry stays React-free | `packages/core/tests/isomorphic-entry.test.ts: does not pull React into the module graph` |
| All-in-one `rilaykit` exposes the isomorphic agent API and does NOT re-export React components from the main entry | `packages/rilaykit/tests/agent-surface.test.ts` (both tests) |
| Published artifact loads: CJS ≡ ESM surface for every package and subpath (`/react`, `/ai-sdk`, `/anthropic`) | `packages/rilaykit/tests/published-bundle.test.ts: ${pkg.name}: require()s the CJS bundle and import()s the ESM bundle with an identical surface` (+ subpath variant) |
| In-flight work does not cross a step swap (HITL under the workflow store) | `packages/workflow/tests/stores/store-enforces-inflight-work.test.tsx` (incl. the runtime-derived settle-door enumeration) |

## Coverage gate

`pnpm vitest run --coverage` at the gate commit — suite: **223 files / 2186 tests
passed, 1 skipped**, type-check green.

Repo thresholds (90 L / 85 B / 90 F / 90 S, never lowered). Per-file numbers for
every P3 runtime file — all four thresholds cleared by every file:

| File | % Lines | % Branch | % Funcs | % Stmts |
|---|---|---|---|---|
| `agent/src/ai-sdk/index.ts` | 100 | 96.66 | 100 | 100 |
| `agent/src/anthropic/index.ts` | 100 | 95.65 | 100 | 100 |
| `agent/src/errors/emission-error.ts` | 100 | 100 | 100 | 100 |
| `agent/src/manifest/manifest.ts` | 100 | 100 | 100 | 100 |
| `agent/src/react/Part.tsx` | 100 | 90.62 | 100 | 100 |
| `agent/src/react/Parts.tsx` | 100 | 100 | 100 | 100 |
| `agent/src/react/fallbacks/DefaultTool.tsx` | 100 | 100 | 100 | 100 |
| `agent/src/react/fallbacks/EmissionErrorView.tsx` | 100 | 100 | 100 | 100 |
| `agent/src/react/fallbacks/NodeBoundary.tsx` | 100 | 100 | 100 | 100 |
| `agent/src/react/fallbacks/ShowComponent.tsx` | 100 | 91.3 | 100 | 100 |
| `agent/src/react/fallbacks/ShowFlow.tsx` | 100 | 100 | 100 | 100 |
| `agent/src/react/fallbacks/ShowForm.tsx` | 100 | 96 | 100 | 96.66 |
| `agent/src/streaming/parse-partial-json.ts` | 92.79 | 94.25 | 100 | 93.33 |
| `agent/src/tools/component-node-schema.ts` | 100 | 100 | 100 | 100 |
| `agent/src/tools/ui-tools.ts` | 100 | 100 | 100 | 100 |
| `agent/src/types/part.ts` | 100 | 100 | 100 | 100 |
| `core/src/react/catalog-context.tsx` | 100 | 100 | 100 | 100 |
| `agent/src/index.ts` + `core/src/react/index.ts` + `rilaykit/src/{ai-sdk,anthropic,react}` | re-export barrels: v8 `all: true` reports them 0% despite the surface tests importing them; no executable logic to cover |

Residual uncovered branches, each individually justified (not gamed):
`parse-partial-json.ts` — the terminal `catch` safety net (stack exhaustion) and
defensive arms unreachable through the public API; `ShowForm.tsx` line 105 — the
belt-and-braces `pending` arm inside `catch`, documented UNREACHABLE in code
(lenient compilation never raises); `Part.tsx`/`ShowComponent.tsx`/adapters —
symmetric defensive arms of guards whose reachable sides are pinned.

Global v8 thresholds: lines (91.43), functions (91.03) and statements (90.39)
now PASS globally; branches remain **unmet globally** (82.85 vs 85) — the
pre-P1 legacy shortfall documented in the P1 and P2 matrices
(`workflow/hooks/useWorkflowState.ts`, `core/monitoring/*`, legacy
analytics/condition hooks, `core/validation/{utils,unified-utils}.ts`, plus
type-only files counted 0% by `all: true`). **Not a P3 gap**: P3 moved the
global numbers UP from P2's 87.82 L / 79.25 B / 86.89 F / 87.42 S — and pushed
three of the four global thresholds over the line for the first time. Every P3
file clears every threshold. Raising the legacy modules stays tracked as
pre-existing debt.

## Hardening ledger (the items carried from the 15 task reviews)

| # | Mandate | Resolution |
|---|---|---|
| 1 | (Task 6) 5-level ComponentNode tree | Test written, exact-nesting assertions — see show_component section |
| 2 | (Task 9) cancel-after-submit race | Two dedicated tests written; `settled` guard mutation replayed (3 tests die) |
| 3 | (Task 9) ShowFlow step-keyed authored shape in the e2e proof | Pinned in `agent-loop.proof.test.tsx` |
| 4 | (Tasks 8/12) `__proto__` through the FULL loop | e2e test: parser → compile → render → submit, own-key + prototype-intact assertions; plus component-type and tool-name variants |
| 5 | (Task 5) two show_form parts in one message | e2e test, reverse submit order |
| 6a | done with no prior streaming | e2e test through `toParts` (`output-available` first appearance) |
| 6b | re-emit after an error part | e2e test |
| 6c | component exists, no renderer | ShowComponent test |
| 6d | every-prefix chunk simulation | Verified present in Task 11's property suites over realistic emissions; referenced, not duplicated |
| 7a | late repeatable-template defaults code comment | Added in `FormProvider.tsx` (growth seeding loop) |
| 7b | repeatable-template-growth test gap | Test written in `FormProvider.configGrowth.test.tsx`; skip-guard mutation replayed |
| 8 | NodeBoundary sticky error | KNOWN LIMITATION comment added in `NodeBoundary.tsx`; no redesign |

## Adversarial pass over the P3 diff (`5ca39bc..HEAD`)

Four lenses: tests-prove-behavior, DRY, elegance, conventions.

**Confirmed and fixed:**
1. **Lint drift** — P3 had moved the repo from its 11-error biome baseline to 49
   (format/organizeImports/useImportType across P3 files). Safe fixes applied to
   P3-touched files only; now 10 errors, all pre-P3 legacy, none in P3 files.
2. **Dead code** — `collectAllFields` in `compile-form.ts`, superseded by
   `collectFieldsWithPaths` during Task 12; removed.
3. **Untested public API** — `useCatalogEntry` (exported from both
   `@rilaykit/core/react` and `@rilaykit/agent/react`) and the
   `useCatalogOrNull` null arm had zero proving tests; tests added.
4. **Untested capability** — ai-sdk DataPart mapping (`data-*` parts) had no
   test at all; plus streaming-text, missing-input and unmapped-state arms.
5. **Untested guards** — ShowFlow's one-answer `settle` guard was never
   exercised; the non-`SchemaValidationError` rethrow arms of ShowForm/ShowFlow
   (a CATALOG defect must crash, not be fed to the model as its mistake) were
   never exercised; `validateNodeProps`' async-schema rejection and
   vendor-agnostic path mapping were never exercised. All pinned.
6. **Mutation replay** (tests-prove-behavior): `getOwn` built-in lookup → direct
   access kills 3 tests; `settled` ref removal kills 3 tests; repeatable
   skip-guard removal kills the new template-growth test. Task-review mutations
   (12, 15) were replayed by their reviewers and are on record in
   `.superpowers/sdd/progress.md`.

**Refuted, with reasons:**
1. *DRY: ShowForm/ShowFlow share the compile-memo + settle + neutralization
   pattern.* Deliberate parallelism: different engines (forms vs workflow),
   different generics, different neutralization depth (form-level vs per-step).
   A shared abstraction would couple the two engines inside the agent layer to
   save ~20 lines.
2. *`${type}-${index}` key strategy in `<Parts>` can state-bleed on splice*
   (Task 5 note). Inert: non-tool parts have stateless renderers today; tool
   parts key by `toolCallId`. Tracked in progress notes, not a defect.
3. *ShowForm line 105 (`pending` arm inside catch) is dead.* Deliberately so —
   belt-and-braces against a lenient-compile defect flashing an error view over
   a half-arrived schema; documented in code, unreachable honestly.
4. *Barrels at 0% coverage.* Executed via the surface tests (aliases resolve to
   src); v8 attributes re-export lines to the source modules. No logic.

## The load-dependent flake (Task 13 loose thread)

One unnamed test failed in 2 of ~9 full runs during Task 13 — ONLY under CPU
saturation, never reproduced since. A dedicated read-only hunter agent looped
the suite under load in parallel with this gate; as of the gate's close it had
produced **no report and no reproduction** (`.superpowers/sdd/flake-hunt-report.md`
absent). This gate's own three consecutive full runs were identical and green,
as were all targeted runs. **Recorded honestly as unresolved-unreproduced**: no
fix is fabricated; if it resurfaces, the campaign precedent applies (one prior
"flake" was a real product race — FormProvider's passive-effect reset losing
writes under contention — so diagnose product-first, not test-first).

## Full gate (3× consecutive identical)

| Run | Files | Tests | Result |
|---|---|---|---|
| 1 | 223 passed | 2186 passed, 1 skipped | green |
| 2 | 223 passed | 2186 passed, 1 skipped | green |
| 3 | 223 passed | 2186 passed, 1 skipped | green |

`pnpm type-check` green (all packages). `pnpm build` green. Lint: 10 errors
(≤ the 11-error pre-P3 baseline), none in P3 files.
