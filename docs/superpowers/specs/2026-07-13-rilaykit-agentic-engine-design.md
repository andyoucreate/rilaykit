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
| 5 | Renderer system | **Catalog / UI separation, then full removal of renderer config**: no `renderConfig`, no global `configure(renderers)`, no slots provider. Compound headless components + render props; composition lives app-side. |
| 6 | Streaming | **Progressive rendering of partial tool-call JSON** (forms): partial-JSON parsing, per-field progressive mounting. Flows render on complete input. |
| 7 | Component props schema | **`propsSchema` as Standard Schema (zod v4 golden path)**, JSON Schema conversion only where needed (anthropic adapter, native `z.toJSONSchema()`), manual `propsJsonSchema` fallback. `ComponentBuilderMetadata` layer deleted. |
| 8 | Packaging | **New `@rilaykit/agent` package** (+ subpath adapters `/ai-sdk`, `/anthropic`). Chrome stays in `forms`/`workflow`. `rilaykit` all-in-one re-exports everything. |
| 9 | Versioning | **Breaking assumed, v0.2.0** + `MIGRATION.md`. No compat layer. |
| 10 | Naming | **Compound namespaces** (Radix-style): `Form.*`, `Flow.*`, `<Parts>`. No "Rilay" branding in component names. `Flow` replaces `Workflow`, `Flow.Progress` replaces Stepper, `Flow.Back` replaces PreviousButton. |
| 11 | Unification | **One catalog**: components, tool renderers, and part renderers are all "renderables" in a single namespaced registry with typed facades. |

## 3. Package Architecture

```
@rilaykit/core      → unified catalog (components/tools/parts), conditions, validation,
                      typed errors, CatalogProvider
@rilaykit/forms     → form engine (stores/hooks/providers — untouched) + compound chrome
                      Form.* + FormSchema/fromSchema
@rilaykit/workflow  → flow engine (untouched) + compound chrome Flow.* + FlowSchema/flowFromSchema
@rilaykit/agent     → NEW: part model, <Parts>/<Part>, tool definition generation, uiTools(),
                      partial-JSON streaming, HITL resolve loop
  ├─ /ai-sdk        → Vercel AI SDK adapter (zod schemas passed through untouched,
                      resolve → addToolResult)
  └─ /anthropic     → Claude API adapter (z.toJSONSchema() conversion,
                      partial_json delta accumulation)
rilaykit            → all-in-one re-export + enhanced ril (.form()/.flow())
```

Dependency direction: `agent → workflow → forms → core`. Adapters live as subpath exports so no SDK dependency is ever forced on consumers.

## 4. The Unified Catalog (core)

The central concept: **everything that renders is a registered "renderable"** — a typed payload + a renderer resolved by a string key. One `Map` with namespaced keys (`component:select`, `tool:search_flights`, `part:text`), one immutable builder, three typed facades.

```typescript
export const r = ril.create()
  // Components (fields + generative)
  .addComponent("select", {
    description: "Dropdown selection with predefined options", // read by the LLM
    propsSchema: z.object({
      label: z.string().describe("Visible field label"),
      options: z.array(z.object({ value: z.string(), label: z.string() })),
      placeholder: z.string().optional(),
    }),
    renderer: ({ props, field }) => <MySelect {...props} {...field} />,
    defaultProps: { placeholder: "Select..." },
    validation: { validate: z.string().optional() }, // value validation, unchanged
    meta: {}, // open, typed via generic — display config, icons, anything app-level
  })

  // Tools — ONE declaration = tool definition (LLM side) + UI (React side)
  .addTool("search_flights", {
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    renderer: ({ input, state, output }) =>
      state === "output-available"
        ? <FlightResults flights={output} />
        : <FlightsSkeleton input={input} />,
  })

  // Message parts
  .addPart("text", { renderer: ({ part }) => <Markdown>{part.text}</Markdown> })

  // Plugins — a plugin is (r) => r
  .use(uiTools());
```

### Renderer contexts (strictly typed, no any-bags)

- **Component**: `{ id, props, field: { value, onChange, onBlur, error, disabled, isValidating }, conditions, meta }` — `props` inferred from `propsSchema`. The `[key: string]: any` escape hatch is removed.
- **Tool**: `{ toolCallId, name, state, input, output?, errorText?, resolve, meta }` — states aligned with AI SDK v5: `input-streaming | input-available | output-available | output-error`. During `input-streaming`, `input` is a deep-partial parsed object; the raw partial JSON string is also available for advanced renderers.
- **Part**: `{ part, meta }`.

### Rules

