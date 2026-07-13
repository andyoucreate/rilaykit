# RilayKit v0.2 — Agentic Engine Design

- **Date**: 2026-07-13
- **Status**: Approved design, pending implementation plan
- **Scope**: Full paradigm evolution of RilayKit into an agentic/generative-UI engine while keeping the form & workflow essence

## 1. Vision & Positioning

RilayKit becomes **the form & workflow engine for agentic apps** — not "yet another generative-UI renderer".

Generative-UI protocols (OpenUI, A2UI, C1) are commoditizing: "component catalog + LLM emits a structure + progressive client rendering" is becoming a protocol, not a product. RilayKit's differentiation is the **runtime**:

1. **RilayKit is a runtime, not a renderer.** Generated UI is *living* UI: Zustand state, Standard Schema validation, `when()` conditions, multi-step navigation, cross-step data.
2. **Validated data collection as the agent contract.** Human-in-the-loop via tool results: the agent only ever receives data validated by the engine.
3. **Tool-call native.** JSON via provider-native tool calling (not a DSL in text output). The return channel (tool results) comes for free.
4. **Headless.** Consumers bring their own design system. RilayKit renders *their* components.
5. **Author ↔ storage ↔ agent continuity.** The same definition format works whether written by a developer, stored in a DB, or emitted by an agent. One runtime for all three origins.

**The engraved boundary: RilayKit renders, it does not converse.** Input: normalized messages/parts (wherever they come from). Output: living UI through the catalog. Chat loop, transport, and thread state belong to the host (AI SDK or any other).

## 2. Decision Log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Agent integration model | **Provider-agnostic**: RilayKit exposes tool definitions + renders tool calls; never talks to an LLM itself. Adapters for specific SDKs. |
| 2 | Generative granularity | **Any registered component** (the catalog), with forms/flows as the premium living primitives. |
| 3 | Message model | **Own minimal part model** (`text`, `tool`, `data`; extensible union), structurally aligned with AI SDK v5 `UIMessage` parts. Thin adapters. Rendering only — no chat SDK features. |
| 4 | Feedback loop | **Tool-result pattern**: form/flow submission resolves the tool call with `{ status: 'submitted', values }` or `{ status: 'cancelled' }`. |
| 5 | Renderer system | **Full removal of renderer config**: no `renderConfig`, no global `configure(renderers)`, no slots provider. Compound headless components + render props; composition lives app-side. |
| 6 | Streaming | **Progressive rendering of partial tool-call JSON** (forms): partial-JSON parsing, per-field progressive mounting. Flows render on complete input. |
| 7 | Component props schema | **`propsSchema` as Standard Schema (zod v4 golden path)**, JSON Schema conversion only in the anthropic adapter (native `z.toJSONSchema()`), manual `propsJsonSchema` fallback. `ComponentBuilderMetadata` layer deleted. |
| 8 | Packaging | **New `@rilaykit/agent` package** (+ subpath adapters `/ai-sdk`, `/anthropic`). Chrome stays in `forms`/`workflow`. `rilaykit` all-in-one re-exports everything. |
| 9 | Versioning | **Breaking assumed, v0.2.0** + `MIGRATION.md`. No compat layer. |
| 10 | Naming | **Compound namespaces** (Radix-style): `Form.*`, `Flow.*`, `<Parts>`. No "Rilay" branding in component names. |
| 11 | Unification | **One catalog**: components, tool renderers, and part renderers are all "renderables" in a single namespaced registry with typed facades. |
| 12 | DX naming system | Short fluent verbs (`.component()/.tool()/.part()`), phrase-reading JSX (`<Form of={...}>`), no bureaucratic suffixes, uniform adapter interface (`toParts`/`tools`), friendly tool states (`streaming/ready/done/error`), intention-oriented LLM tool names (`show_*`). |
| 13 | Component trees | `show_component` input is a **recursive `ComponentNode`** (`{ type, props, children? }`) — generative UI beyond flat components. |
| 14 | Server/client split | **Isomorphic catalog blueprint** (schemas only, no React) + client-side `.renderers()` hydration. Server helpers (`tools()`, `manifest()`) consume the blueprint. |

