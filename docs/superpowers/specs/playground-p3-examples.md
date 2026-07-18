# Spec — Playground examples for the P3 work

## Goal
Add four playground example pages that let a developer test, in a real browser, the
work shipped in P3. Chosen with Karl: (1) an **agent-layer demo** (the biggest gap —
`@rilaykit/agent` has zero playground coverage), (2) a **global-watch effect fan-out**,
(3) a **manifest / system-prompt** viewer, (4) a **special-value persistence** workflow.

## Resolved decisions
- **Simulated assistant, not a real LLM.** The agent demo drives a hand-authored
  `Part[]` transcript through `<Parts>`/`<Catalog>` with the REAL HITL resolve loop.
  No API key, deterministic, works for any developer. (A real-LLM path was rejected:
  non-deterministic, needs a key, can't be set up here.)
- All four pages ship.

## Grounding facts (from source, not assumed)
- `ril` is **immutable** (`cloneWith`): `r.use(uiTools()).part('text', …)` returns a
  new catalog; the shared `r` in `@/lib/ril-config` is not mutated. Safe to derive
  per-page catalogs from `r`.
- `<Parts parts onResolve? catalog? fallback?>` (`packages/agent/src/react/Parts.tsx`).
  HITL: submitting a rendered `show_form` fires `onResolve(toolCallId, { status:'submitted', values }, 'show_form')`; cancel → `{ status:'cancelled' }`.
- `Part` = `TextPart {type:'text',text,state?}` | `ToolPart {type:'tool',toolCallId,name,state,input,output?,errorText?}` | `DataPart`. States: `streaming|ready|done|error`.
- `uiTools()` registers `show_form`/`show_flow`/`show_component` (schema-only). `manifest(catalog)` → markdown string.
- `show_form` input is `{ schema: { id, fields: [{ id, type, props, validation? }] } }`.
- The shared `r` registers components only — NO `.part('text', …)` renderer, so a bare
  text part renders `null` until the page's catalog adds one.
- Imports after the split: `ril, uiTools, manifest`, the `Part` type ← `rilaykit`;
  `Catalog, Parts, Form, FormBody, Flow`, hooks ← `rilaykit/react`.
- Page wiring: a `<Route>` in `apps/playground/src/app.tsx` + a `DEMOS` entry in
  `apps/playground/src/pages/home.tsx` (its `category` union must widen to include `'Agent'`).

## Components / DRY
- Pages 1 and 3 both need "the shared catalog + uiTools (+ a text-part renderer)".
  Extract ONE `agentCatalog` into `@/lib/agent-catalog.ts` (derived from `r`), reused by
  both — do not build it twice.
- Reuse existing chrome: `PageHeader`, `Card`/`CardHeader`/`CardTitle`/`CardContent`,
  `Button`. No new shell component (there isn't one; pages inline the `max-w-*` wrapper).
- The agent demo's turn progression is real logic → extract a **pure** reducer
  `advanceTranscript(transcript, toolCallId, output)` into a testable module, not inline
  in the component. This is the unit that gets a test-first behavioral test.

## The four pages
1. **`/agent/assistant`** — simulated assistant. State = `Part[]` transcript, seeded with
   a text part + a `show_form` tool part. On resolve: mark the tool part `done` with its
   output and append the agent's scripted next turn (a confirmation text + optional
   `show_component`). "Reset" replays. Rendered via `<Catalog value={agentCatalog}><Parts…/></Catalog>`.
2. **`/forms/invoice-fanout`** — global `taxRate` + repeatable `lines` (description, price,
   total). Each `total` has `onChange('taxRate', …)` computing `price × (1 + taxRate)`;
   changing the global recomputes every row (the #0c3af68 fan-out).
3. **`/agent/manifest`** — render `manifest(agentCatalog)` in a `<pre>` beside the emitted
   tool names. Shows exactly what the model's system prompt receives.
4. **`/workflows/special-values`** — a one-step workflow with a date field (and a numeric
   field), persisted via `LocalStorageAdapter`; a "reload" remount restores the values
   intact (Date stays a Date, not an ISO string — the 2a90203 serialization fix).

## Implementation conventions (Karl's code DNA — this work touches)
- **DRY**: the agent catalog is built ONCE (`@/lib/agent-catalog.ts`) and reused by pages
  1 & 3. No copy-pasted `r.use(uiTools())` per page.
- **Elegant / YAGNI**: smallest demo that shows the feature. The assistant "script" is 2–3
  turns, not a framework. No real-LLM plumbing.
- **React**: one component per file. **Derived state + event handlers over `useEffect`** —
  the transcript is `useState`, advanced in the resolve handler; do not sync it via effects.
  No inline styles, no hard-coded colors → Tailwind tokens / existing `ui/` primitives.
  Ref-as-prop, not `forwardRef`.
- **No `console.*`** in page code.
- **Tests that PROVE behavior (load-bearing)**: `advanceTranscript` is written **test-first**
  — a red test asserting the exact next transcript (tool part flips to `done` with the
  submitted output, the scripted follow-up is appended, an unknown `toolCallId` is a no-op),
  then the implementation. Exact assertions (`toEqual` the resulting parts), not
  `toBeDefined()`. The page renders it; the reducer is unit-proven.
- **Commits**: `feat(playground): …` / `chore(playground): …`.
