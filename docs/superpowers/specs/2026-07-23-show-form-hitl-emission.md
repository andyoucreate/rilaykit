# Spec — `show_form`/`show_flow` HITL emission fix (issue #23)

## Problem

`uiTools()` declares the `show_form` / `show_flow` tool's `schema` argument as
`z.unknown()`. That projects to an **unconstrained `{}`** (no `type`) in the JSON
Schema handed to the model. With no type guidance, Anthropic models serialize the
nested `FormSchema` / `FlowSchema` as **stringified JSON** rather than a nested
object.

`ShowForm` → `compileForm(schema)` then throws `SchemaValidationError`
("Form schema must be an object"), delivers `{ status: 'error' }` upstream, the
tool part settles, and `<Part>` falls through to `DefaultTool` — the HITL form
**silently never appears**, and the transcript prints the literal tool name
("Show form").

Confirmed live at `packages/agent/src/tools/ui-tools.ts:20-22` (and `:27-29`).

## Root cause

`z.unknown()` → `{}`. The `.describe()` says "object" in prose but nothing in the
*schema* constrains it. The model is free to — and does — stringify.

## Design

Three layers. The first removes the incentive; the second survives the exception;
the third makes the settled state explicit instead of a surprising fallthrough.

### Key infrastructure fact (drives the whole design)

The emission/validation split the issue asks for is **already supported**:
`emittableToolSchema()` (manifest.ts) returns `inputJsonSchema` when present, else
projects `inputSchema`; both adapters emit that, but always **validate** against
`inputSchema` (the zod). So the *emitted* schema and the *runtime-validation*
schema are already independent knobs. `FormSchema`/`FlowSchema` are **TS
interfaces, not zod** — there is nothing to reuse for a strict runtime schema, and
`compileForm`/`compileFlow` already own the real validation + the retry channel.
Therefore the runtime `inputSchema` stays permissive (`z.unknown()`) and only the
emitted `inputJsonSchema` changes.

### Fix 1 — Prevention: an honest zod `schema` shape (both adapters, no adapter change)

**Discovery that reshaped this fix:** the Anthropic adapter *deliberately* prefers
the native `z.toJSONSchema(inputSchema)` projection over a manual `inputJsonSchema`
when both are present (spec §13; pinned by `adapter.test.ts:71`). The AI-SDK
adapter, via `emittableToolSchema`, lets `inputJsonSchema` win. So an
`inputJsonSchema` override fixes the AI-SDK path but **not** Anthropic — and
reversing the Anthropic precedence would break a documented, tested decision.

Root cause is simpler than "the emitted schema needs an override": `z.unknown()`
is the **wrong zod type**. Replace it with a light structural, permissive zod
object. Its native projection is object-typed and **identical on both adapter
paths** (verified: `z.toJSONSchema` and `~standard.jsonSchema.output` both emit
`{ type:'object', properties:{ id, fields }, additionalProperties:{} }`). No
adapter change, no `inputJsonSchema`, spec §13 untouched.

- `show_form`: `schema: z.looseObject({ id: z.string().optional(), fields: z.array(z.unknown()).optional() }).describe('A FormSchema: …')`
- `show_flow`: `schema: z.looseObject({ id: z.string().optional(), name: z.string().optional(), steps: z.array(z.unknown()).optional() }).describe('A FlowSchema: …')`

`.looseObject` (allow-extra-keys) + all-optional keeps validation **permissive**:
every valid `FormSchema`/`FlowSchema` (version, rows, nested fields, …) passes, and
a schema missing `id` passes too — `compileForm`/`compileFlow` still own the real
validation and the retry channel. `id` stays **optional** (nested `required: []`)
on purpose: forcing it would reject a missing-`id` schema at the zod layer *before*
compileForm can produce its rich error. The only input the zod now rejects is a
**stringified** schema — exactly the bug case.

The `z.object({ schema: … })` envelope is trivial and lives inline in each tool —
no helper (YAGNI; it is not 3+ blocks of real logic).

### Fix 2 — Defense-in-depth: agent-layer schema coercion

A pure, isomorphic helper `coerceEmittedSchema(raw: unknown): unknown`:
`typeof raw === 'string'` → `JSON.parse` (on failure, return the string so
`compileForm` still produces its proper `SchemaValidationError`); otherwise return
`raw` untouched. Lives in the **agent** package (`streaming/`) — a stringified
emission is a *model* quirk, not a `@rilaykit/forms` concern; `compileForm`'s
contract stays clean.