## 3. Package Architecture

```
@rilaykit/core      → unified catalog (components/tools/parts), conditions, validation,
                      typed errors, <Catalog> context
@rilaykit/forms     → form engine (stores/hooks/providers — untouched) + compound chrome
                      Form.* + FormSchema/compileForm
@rilaykit/workflow  → flow engine (untouched) + compound chrome Flow.* + FlowSchema/compileFlow
@rilaykit/agent     → NEW: part model, <Parts>/<Part>, manifest(), uiTools(),
                      partial-JSON streaming, HITL resolve loop
  ├─ /ai-sdk        → Vercel AI SDK adapter: toParts(), tools() (zod passed through untouched)
  └─ /anthropic     → Claude API adapter: toParts(), tools() (native z.toJSONSchema(),
                      partial_json delta accumulation)
rilaykit            → all-in-one re-export + enhanced ril (.form()/.flow())
```

Dependency direction: `agent → workflow → forms → core`. Adapters live as subpath exports so no SDK dependency is ever forced on consumers.

## 4. The Unified Catalog (core)

The central concept: **everything that renders is a registered "renderable"** — a typed payload + a renderer resolved by a string key. One `Map` with namespaced keys (`component:select`, `tool:search_flights`, `part:text`), one immutable builder, three typed facades. Registration verbs are short: the method name IS the noun (express/hono style).

```typescript
// lib/catalog.ts — ISOMORPHIC blueprint (importable server AND client, no React imports)
export const catalog = ril.create()
  .component("select", {
    description: "Dropdown selection with predefined options", // read by the LLM
    propsSchema: z.object({
      label: z.string().describe("Visible field label"),
      options: z.array(z.object({ value: z.string(), label: z.string() })),
      placeholder: z.string().optional(),
    }),
    defaultProps: { placeholder: "Select..." },
    validation: { validate: z.string().optional() }, // value validation, unchanged
    meta: {}, // open, typed via generic — display config, icons, anything app-level
  })
  .tool("search_flights", {
    inputSchema: z.object({ from: z.string(), to: z.string() }),
  })
  .use(uiTools()); // show_form / show_flow / show_component — pure schemas, no React
```

```tsx
// lib/catalog.client.tsx — "use client": attaches renderers, typed against registered keys
export const r = catalog.renderers({
  components: { select: SelectField },
  tools: {
    search_flights: ({ input, state, output }) =>
      state === "done" ? <FlightResults flights={output} /> : <FlightsSkeleton input={input} />,
  },
  parts: { text: ({ part }) => <Markdown>{part.text}</Markdown> },
});
```

Inline `renderer:` inside `.component()/.tool()/.part()` remains allowed — the blueprint/hydration split is only mandatory when a server imports the catalog (RSC/Next route handlers).

### Renderer contexts (strictly typed, no any-bags)