- Registration is immutable (returns a new `ril` instance), consistent with the existing builder.
- Duplicate key registration throws a typed `DuplicateError` unless `replace: true` is set in the entry config. `replace` swaps the **whole entry**; to override only a default renderer shipped by `uiTools()`, pass it via `uiTools({ renderers: { render_form: ... } })` so schemas stay intact.
- A tool registered without `inputSchema` is **renderer-only**: it renders a host-executed tool but is excluded from generated tool definitions.
- Every entry has **two projections**: schema → LLM (tool definitions, prompt catalog), renderer → React. Registering means simultaneously *exposing to the agent* and *knowing how to render*.
- `CatalogProvider` (React context in core) makes the catalog available to `<Parts>`/`<Part>`. `Form`/`Flow` keep receiving it embedded in their config (via builders) — the provider is an override, not a requirement, for them.

### Deletions (the de-renderer-ification)

- `renderConfig` on form/workflow configs, `.configure({ ...renderers })`, `FormRenderConfig`, `WorkflowRenderConfig`.
- The hardcoded form/workflow renderer-key auto-classification and the triplicated renderer lists in `ril.ts` (configure keys / validate keys / stats).
- `ComponentRendererWrapper` and `resolveRendererChildren`.
- `ComponentBuilderMetadata`, `PropertyEditorDefinition`, `FieldSchemaDefinition` (the dormant visual-builder layer) — superseded by `propsSchema`.
- The unused `*V2` render-prop types in `core/src/types/context.ts`.
- The `useFieldRenderer` flag on `ComponentConfig`.
- `getStats().hasCustomRenderers` and related renderer statistics.

## 5. Headless Chrome: Compound Components + Render Props

Composition lives **app-side**. Every rendering path — including the generative one — has a dev-written composition point (the page for a classic form; the `render_form` tool renderer for a generated one). Therefore no global layout config is needed anywhere.

```tsx
// 1. RilayKit utils = logic + state + wiring, ZERO imposed markup
<Form config={loginForm} onSubmit={handle}>
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

// 3. The generative path uses THE SAME utils, inside the tool renderer
r.use(uiTools({
  renderers: {
    render_form: ({ input, resolve }) => (
      <Form config={fromSchema(input, r)} onSubmit={v => resolve({ status: "submitted", values: v })}>
        <AppFormBody />
        <Form.Submit>{({ submitting }) => <Button loading={submitting}>Validate</Button>}</Form.Submit>
      </Form>
    ),
  },
}));
```

### Component inventory