Applied at the compile seam of both `ShowForm` and `ShowFlow` (one helper, two
call sites). A stringified partial during streaming won't `JSON.parse` → falls
through to "no stable identity" → renders nothing until `ready`, where the
complete string parses and the form renders (non-progressive, acceptable
degradation for the fallback path).

### Fix 3 — Explicit settled rendering (`SettledToolResult`)

At `done`/`error`, `show_form` and `show_flow` no longer fall through to
`DefaultTool` (which prints "Show form"). They render a dedicated, explicitly
defined `SettledToolResult`:

- `{ status: 'submitted', values }` → read-only summary of the submitted values
  (a `<dl>` of key → value).
- `{ status: 'cancelled' }` → a "cancelled" marker.
- `error` state / `{ status: 'error' }` → a compact error marker (uses
  `errorText` when present).

One component shared by both tools (their resolve payloads are identical), bare
structural markup with `data-*` hooks, **no styles / no hard-coded colors** — the
house convention for built-in fallbacks (apps override via `.renderers()`).

## Components / duplication risk

- `coerceEmittedSchema()` (new, streaming) — one helper, called by `ShowForm` and
  `ShowFlow`; avoids inlining the same string-parse twice.
- `SettledToolResult` (new, react/fallbacks) — **one** settled renderer for both
  interactive tools instead of a per-tool duplicate.

## Out of scope

- Progressive (streaming) rendering of a *stringified* schema — impossible to
  partially parse a partial string; degrades to render-at-`ready`.
- A strict zod `FormSchema`/`FlowSchema` runtime schema — `compileForm` owns this.

## Test plan (test-first, behavior-proving)

**Fix 1** (`ui-tools.test.ts`, adapters):
- `emittableToolSchema(show_form).properties.schema.type === 'object'` (was
  absent). Same for `show_flow`.
- `isEmittableTool` still `true` for both.
- Runtime `inputSchema` accepts a full `FormSchema`/`FlowSchema` (permissive) AND a
  schema missing `id` (compileForm owns that); rejects a stringified schema.
- **Both** adapters (`anthropic` `tools()` + `ai-sdk` `tools()`) emit
  `schema.type === 'object'` for both tools — proving the fix works on Anthropic,
  not just AI-SDK.

**Fix 2** (`coerce-emitted-schema.test.ts`, `ShowForm`):
- `coerceEmittedSchema('{"id":"f","fields":[]}')` → `{ id:'f', fields:[] }`.
- `coerceEmittedSchema({ id:'f' })` → same object (passthrough).
- `coerceEmittedSchema('not json')` → `'not json'` (passthrough on failure).
- **Regression**: `ShowForm` at `ready` with a **stringified** schema renders the
  real form field (not an `EmissionErrorView`). This is the bug, proven fixed.

**Fix 3** (`SettledToolResult.test.tsx`, `Part` dispatch):
- `show_form` at `done`, `{ status:'submitted', values:{ email:'a@b.c' } }` →
  renders `a@b.c`, and **does not** render "Show form".
- at `error` → renders an error marker, not "Show form".
- `{ status:'cancelled' }` → renders a cancelled marker.

## Implementation conventions (Code DNA — injected into every task)

- **DRY**: extract `wrapSchemaArg`, `coerceEmittedSchema`, and a single
  `SettledToolResult` rather than duplicating envelopes/parse/settled markup.
- **Elegant / YAGNI**: light structural hint, not a full schema mirror; one
  settled component, not two; no streaming-stringified support.
- **Typed errors**: never `throw new Error`. `SchemaValidationError` is the only
  caught contract at the compile seam (unchanged).
- **No `console.*`**: none introduced.
- **TypeScript**: `function` declarations, arrows for callbacks, strict,
  `unknown` over `any`. `coerceEmittedSchema(raw: unknown): unknown`.
- **React**: one component per file (`SettledToolResult.tsx`); derived state +
  event handlers, no `useEffect` for derived state; no inline styles, no
  hard-coded colors — `data-*` hooks only, matching `EmissionErrorView`/
  `DefaultTool`.
- **Explicit filenames**: `coerce-emitted-schema.ts`, `SettledToolResult.tsx`.
- **Tests**: test-first, red → green; assert exact output (`toBe`, text present
  AND "Show form" absent); cover error/cancelled paths; hit real render paths (no
  mocking the unit under test).
- **Commit**: `fix(agent): …` conventional.