- **Component**: `{ id, props, field: { value, onChange, onBlur, error, disabled, isValidating }, conditions, children?, meta }` — `props` inferred from `propsSchema`; `children` present when rendered from a `ComponentNode` tree (already-rendered ReactNode). The `[key: string]: any` escape hatch is removed.
- **Tool**: `{ toolCallId, name, state, input, rawInput?, output?, errorText?, resolve, meta }` — states: `streaming | ready | done | error` (adapter-mapped from AI SDK's `input-streaming | input-available | output-available | output-error`). During `streaming`, `input` is a deep-partial parsed object; `rawInput` carries the raw partial JSON for advanced renderers.
- **Part**: `{ part, meta }`.

### Rules

- Registration is immutable (returns a new `ril` instance), consistent with the existing builder.
- Duplicate key registration throws a typed `DuplicateError` unless `replace: true` is set in the entry config (whole-entry swap). Attaching/overriding **renderers** always goes through `.renderers()` (or inline `renderer:` at registration) — one way to do it.
- A tool registered without `inputSchema` is **renderer-only**: it renders a host-executed tool but is excluded from generated tool definitions.
- Every entry has **two projections**: schema → LLM (tool definitions, `manifest()`), renderer → React. Registering means simultaneously *exposing to the agent* and *knowing how to render*.
- `<Catalog value={r}>` (React context in core) makes the catalog available to `<Parts>`/`<Part>`. `Form`/`Flow` keep receiving it embedded in their config (via builders) — the provider is an override, not a requirement, for them.

### Deletions (the de-renderer-ification)

- `renderConfig` on form/workflow configs, `.configure({ ...renderers })`, `FormRenderConfig`, `WorkflowRenderConfig`.
- The hardcoded form/workflow renderer-key auto-classification and the triplicated renderer lists in `ril.ts` (configure keys / validate keys / stats).
- `ComponentRendererWrapper` and `resolveRendererChildren`.
- `ComponentBuilderMetadata`, `PropertyEditorDefinition`, `FieldSchemaDefinition` (the dormant visual-builder layer) — superseded by `propsSchema`.
- The unused `*V2` render-prop types in `core/src/types/context.ts`.
- The `useFieldRenderer` flag on `ComponentConfig`.
- `getStats().hasCustomRenderers` and related renderer statistics.

## 5. Headless Chrome: Compound Components + Render Props

Composition lives **app-side**. Every rendering path — including the generative one — has a dev-written composition point (the page for a classic form; the `show_form` renderer for a generated one). Therefore no global layout config is needed anywhere.

```tsx
// 1. RilayKit utils = logic + state + wiring, ZERO imposed markup
<Form of={loginForm} defaults={{ email: "" }} onSubmit={handle}>
  <Form.Body>
    {({ rows }) => rows.map(row => (
      <div key={row.id} className="grid grid-cols-2 gap-4">
        {row.fields.map(f => <Form.Field key={f.id} id={f.id} />)}
      </div>
    ))}
  </Form.Body>
  <Form.Submit>
    {({ submitting }) => <Button loading={submitting}>Send</Button>}
  </Form.Submit>
</Form>

// 2. "Theme once" = a component the APP writes and reuses
function AppFormBody() {
  return <Form.Body>{({ rows }) => /* app markup, once */}</Form.Body>;
}

// 3. The generative path uses THE SAME utils, via .renderers()
catalog.renderers({
  tools: {
    show_form: ({ input, resolve }) => (
      <Form of={compileForm(input, r)} onSubmit={v => resolve({ status: "submitted", values: v })}>
        <AppFormBody />
        <Form.Submit>{({ submitting }) => <Button loading={submitting}>Validate</Button>}</Form.Submit>
      </Form>
    ),
  },
});
```

### Component inventory

- **forms**: `Form` (root; props `of`, `defaults`, `onSubmit`), `Form.Body` (render prop `{ rows }` — visible rows with conditions applied), `Form.Field` (props `id`/`config`/`overrides`; the single bridge to the catalog: resolves `component:*`, wires state/validation/conditions), `Form.Submit` (render prop `{ submitting }`), `Form.List` (repeatables; render prop `{ items, add, remove }`). Hooks: `useForm()` (renamed `useFormConfigContext` — the exact mirror of `useFlow()`), `useFormRows()`, plus the whole existing `useField*`/`useForm*` selector inventory (unchanged — already coherent).
- **workflow**: `Flow` (root; props `of`, `defaults`, `onComplete`), `Flow.Body` (current step's form body; render prop), `Flow.Progress` (render prop `{ steps, currentIndex, goTo }` — visible steps with index mapping), `Flow.Back` / `Flow.Next` / `Flow.Skip` (render props receiving full step context: `{ canGo, submitting, isLastStep, step }`). Hooks: `useFlow()` (ex-`useWorkflowContext`), `useFlowData()` (ex-`useWorkflowAllData`), `useStep()` (current step + metadata), `useFlowSteps()`; remaining flow store selectors renamed to the `useFlow*` family.
- Without a render prop, `Form.Body` / `Flow.*` render bare structural divs (30-second quick start), no classes, no styling opinions — but a coherent **data-attribute system** ships as the styling hook: `data-form-body`, `data-form-row`, `data-form-submit`, `data-form-list(-item/-add)`, `data-field-*` state attrs, `data-flow-progress`, `data-flow-nav="next|back|skip"`. Apps style bare defaults with plain CSS selectors, no wrappers needed.
- The three flow nav buttons share one internal parametric implementation.

### Engine sanctity

`FormProvider`/`WorkflowProvider` logic, Zustand stores, condition evaluation, validation pipeline, submission lifecycle, persistence, analytics, monitoring, effects: **untouched**. Only the presentation shell changes. `WorkflowBody`'s internal field-rendering path (the load-bearing component for real consumers) is preserved as `Flow.Body`.

### Real-world pain points fixed in passing (from lilycare audit)

- `allowSkip: boolean | ((ctx: { allData }) => boolean)` — dynamic skippability becomes first-class.
- Nav render props receive full step context — kills the `metadata.hideNextButton` / `metadata.submitLabel` / `metadata.skipVisible` smuggling pattern.
- `propsSchema` typing separates renderer props from DOM props — kills manual prop-stripping in renderers.

## 6. Schema Layer: JSON as the Pivot Format

- **`FormSchema`** (exists): JSON-serializable form definition. Compiler renamed **`compileForm(schema, catalog, { bindings })`** — "compile" tells the true story (JSON → living runtime). Evolutions: per-field inline `default` (streaming-friendly ordering), strict typing against the catalog.
- **`FlowSchema` + `compileFlow`** (new): the workflow mirror. `{ version, id, name, steps: [{ id, title, form: FormSchema, conditions?, allowSkip?, metadata? }] }`. Non-serializable logic (lifecycle handlers like `onAfterValidation`) referenced **by string key** and resolved from consumer-supplied **`bindings`** (ex-`SchemaRegistry` — renamed: they are the bindings between JSON string keys and living code; also avoids collision with the catalog registry).
- **Field → component resolution**: a schema field's `type` IS the catalog key. `compileForm` validates each field's `props` against that component's `propsSchema`, then `Form.Field` renders it with the wired `field` context. Same mechanic for `ComponentNode` trees (§7).
- **Typed dynamic building — first-class requirement.** Both known consumers (lilycare `subscription-flow.tsx`, stndrds `form-config.ts` / `use-form-config.ts` / `attribute-field.tsx`) hand-rolled JSON→rilay compilers and cast to `any` at every dynamic build site. The builder and `compileForm`/`compileFlow` must accept runtime-constructed field-config arrays **fully typed against the catalog's component-type union** (`FieldConfigFor<C>`). Killing this `any` gap is a P1/P2 acceptance criterion.
- **Not building**: the reverse serializer (config → JSON). No identified consumer; authored forms may embed live zod validators that cannot serialize. YAGNI.

## 7. The Agent Layer (`@rilaykit/agent`)

### Part model

Own discriminated union, minimal and extensible. `Part` is both the type and the unit component — one concept, one word:

```typescript
type Part =
  | { type: "text"; text: string; state?: "streaming" | "done" }
  | { type: "tool"; toolCallId: string; name: string;
      state: "streaming" | "ready" | "done" | "error";
      input: unknown; rawInput?: string; output?: unknown; errorText?: string }
  | { type: "data"; name: string; data: unknown };
```

Structurally aligned with AI SDK v5 parts so the adapter is near-identity (state mapping: `input-streaming→streaming`, `input-available→ready`, `output-available→done`, `output-error→error`). `reasoning`, `source`, `file` parts: deferred (extensible union).

### Dispatch components

`<Parts parts={Part[]} onResolve={(toolCallId, output) => void} />` and granular `<Part part={} />`. Resolution: `part:*` and `tool:*` catalog namespaces via `<Catalog value={r}>` context (or explicit prop). `onResolve` is the exact mirror of the `resolve()` the tool renderer receives. Unknown tool names fall back to a humanized default or a consumer-provided fallback renderer. **Built-in fallback renderers for `show_form` / `show_flow` / `show_component` live in `<Parts>`** — bare but functional out of the box; apps override via `.renderers()`.

### `uiTools()` plugin (isomorphic — pure schemas)

Registers the premium tools; renderers come from `<Parts>` fallbacks or `.renderers()`:

- `show_form` — input schema: the static JSON Schema of `FormSchema`.
- `show_flow` — input schema: `FlowSchema`. Renders on complete input (no progressive multi-step mounting).
- `show_component` — input schema: **recursive `ComponentNode`** — `{ type, props, children?: ComponentNode[] }` where `type` is constrained to the catalog's component union. The default renderer resolves the tree recursively; each node's `props` are validated against its component's `propsSchema`; renderers receive already-rendered `children` (ReactNode) and place or ignore them. A failing node produces a structured error part, never a render crash.

LLM-facing tool names use intention verbs (`show_*`, not `render_*`): the agent *shows* something to the human — proven to steer models better (cf. stndrds `ask_questions`).

### Server-side generation (the isomorphic loop)

```typescript
// app/api/chat/route.ts — the server only sees the blueprint
import { catalog } from "@/lib/catalog";
import { manifest } from "@rilaykit/agent";
import { tools } from "@rilaykit/agent/ai-sdk";

return streamText({
  model: anthropic("claude-sonnet-5"),
  system: `You are a booking assistant.\n${manifest(catalog)}`,
  tools: { ...tools(catalog), ...myServerTools },
  messages: convertToModelMessages(messages),
}).toUIMessageStreamResponse();
```

- **`tools(catalog)`** (per adapter): AI SDK flavor passes zod schemas through untouched and emits UI tools **without `execute`** (the SDK's native HITL pattern: stream stays pending → client renders → `addToolResult` resumes). Anthropic flavor emits `{ name, description, input_schema }` via native `z.toJSONSchema()` (manual `inputJsonSchema`/`propsJsonSchema` fallback for non-zod Standard Schemas).
- **`manifest(catalog)`** (provider-neutral, main package): generates the compact catalog description for system prompts from `description`s + schemas — which components exist, their props, when to use `show_form` vs `show_component`. This is how the model learns the patterns it may emit.
- Adapters export a **uniform pair**: `toParts(message)` + `tools(catalog)`. The module name carries the context (`@rilaykit/agent/ai-sdk`, `@rilaykit/agent/anthropic`).

```tsx
// Client side — the loop closes
const { messages, addToolResult } = useChat();
<Catalog value={r}>
  {messages.map(m => (
    <Parts key={m.id} parts={toParts(m)}
      onResolve={(toolCallId, output) => addToolResult({ toolCallId, output })} />
  ))}
</Catalog>
```

### Streaming: progressive form rendering

- Internal partial-JSON parser (fixJson-style, ~100 lines, no dependency) used by adapters that only provide raw deltas.
- `compileForm` lenient mode during `streaming`: a field mounts as soon as its definition is complete (`id` + `type` + parseable props); reconciliation by stable field `id`; append-only; store registers fields incrementally **without reset**; mounted fields are immediately interactive; **submit stays locked** until the schema is complete and validated.
- Flows: render at `ready` (deliberate scope cut).

### Human-in-the-loop

- The tool renderer receives `resolve(output)`. Payload convention for UI tools: `{ status: "submitted", values }` | `{ status: "cancelled" }`. Cancellation is part of the contract from day one.
- Reference pattern (proven in production in stndrds `ask_questions`): tool declared without `execute` → stream stays pending → UI renders from input → `resolve` → host's `addToolResult`/`tool_result` → agent resumes.
- The agent only receives engine-validated values.

### Agent self-correction

Invalid agent emissions (props failing `propsSchema`, malformed `FormSchema`, bad `ComponentNode`) never crash rendering: they produce an `error`-state tool result carrying structured `{ error, issues, expectedKeys }` (format proven in stndrds `wrappers.ts`) so the model can retry.

## 8. Error Handling

Small typed error hierarchy in core — no more bare `throw new Error`:

```typescript
class RilayError extends Error { code: RilayErrorCode }
// codes: DUPLICATE | NOT_FOUND | INVALID_SCHEMA | VALIDATION | CONFIGURATION
```

Used by: catalog registration (DUPLICATE, NOT_FOUND), schema compilation (INVALID_SCHEMA with structured issues), agent emission validation (VALIDATION). Renderer-level failures surface as `error`-state parts, never exceptions during render.

## 9. Testing Strategy

- **Test-first (TDD) for every task**: red → implement → green. A test that was never red proves nothing.
- Exact assertions (`toBe('exact')`, never `toBeDefined()`/`not.toThrow()` where an exact assertion is possible). Error paths are first-class tests.
- **Real code paths**: chrome components tested with real Zustand stores and real catalog instances — never `vi.mock("rilaykit")`. (stndrds mocks rilaykit in its UI tests; that setup cost is a symptom this design removes.)
- Key suites: catalog unit (namespacing, immutability, replace, duplicate errors, typed contexts, `.renderers()` hydration), chrome integration (render-prop contracts, bare defaults, conditions/visibility), schema round-trip (`compileForm`/`compileFlow` valid + invalid + lenient partial), `ComponentNode` tree recursion (+ failing-node isolation), streaming simulation (feed partial-JSON chunks, assert progressive mounts and submit lock), HITL integration (resolve → payload convention), adapter mapping tests (`toParts` state mapping, `tools` HITL emission), `manifest()` snapshot against a reference catalog.
- Existing test conventions apply: `.tsx` for JSX tests, explicit vitest aliases, StoreInspector non-reactivity caveats.

## 10. Breaking Changes & Migration (v0.2.0)

Breaking, no compat layer (pre-release, consumers audited):

| Before | After |
|--------|-------|
| `.addComponent(type, cfg)` | `.component(type, cfg)` |
| `.configure({ rowRenderer, bodyRenderer, ... })` | Deleted — compose with `Form.Body`/`Flow.*` render props in app components; renderers attach via `.renderers()` or inline `renderer:` |
| `<Workflow>`, `<WorkflowBody>`, `<WorkflowStepper>`, `<WorkflowNextButton>`, `<WorkflowPreviousButton>`, `<WorkflowSkipButton>` | `<Flow>`, `<Flow.Body>`, `<Flow.Progress>`, `<Flow.Next>`, `<Flow.Back>`, `<Flow.Skip>` |
| `<Form>`, `<FormBody>`, `<FormRow>`, `<FormField>`, `<FormSubmitButton>`, `<RepeatableField>` | `<Form>`, `<Form.Body>`, `<Form.Field>`, `<Form.Submit>`, `<Form.List>` (row markup is app-side) |
| `formConfig={...}` / `workflowConfig={...}` props | `of={...}`; `defaultValues` → `defaults` |
| `useWorkflowContext` / `useWorkflowAllData` / step selectors | `useFlow()` / `useFlowData()` / `useStep()` / `useFlowSteps()` (full `useFlow*` family) |
| `useFormConfigContext` | `useForm()` |
| `<FormField fieldId customProps>` | `<Form.Field id overrides>` |
| `ComponentRenderProps` any-bag | Typed component context (props inferred from `propsSchema`) |
| Renderer-prop types (`FieldRendererProps`, `FormBodyRendererProps`, ...) | Render-prop context types exported from the same packages (stable import paths — consumers type their app components against these) |
| `ComponentBuilderMetadata` / `builder` field | `propsSchema` + `meta` |
| `fromSchema(schema, ril, registry)` | `compileForm(schema, catalog, { bindings })` |
| `metadata.hideNextButton` / `skipVisible` smuggling | First-class render-prop context + `allowSkip` predicate |

`MIGRATION.md` ships with the release, written against the audited usage profiles of lilycare (~1 renderer file + ~25 imports, mechanical) and stndrds (`standard-rilay.tsx` + form-flow compiler). Migrating those apps is out of scope for this repo.

## 11. Delivery Phases

Each phase gets its own implementation plan and is independently shippable. Per-task checker panel (tests-prove-behavior / DRY / elegance / conventions) applies throughout.

- **P1 — De-renderer-ification (breaking)**: unified namespaced catalog with fluent facades (`.component()/.tool()/.part()/.use()/.renderers()`) + `propsSchema` + `meta` + typed errors; delete renderConfig/wrapper/metadata/V2 layers; rewrite chrome as compound headless (`Form.*`, `Flow.*` with `of`/`defaults`, hooks renames); `MIGRATION.md`.
- **P2 — Schema layer**: `FlowSchema` + `compileFlow`; `compileForm` rename + streaming-friendly evolutions + `bindings`; fully-typed dynamic building (kill the `any` gap).
- **P3 — `@rilaykit/agent`**: part model + `<Parts>`/`<Part>` + `<Catalog>` wiring + built-in `show_*` fallbacks; `manifest()`; `uiTools()` with `ComponentNode` trees; partial-JSON parser + progressive form mounting; HITL resolve loop + structured self-correction errors; `/ai-sdk` and `/anthropic` adapters (`toParts` + `tools`).

## 12. Out of Scope (deferred)

- Reverse serializer (config → JSON).
- `reasoning` / `source` / `file` parts (union stays extensible).
- Progressive multi-step mounting for generated flows.
- MCP / LangChain adapters; OpenUI / A2UI interop adapters.
- Visual builder.
- Any change to persistence, analytics, monitoring, effects engines.
- Message-thread features (grouping consecutive tool parts, scroll, composer): host concerns.

## 13. Constraints from Real Consumers (audit summary)

- **lilycare** (`apps/web`, rilaykit 0.1.1): only the Workflow family is mounted; all 8 renderers overridden; heavy `when()` conditions + mixed zod/built-in validation; `onAfterValidation` + `setStepFields` cross-step propagation; a hand-rolled DB-JSON→rilay compiler for the subscription flow (the strongest signal for the JSON pivot); pain points fixed by this design (metadata smuggling, static `allowSkip`, any-casts, prop stripping). `WorkflowBody`'s field-rendering path is load-bearing → preserved as `Flow.Body`.
- **stndrds** (`packages/ui`, rilaykit 0.1.6): 17-component catalog + `.clone().configure()` variants; schema-attribute→rilay compiler with `any` casts at every dynamic site; production HITL loop (`ask_questions` → `AgentQuestions` → `addToolOutput`) that this design generalizes; streaming part model with `partialInput` carriage; two frontend registries (`ContentPartRegistry`, `ToolDisplayRegistry` with displayMode/labels/icons/`.extend()`) that the unified catalog + `meta` replaces; structured `{ error, issues, expectedKeys }` self-correction format adopted; zod→JSON-Schema delegated (AI SDK pass-through / native `z.toJSONSchema()`), no custom converter.

## 14. Implementation Conventions (injected into every task)

**Universal**
- DRY: 3+ similar blocks → extract a helper. Reuse existing modules before writing new ones (the schema pipeline builds through the existing builder — keep that property).
- Elegant: simplicity over cleverness; YAGNI ruthlessly; smallest design that works.
- Typed errors: never `throw new Error(...)` — use the `RilayError` hierarchy (§8).
- No `console.*` — use the existing monitoring/adapter layer where logging is needed.
- TypeScript: `function` for declarations, arrows for callbacks; strict; `unknown` over `any`. Killing `any` is a design goal of this project — do not reintroduce it.
- Conventional commits (`feat(scope):`, `fix:`, `refactor:`, `chore:`).

**React**
- One component per file. Derived state + event handlers over `useEffect`.
- Render props / compound components per §5 — no new renderer-config indirections.
- No inline styles in library defaults; bare structural markup only.

**Packages**
- Dependency direction: `agent → workflow → forms → core`. Core never imports from the others.
- Explicit filenames (`partial-json.ts`, `manifest.ts`), no generic `utils.ts` dumping grounds.
- Adapters only under subpath exports; no SDK dependency in main entries.

**Tests (load-bearing)**
- Test-first; watch it fail for the right reason; then implement.
- Prove behavior with exact assertions; test error paths explicitly; real stores and real catalog instances — never mock the unit under test.
- Quality over quantity.