- **forms**: `Form` (root), `Form.Body` (render prop `{ rows }` — visible rows with conditions applied), `Form.Field` (the single bridge to the catalog: resolves `component:*`, wires state/validation/conditions), `Form.Submit` (render prop `{ submitting }`), `Form.Repeatable` (render prop over items/add/remove). Hooks: `useFormRows()` plus the whole existing selector-hook inventory (unchanged).
- **workflow**: `Flow` (root), `Flow.Body` (current step's form body; render prop), `Flow.Progress` (render prop `{ steps, currentIndex, goTo }` — visible steps with index mapping), `Flow.Back` / `Flow.Next` / `Flow.Skip` (render props receiving full step context: `{ canGo, submitting, isLastStep, step }`). Hooks: `useFlowSteps()` plus existing inventory.
- Without a render prop, `Form.Body` / `Flow.*` render bare structural divs (30-second quick start), no classes, no styling opinions.
- The three workflow nav buttons share one internal parametric implementation.

### Engine sanctity

`FormProvider`/`WorkflowProvider` logic, Zustand stores, condition evaluation, validation pipeline, submission lifecycle, persistence, analytics, monitoring, effects: **untouched**. Only the presentation shell changes. `WorkflowBody`'s internal field-rendering path (the load-bearing component for real consumers) is preserved as `Flow.Body`.

### Real-world pain points fixed in passing (from lilycare audit)

- `allowSkip: boolean | ((ctx: { allData }) => boolean)` — dynamic skippability becomes first-class.
- Nav render props receive full step context — kills the `metadata.hideNextButton` / `metadata.submitLabel` / `metadata.skipVisible` smuggling pattern.
- `propsSchema` typing separates renderer props from DOM props — kills manual prop-stripping in renderers.

## 6. Schema Layer: JSON as the Pivot Format

- **`FormSchema`** (exists): JSON-serializable form definition + `fromSchema(schema, ril, registry?)` building through the standard builder. Evolutions: per-field inline `default` (streaming-friendly ordering — no late top-level `defaultValues` block required), strict typing against the catalog.
- **`FlowSchema` + `flowFromSchema`** (new): the workflow mirror. `{ version, id, name, steps: [{ id, title, form: FormSchema, conditions?, allowSkip?, metadata? }] }`. Non-serializable logic (lifecycle handlers like `onAfterValidation`) referenced **by string key** and resolved from a consumer-supplied `SchemaRegistry`, exactly like form validators today.
- **Typed dynamic building — first-class requirement.** Both known consumers (lilycare `subscription-flow.tsx`, stndrds `form-config.ts` / `use-form-config.ts` / `attribute-field.tsx`) hand-rolled JSON→rilay compilers and cast to `any` at every dynamic build site. The builder and `fromSchema`/`flowFromSchema` must accept runtime-constructed field-config arrays **fully typed against the catalog's component-type union** (`FieldConfigFor<C>`). Killing this `any` gap is a P1/P2 acceptance criterion.
- **Not building**: the reverse serializer (config → JSON). No identified consumer; authored forms may embed live zod validators that cannot serialize. YAGNI.

## 7. The Agent Layer (`@rilaykit/agent`)

### Part model

Own discriminated union, minimal and extensible:

```typescript
type UIPart =
  | { type: "text"; text: string; state?: "streaming" | "done" }
  | { type: "tool"; toolCallId: string; name: string;
      state: "input-streaming" | "input-available" | "output-available" | "output-error";
      input: unknown; rawInput?: string; output?: unknown; errorText?: string }
  | { type: "data"; name: string; data: unknown };
```

Structurally aligned with AI SDK v5 parts so that adapter is near-identity. `reasoning`, `source`, `file` parts: deferred (extensible union).

### Dispatch components

`<Parts parts={UIPart[]} onToolResult={(toolCallId, output) => void} />` and granular `<Part part={} />`. Resolution: `part:*` and `tool:*` catalog namespaces, catalog from `CatalogProvider` (or explicit prop). Unknown tool names fall back to a humanized default or a consumer-provided fallback renderer.

### `uiTools()` plugin

Registers the premium tools + default renderers (overridable via `uiTools({ renderers })`, see §4):

- `render_form` — input schema: the static JSON Schema of `FormSchema`. Default renderer: `<Form config={fromSchema(input)}><Form.Body/><Form.Submit/></Form>` bare.
- `render_flow` — input schema: `FlowSchema`. Renders on complete input (no progressive multi-step mounting).
- `render_component` — input schema: **generated discriminated union** over the catalog's components (`{ type, props }`); renderer resolves the catalog.

### Tool definition generation

- `@rilaykit/agent/ai-sdk`: zod schemas passed through **untouched** (`tool({ inputSchema })` — the SDK owns conversion). `fromUIMessage()` maps `UIMessage` parts → `UIPart[]`. `resolve` wires to `addToolResult`.
- `@rilaykit/agent/anthropic`: `toolDefinitions(r)` emits `{ name, description, input_schema }` using zod v4 native `z.toJSONSchema()`; manual `propsJsonSchema`/`inputJsonSchema` fallback for non-zod Standard Schemas. Message adapter accumulates `partial_json` deltas.
- A prompt-catalog helper produces a compact component-catalog description for system prompts.

### Streaming: progressive form rendering

- Internal partial-JSON parser (fixJson-style, ~100 lines, no dependency) used by adapters that only provide raw deltas.
- `fromSchema` lenient mode for `input-streaming`: a field mounts as soon as its definition is complete (`id` + `type` + parseable props); reconciliation by stable field `id`; append-only; store registers fields incrementally **without reset**; mounted fields are immediately interactive; **submit stays locked** until the schema is complete and validated.
- Flows: render at `input-available` (deliberate scope cut).

### Human-in-the-loop

- The tool renderer receives `resolve(output)`. Payload convention for UI tools: `{ status: "submitted", values }` | `{ status: "cancelled" }`. Cancellation is part of the contract from day one.
- Reference pattern (proven in production in stndrds `ask_questions`): tool declared without `execute` → stream stays pending → UI renders from input → `resolve` → host's `addToolResult`/`tool_result` → agent resumes.
- The agent only receives engine-validated values.

### Agent self-correction

Invalid agent emissions (props failing `propsSchema`, malformed `FormSchema`) never crash rendering: they produce an `output-error` tool result carrying structured `{ error, issues, expectedKeys }` (format proven in stndrds `wrappers.ts`) so the model can retry.

## 8. Error Handling

Small typed error hierarchy in core — no more bare `throw new Error`:

```typescript
class RilayError extends Error { code: RilayErrorCode }
// codes: DUPLICATE | NOT_FOUND | INVALID_SCHEMA | VALIDATION | CONFIGURATION
```

Used by: catalog registration (DUPLICATE, NOT_FOUND), schema compilation (INVALID_SCHEMA with structured issues), agent emission validation (VALIDATION). Renderer-level failures surface as `output-error` parts, never exceptions during render.

## 9. Testing Strategy

- **Test-first (TDD) for every task**: red → implement → green. A test that was never red proves nothing.
- Exact assertions (`toBe('exact')`, never `toBeDefined()`/`not.toThrow()` where an exact assertion is possible). Error paths are first-class tests.
- **Real code paths**: chrome components tested with real Zustand stores and real catalog instances — never `vi.mock("rilaykit")`. (stndrds mocks rilaykit in its UI tests; that setup cost is a symptom this design removes.)
- Key suites: catalog unit (namespacing, immutability, replace, duplicate errors, typed contexts), chrome integration (render-prop contracts, bare defaults, conditions/visibility), schema round-trip (`fromSchema`/`flowFromSchema` valid + invalid + lenient partial), streaming simulation (feed partial-JSON chunks, assert progressive mounts and submit lock), HITL integration (resolve → payload convention), adapter mapping tests.
- Existing test conventions apply: `.tsx` for JSX tests, explicit vitest aliases, StoreInspector non-reactivity caveats.

## 10. Breaking Changes & Migration (v0.2.0)

Breaking, no compat layer (pre-release, one known production consumer per app audited):

| Before | After |
|--------|-------|
| `.configure({ rowRenderer, bodyRenderer, ... })` | Deleted — compose with `Form.Body`/`Flow.*` render props in app components |
| `<Workflow>`, `<WorkflowBody>`, `<WorkflowStepper>`, `<WorkflowNextButton>`, `<WorkflowPreviousButton>`, `<WorkflowSkipButton>` | `<Flow>`, `<Flow.Body>`, `<Flow.Progress>`, `<Flow.Next>`, `<Flow.Back>`, `<Flow.Skip>` |
| `<Form>`, `<FormBody>`, `<FormRow>`, `<FormField>`, `<FormSubmitButton>`, `<RepeatableField>` | `<Form>`, `<Form.Body>`, `<Form.Field>`, `<Form.Submit>`, `<Form.Repeatable>` (row markup is app-side) |
| `ComponentRenderProps` any-bag | Typed component context (props inferred from `propsSchema`) |
| Renderer-prop types (`FieldRendererProps`, `FormBodyRendererProps`, ...) | Render-prop context types exported from the same packages (stable import paths — consumers type their app components against these) |
| `ComponentBuilderMetadata` / `builder` field | `propsSchema` + `meta` |
| `metadata.hideNextButton` / `skipVisible` smuggling | First-class render-prop context + `allowSkip` predicate |

`MIGRATION.md` ships with the release, written against the audited usage profiles of lilycare (~1 renderer file + ~25 imports, mechanical) and stndrds (`standard-rilay.tsx` + form-flow compiler). Migrating those apps is out of scope for this repo.

## 11. Delivery Phases

Each phase gets its own implementation plan and is independently shippable. Per-task checker panel (tests-prove-behavior / DRY / elegance / conventions) applies throughout.

- **P1 — De-renderer-ification (breaking)**: unified namespaced catalog + `propsSchema` + `meta` + `use()` + typed errors; delete renderConfig/wrapper/metadata/V2 layers; rewrite chrome as compound headless (`Form.*`, `Flow.*`, hooks); renames; `MIGRATION.md`.
- **P2 — Schema layer**: `FlowSchema` + `flowFromSchema`; `FormSchema` streaming-friendly evolutions; fully-typed dynamic building (kill the `any` gap).
- **P3 — `@rilaykit/agent`**: part model + `<Parts>`/`<Part>` + `CatalogProvider` wiring; tool definition generation + prompt catalog helper; `uiTools()`; partial-JSON parser + progressive form mounting; HITL resolve loop + structured self-correction errors; `/ai-sdk` and `/anthropic` adapters.

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
- Explicit filenames (`partial-json.ts`, `tool-definitions.ts`), no generic `utils.ts` dumping grounds.
- Adapters only under subpath exports; no SDK dependency in main entries.

**Tests (load-bearing)**
- Test-first; watch it fail for the right reason; then implement.
- Prove behavior with exact assertions; test error paths explicitly; real stores and real catalog instances — never mock the unit under test.
- Quality over quantity.
