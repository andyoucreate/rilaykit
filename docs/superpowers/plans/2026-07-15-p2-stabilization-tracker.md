# P2 Stabilization Tracker — "NASA-grade" (schema layer)

> Same discipline as the P1 campaign (50 bugs, 8 rounds): hunt real gaps → TDD fix → mutation-check →
> commit → tick. Stop condition: `cleanOnGoldenPath` for 2 consecutive rounds, then launch P3.

## Baseline (2026-07-15)
- P2 shipped: compileForm + bindings + inline defaults, FieldConfigFor<C>, FlowSchema/compileFlow/validateFlowSchema.
- 158 files / 1611 tests green, type-check 4/4, build 6/6. Suite is deterministic (wall-clock assertions de-flaked).

## Round 2 inventory — 12 bugs (8 golden-path); NOT clean

Two findings land on ME: (a) the round-1 "systemic" prototype fix was NOT systemic — it closed
repeatable-data.ts but missed the store + hook reading the SAME tables by plain index; (b) the
one-namespace ensureUnique block (revised in r1) wrongly rejects a mainstream schema.

Verdict delivered on the r1-deferred residual: `flattenRepeatableValues` __proto__ IS reachable and
provable, but is an object-local prototype graft — NOT prototype pollution, NOT exploitable. No
prototype policy warranted. Fix cheaply or document; do not over-engineer.

### Batch A — finish the prototype class (my r1 miss)
- [x] BUG/high (golden): `_repeatableOrder`/`_repeatableNextKey`/`_repeatableConfigs` read by plain index in formStore.ts (:224,227,230,246,259,262,304,325,328,331 + :540) and `formConfig.repeatableFields?.[id]` in use-repeatable-field.ts:67 → a repeatable named `toString` CRASHES a live form (`orderedKeys.map is not a function`). `if (!config) return null` guards are defeated too (inherited method is truthy).

### Batch B — compiled-flow cross-step conditions
- [x] BUG/high (golden): cross-step field conditions in a compiled FlowSchema silently NEVER fire (visible AND required) — WorkflowProvider.tsx. This is the lilycare quote-flow core use case.

### Batch C — the error contract (what P3 self-correction depends on)
- [x] BUG/high (golden): `effects: [null]` escapes as raw TypeError (no object guard) — compile-form.ts
- [x] BUG/high (golden): validateConditionConfig recursion has no object guard — a null child in a composite condition tree escapes raw — compile-form.ts
- [x] BUG/med (golden): a non-object `validation` on a field is SILENTLY DROPPED — invalid schema compiles with no validation — compile-form.ts
- [x] BUG/med: a non-array `effects` is SILENTLY DROPPED — declared effects never wire up, nothing reported — compile-form.ts
- [x] BUG/med: `compileForm(null)`/`compileFlow(null)` throw a raw TypeError off the first envelope read — validate-envelope.ts
- [x] BUG/med (golden): duplicate field ids escape the `issues[]` contract as a core ValidationError — compile-form.ts

### Batch D — validateProps actionability (P3 dependency)
- [x] BUG/high (golden): propsSchema issues drop the offending prop key AND expectedKeys — the spec §7 self-correction contract promises both — compile-form.ts

### Batch E — builder spurious rejection
- [x] BUG/med (golden): two repeatables cannot share a template field id (`addresses.name` + `contacts.name` — a mainstream backend shape) — form.ts. Runtime-proven sound by structureFormValues.

### Batch F — low / judgment
- [x] BUG/low: mergeDefaultValues detaches one level only — nested defaults shared across compiles and with the caller's JSON
- [x] BUG/low: flattenRepeatableValues `__proto__` graft (verdict: not exploitable — cheap fix or document)
- [x] gap/low: validateProps discards the coerced/transformed value; the renderer gets the raw one
- [x] gap/low: an object/array field `default` is shared by reference between defaultValues, the store and the schema
- [x] gap/low: a step effect can write a field belonging to no form; the phantom key reaches onComplete

## Round 1 inventory — 10 bugs (7 golden-path); NOT clean

**Systemic class spotted: prototype-key lookups (3 of the 10).** The same class fixed in P1 (`getFieldValue`
used prototype-inclusive `in`) reappeared in the P2 code. Fix it as a CLASS, not per-instance: every
string-keyed lookup on a plain object indexed by untrusted schema input must use an own-property guard
(`Object.prototype.hasOwnProperty.call`) or a Map / null-prototype object.

### Batch A — prototype-key class (systemic)
- [x] BUG/high (golden): validator descriptor `{type:'toString'}` → `PARAMETERIZED_BUILTINS[type]` resolves Object.prototype.toString → raw `TypeError: requiredParams is not iterable` instead of SchemaValidationError — compile-form.ts:487 (+ same defect at :513 registry lookup and :830 resolveValidationDescriptor)
- [x] BUG/med: `validateEffect` truthiness check → handler `'toString'` resolves to Object.prototype.toString → compiles into a silent no-op effect; a non-function binding defers to a runtime TypeError — compile-form.ts:551, :887
- [x] BUG/low: a step id (or field id) of `__proto__` silently discards that step's compiled defaults — compile-flow.ts

### Batch B — compile-form correctness
- [x] BUG/high (golden): compileForm/compileFlow return the input schema's `defaultValues` **by reference** — two compiles of the same schema share mutable state — compile-form.ts
- [x] BUG/med (golden): a null/non-object entry inside a repeatable's `rows` throws a raw TypeError; the guard exists in validateRow/validateField but was omitted in validateRepeatable — compile-form.ts:356-358

### Batch C — builder (P1 code, reachable from P2's untrusted JSON path)
- [x] BUG/high (golden): a top-level field id equal to a repeatable id compiles cleanly, then `structureFormValues` **silently destroys the whole repeatable array** in the submit payload (two separate ID namespaces in form.validate()) — form.ts:737-759 + repeatable-data.ts:95-103
- [x] BUG/med (type-safety): `.add()`/`.addSeparateRows()` cross-assign props between sibling component types in a mixed-type call — form.ts

### Batch D — compile-flow diagnostics
- [x] BUG/med (golden): a step's form-builder failure escapes compileFlow with **no step identity** — compile-flow.ts
- [x] BUG/med (golden): validateFlowSchema passes unresolvable allowSkip/after bindings that compileFlow then throws on (validation should catch it) — validate-flow-schema.ts
- [x] BUG/med (golden): step `title` never validated — a title-less backend step compiles into `StepConfig { title: undefined }` — validate-flow-schema.ts

## Iteration log
- (r4) 11 bugs (6 golden) — all real, nothing refuted. Converged on ONE pre-existing root cause + packaging hygiene:
  - **THE APPEND-ONLY MIRROR (data integrity)**: FormProvider reported only `Object.keys(values)` — the NEW keys — so a repeatable row DELETED by the user never propagated to the workflow. Verified: `onWorkflowComplete` received the deleted row's value (`drop-me`). Also resurrected the row on step re-entry, and lost user reorders. PRE-EXISTING (git blame → 2fbc505, long before P2); my r3 fix merely made it visible by restoring rows at all. Fixed at the root via a union-diff + `onFieldsRemove`; mutation-proven (revert → 2/4 red).
    - Design judgment worth keeping: rejected replace-not-merge because the form is NOT the sole writer of a step slice (prefill bindings + onAfterValidation write there too); and put the repeatable-order mirror OUTSIDE `allData` — allData is the host's completion payload, bookkeeping has no business in it.
  - `logicalOperator: "OR"` (miscased) passed validation and SILENTLY became AND (the evaluator tests `=== 'or'`) — inverted user intent, not cosmetic.
  - Packaging class (opened in r3) extended to all 4 packages: spurious non-optional `typescript` + `react-dom` peerDeps removed, missing LICENSE added, and the child-process dist guard now covers every published package (CJS ≡ ESM parity), not just the all-in-one.
  - Gate: 178 files / 1773 tests (+21), 2-3 consecutive identical runs, type-check 4/4, build 6/6.

## Round 5 — 7 bugs (5 golden), all real, nothing refuted. THE COUNT IS FALLING: 10, 12, 13, 11, 7.

Two CRITICAL data-integrity bugs, both PRE-EXISTING, both verified at HEAD:
- [x] CRITICAL: the first edit on the INITIAL step wiped every untouched default of that step (createWorkflowStore seeds allData but stepData:{}; only navigation seeds stepData, which the initial step never does — so the first _setFieldValue overwrote allData[stepId] with {} + the typed value). Fixed by merging into allData[stepId] (allData is the source of truth); fixed a latent cross-step write bug for free.
- [x] CRITICAL: the append-only-mirror class I declared CLOSED in r4 RE-ENTERED through array-shaped defaults — a SHAPE MISMATCH: authored defaults live as `lines:[{...}]`, the mirror speaks flat composite keys, so _removeFieldValues never touched the array. A row the user deleted was RESURRECTED and SUBMITTED. Root fix: the store speaks ONE shape (flat) for every writer; structuring happens only at host boundaries.
  - The fixer proved MY premise wrong: "structureFormValues already structures the payload" was half-true — the write-back was the only thing doing it, and TWO TESTS CONTRADICTED EACH OTHER on the payload shape (form-submit pinned nested arrays; submitWorkflow() pinned flat keys). Two contracts, one field. Now: flat internally, authored shape at every host boundary, regardless of path.
  - A THIRD bug found while fixing: the mirror subscriptions were in a PASSIVE effect — same class as the r3 form-id race. Between commit and macrotask flush the form is interactive with nothing listening; a write landing there becomes the subscription's own prevValues baseline — lost forever, not late.
  - Honest consequence disclosed: `useFlow().workflowState.allData` now exposes flat keys — a real change to a public read surface.
- [x] _repeatableOrders never persisted (r4 fixed only in-session re-entry); backward compat pinned.
- [x] resetWorkflow() never reset the form store — the reset was invisible; the two stores diverged silently.
- [x] Flow.Skip on the LAST step was an INERT button (offered, enabled, did nothing, flow never completed).
- [x] compileForm hot-swap under a STABLE form id kept stale state — a removed field was still submitted (the realistic server-driven case: stable business id, evolving schema).
- [x] @rilaykit/workflow threw SchemaValidationError without exporting it — the exact class P3 self-correction must catch. Now re-exported with a single shared class identity (instanceof works cross-package; proven against the built dists).

Process note (my error): I briefed a fixer with "the findings are in the workflow output" — which it could not read. It FLAGGED the gap instead of inventing, and 4 findings had to be re-dispatched with full text. Brief agents self-containedly.
Open DX trap noted, not fixed: a top-level field `defaultValue` is silently accepted and ignored (FormFieldConfig has no such key, and TS does not reject it).

## Round 6 — 11 bugs (4 golden). The verdict was on MY OWN r5 refactor, and it was deserved.

My r5 commit claimed "every wholesale slice write goes through writeStepSlice" and that structuring happens
"at the host boundaries". BOTH claims were FALSE — I had converted 2 boundaries out of ~6.
- [x] CRITICAL: StepDataHelper writes (setStepData/setStepFields/setNextStepField/setNextStepFields — the
      documented API every server-driven prefill uses) bypassed normalisation. The slice held BOTH shapes at
      once — the literal pathology my own commit quoted as proof of the bug it "fixed" — and the row the user
      deleted was SUBMITTED to the backend. A THIRD door on the same critical.
- [x] REGRESSION (mine): analytics.onStepComplete + onWorkflowAbandon handed FLAT keys where they used to hand
      the authored shape (proven by running the identical path against pre-r5 211a95f AND HEAD), contradicting
      onWorkflowComplete on the SAME interface.
- [x] REGRESSION (mine): StepDataHelper.getStepData/getAllData returned FLAT while the `data` param of the SAME
      callback was structured — two representations inside one invocation.
- [x] + 8 more, all real. Nothing refuted outright.
- [x] MY r5 buildConfigSignature keyed on `field.type`, which is uniformly `undefined` (it is `componentId`) —
      the hot-swap fix was VACUOUS. Caught by the fixer's own test, not by mine.

**The architectural correction (the fixer pushed back on my brief, rightly):** I asked it to close four doors.
It found a FIFTH nobody listed (`useFlowActions().setStepData`/`.setAllData` — public API; `useFlowStoreApi()`
hands out the raw store, worse) and concluded "guarding four doors is what failed twice". So the INVARIANT NOW
LIVES IN THE STORE: createWorkflowStore normalises inside _setStepData/_setAllData/_loadPersistedState/seeded
defaults. No caller can be the one who forgot — including callers that do not exist yet. Structurally closed,
not guarded. Mutation-checked (neutralise the 5 normalisation calls → 3 proof tests red).

**The deepest testing lesson of the campaign:** reverting only the setStepData wire leaves EVERY
boundary-specific assertion green — the form's own submit heals the slice on the way out. Only "the store holds
ONE shape at EVERY commit" catches the transient two-shape slice that loses the row. *The invariant is the test;
the boundaries are corollaries.*

**Documented public read contract (now in TSDoc):** useFlowData()/useStepData()/useStepDataById()/
workflowState.allData/.stepData and the persistence snapshot are FLAT (the deliberate live escape hatch);
every host CALLBACK gets the AUTHORED shape; useFlowActions accepts either.

**Product call flagged for review (reversible, one line + proof expectations):** setNextStepFields on a re-run
prefill settled as OVERWRITE-ALWAYS — a setter that silently no-ops is worse than the bug, and seed-if-absent
loses a corrected input.

Gate: 196 files / 1825 tests, 3× identical, type-check 4/4, build 6/6.

## Round 7 — 3 bugs (2 golden). THE COUNT COLLAPSED: 10, 12, 13, 11, 7, 11, 3.

- [x] CRITICAL: the shape class re-entered a FOURTH time — through the ONE action r6 explicitly EXEMPTED.
      `_setFieldValue` skipped normalisation with a comment justifying it ("flat by nature: the form reports
      composite key ids") — TRUE of the form's calls, FALSE of the public `useFlowActions().setFieldValue`
      (re-exported by the all-in-one, documented in the skill). A host prefilling the natural way planted an
      authored array: the form rendered ZERO rows (user could not see or delete them) and the ghost rows were
      SUBMITTED. **Four re-entries, every one through an exemption someone reasoned their way into. An invariant
      with an exception is not an invariant.** Fixed; the exemption comment deleted.
- [x] MEDIUM: an async persistence load remounted the step form, wiping the visible validation error and ejecting
      keyboard focus (values survived). The fixer REJECTED my proposed option as "a symptom rule" and reframed:
      the key asked the wrong question — `isInitializing` means "the load resolved", but a remount is owed only to
      a NEW SEED. `_resetCount` → `_seedGeneration`, bumped by the two things that actually replace data.
- [x] MEDIUM: WorkflowContext.allData/.stepData published RAW flat keys to onStepChange, onAfterValidation's 3rd
      param and every analytics callback — so one invocation handed the host `data.lines=[{...}]` beside
      `context.allData.items={'lines[k0].label':...}`. The fixer REFUTED the report's "serves two masters"
      premise by grepping every consumer: nothing internal reads them, so the collision justifying "leave it flat"
      did not exist. Structured.
- Refuted honestly: `_removeFieldValues` was NOT a sixth door — the test went unexpectedly GREEN, so the fixer
  DELETED the tautology rather than keep a test that proves nothing. Four `isLikelyRealBug:false` observations
  reported, source untouched.

**THE CLASS IS NOW STRUCTURALLY CLOSED.** `store-enforces-flat-shape.test.tsx` enumerates ALL 11 actions of
`useFlowActions()`, classifies each, and asserts `Object.keys(actions)` equals the classified set — so an action
added tomorrow without normalisation fails on the ENUMERATION, and one that writes a slice unnormalised fails on
the shape. Mutation-verified independently: reopening the fifth door fails 2 tests including the enumeration.
No memory required; the structure enforces it.

Gate: 197 files / 1833 tests, 3× identical, type-check 4/4, build 6/6.

> **CORRECTION (r8+): the claim above was premature and wrong.** The *flat-shape* invariant was closed. The
> CLASS was not: it was one member of a family — *a thing keyed to a step's identity that does not know which
> step it is* — and the family had **eleven more live members**. See below. The lesson is not "we missed some";
> it is that **closing an invariant is not closing its class**, and only a runtime-derived enumeration that
> fails on a member added tomorrow can tell the difference.

## Round 8 — 2 bugs, `cleanOnGoldenPath: TRUE`, 0 vacuous tests (mutation hunt over 12-15 top tests)

- [x] HIGH: `useFlowActions().setCurrentStep` dropped the stepId → the `stepData` mirror desynced permanently.
      Fixed by DERIVING `_currentStepId` inside the store; the param and the `currentStepId` option removed —
      no caller is asked to remember, so none can forget. Its new enumeration caught a SECOND door
      (`loadPersistedState`) before any fix was written. Commit `9d7ce5c`.
- [x] CRITICAL: the flat-shape invariant was FROZEN AT MOUNT (`createWorkflowStore` closed over `steps`).
      Fixed with a `getSteps()` live accessor; the static array REMOVED so frozen-at-mount is unrepresentable.
      Commit `4f28fe6`.

## The step-identity class — 12 live members, closed one enumeration at a time (r8 extension)

Round 8's fixer flagged `_repeatableOrders` as "the natural next enumeration — no exported door today, which is
the only reason it hasn't bitten; the same 'true of the internal caller' reasoning that died four times." Since
P3 adds public API, that flag was worth acting on. Each enumeration then found the next member. Every bug below
is **real, verified by repro, and was live on `main`'s golden path** unless marked inert.

| # | Member | Bite | Commit |
|---|---|---|---|
| 3 | `_repeatableOrders` | Two normalisers; the "blind" one was written for store CREATION (mirror empty by construction) and later routed two PUBLIC actions. Host re-read its own array **reversed**. | `4421586` |
| 4 | `allData` orphan slices | `structureWorkflowData` seeded from all data but iterated only LIVE steps → a removed step's slice shipped **internal flat keys** to the host's backend. | `18ac832` |
| 5 | `_defaultValues` | Normalised once at creation against a LIVE step set → `reset()` re-seeded a raw authored array for a now-live step, with a row `_removeFieldValues` could not reach. | `ab1d887` |
| 6 | `allData` creation seed | A step born after mount, **zero actions**: field conditions evaluated against authored shape → wrong UI. Disclosed that `ab1d887` had introduced a live regression. | `c0ccae8` |
| 7 | `stepData` publishing | `setAllData` never published the mirror → conditions read superseded values. `stepData` is spread LAST in the condition merge: it **actively overwrote** the fresh data it mirrors. | `2d5bb3f` |
| 8 | `_currentStepId` owner | Re-derived only on index-moving writes, never when the step set moved UNDER a fixed index. A recompile → user rendered `intro`, mirror a view of `main`. | `ddf22a8` |
| 9 | order-mirror claims | The reported bug **did not exist as diagnosed**; the real one was worse and needed no recompile. | `1c60a7a` |
| 10 | form store identity | **Cross-step data leak**: two steps sharing a form id + shape are ONE form. Submit step B untouched → step A's secret copied into B's slice and shipped. Six members leaked, not one. | `cb482ac` |
| 11 | `_reset`'s hand-list | Flagged "inert, out of scope" — **both were wrong**. Live via #12/5. Cure was ~30 lines, zero regressions. | `084c776` |
| 12 | seam engines (5 carriers) | In-flight async validation, effect engine, in-flight submit, debounce timer, `_fieldConditions` — all crossed a step swap. #5 needs **no async at all**: xray's unconditional field inherits alpha's `visible:false` → **unfillable step**. | `084c776` |

**What actually killed the class** (same as prototype-keys before it): not instance fixes — **runtime-derived
enumerations that fail when a member is added tomorrow**. `stepIdentityMembers()` reads a real store's state at
runtime; a planted fake `_stepNotes` made it fail. The seam's form-store diff does the same. `_reset` is now
built from `createInitialFormData()`, so planting a member **fails compilation** (`TS2741`) until given a birth
value — the only *unrepresentable* result of the series; the rest are honestly recorded as **proved-today**.

**The differential that found 4 of the last 5**: *a store that MOUNTED with the step and a store that had it
BORN must be indistinguishable.* It names no shapes, so anything computed at mount from the step set differs by
that very fact.

**Agents refuted me on 12 of 12 rounds, every time correctly.** They demolished a false product tradeoff I
posed; proved a bug needed zero actions where I claimed two; disclosed that the *previous* round's fix had
introduced a live regression; twice refused to claim unrepresentability when they had only reached proved-today;
refuted the very bug I sent them and found a worse one behind it; refuted **both** candidate fixes I passed
along (compile-time form-id uniqueness is a **breaking change dressed as a fix** — sharing a form id across
steps is legitimate; a step-keyed `formProviderKey` remounts the host's entire subtree because `children` renders
INSIDE `FormProvider`); and refuted my "inert, out of scope" call on #11. Two caught themselves nearly shipping
**self-proving tests** (a repro that passes under mutation proves nothing). One discarded an `if (false)` mutation
as dishonest: it made the code throw, so the test passed for the wrong reason.

Gate: 203 files / 1956 tests, 3× identical, type-check 4/4, build 6/6.

## Standing constraints carried into P3
- **(b) STANDS**: anything owning a live step set and a store owes it `_reconcileStepSet`. `WorkflowProvider`
  discharges it (`WorkflowProvider.tsx:259`); a directly-built store carries the same obligation. **If P3 mounts
  parts against stores built outside the provider, that obligation travels with them.**
- **(c) RETIRED**: shared form ids across steps are legitimate input. `compileFlow` may freely emit them; do
  **not** add a form-id uniqueness check.
- **(12th, carried as documented)**: *anything below `FormProvider` holding work that outlives a render must key
  on `configSignature`* — no enforcement. Inert; the risk door is authoring new code under the provider, which
  is exactly what P3's parts are.
- **GATE ON HITL RESOLVE, not on P3**: every leak of the final round was **in-flight work crossing a swap**. HITL
  resolve is in-flight work at the **workflow** altitude, where `instanceId`/`formInstanceKey` do not reach and
  where the only sweep to date (`stepIdentityMembers()`) targeted *state*, never *in-flight work*. P3 makes swaps
  routine rather than rare. **Sweep the workflow store for in-flight work before HITL resolve lands.** The
  technique transfers directly: mounted-vs-navigated + a derived member diff.

## Campaign trajectory (honest)
P1: 50 bugs / 8 rounds. P2: 46 bugs / 4 rounds (10, 12, 13, 11). ~96 total. NOT converging by bug-count.
What IS converging: the CLASSES. prototype-keys (closed via an exhaustive lifecycle test after 7 escapes);
published artifacts (closed via child-process dist guards); the append-only mirror (closed at the root).
Most r3/r4 findings were PRE-EXISTING P1-engine defects that P2's deeper tests finally exercised —
not P2 regressions. That is the campaign working as intended, but it means the tail is the engine's, not the schema layer's.
- (r3) 13 bugs (6 golden) — all real. Plus TWO major finds beyond the hunt:
  - **A SOURCE race, not a test race** (I guessed wrong; the agent proved me wrong by instrumenting): FormProvider reset the store on a form-id swap in a PASSIVE effect. React flushes those in a scheduler macrotask, so between commit and reset the new step is committed AND paintable while the store still holds the previous step's values — any write landing there is silently destroyed. A cross-step prefill from onAfterValidation is exactly such a write-on-arrival. Reachable in production. Fixed with useIsomorphicLayoutEffect (atomic swap); mutation-proven (revert → 2/2 red). This was the "loose thread" r2 could not reproduce: it only loses under parallel CPU contention.
  - **The published package could not be require()d**: core's monitoring `LocalStorageAdapter` collides with workflow's persistence `LocalStorageAdapter` in the all-in-one barrel. The rename exposed a SECOND defect: tsup `splitting:true` routes CJS through sucrase, whose _createStarExport installs star names as getters BEFORE explicit assignments — inverting ESM's "explicit shadows star" precedence. Both fixes needed: without the rename, esbuild's correct codegen would SILENTLY SHADOW rather than throw. The entire suite was blind (everything resolved ESM/source) — closed with a guard that loads the real dist in a child node process, wired through test:ci.
  - **The prototype class finally CONVERGED** via the right tool: an exhaustive lifecycle test (30 tests, 6 keys × every stage: compile→render→dirty→validate→submit→reset→flow). It caught a 7th site nobody had found — structureFormValues silently dropped a __proto__ repeatable's ENTIRE array from the submitted payload (rows rendered, user filled them, submit omitted them). Guarding site-by-site never converged; one exhaustive lifecycle test did.
  - The agent REFUTED its own r2 decision with evidence: validateProps feeding the coerced value silently deleted undeclared props (z.object() strips them with no issue raised). Reverted to validation-only.
  - Gate: 176 files / 1752 tests (+49), 3 consecutive identical runs, green under load average 220; type-check 4/4; build 6/6; CJS require() → 159 exports.
- (r2) 12 bugs found (8 golden), ALL REAL (zero false positives). Fixed TDD in 6 batches. Full gate: 172 files / 1703 tests (+41), type-check 4/4, build 6/6. Suite verified deterministic: 12 consecutive clean runs incl. one under 4 CPU-saturating busy loops.
  - The prototype class bit a THIRD time — inside its own fix: reusing clonePlainData re-broke r1's `__proto__` defaults fix (the clone did `cloned[key] = ...`); r1's own regression test caught it. clonePlainData now defines own properties.
  - Batch A's sweep found MORE than reported: a 3rd crash site (useFormConditions.ts:86) AND the class extended past repeatable tables to plain FIELD ids — a field named `toString` resolved an inherited method and silently rendered HIDDEN (vanished from the form).
  - Batch B's root cause was NOT the compiled path: WorkflowProvider hands FormProvider only the current step's values, so cross-step conditions collapse to hidden/not-required. HAND-BUILT flows shared the defect identically. Fixed once at the shared layer (new `conditionValues` prop). The negative cases had been passing VACUOUSLY (field always hidden) — only reverting the fix proved the red.
  - Batch D caught a packaging trap: importing `@standard-schema/spec` directly into forms relied on hoisting and would break the published package; rewired through core's exported PropsValidationResult.
  - Loose thread (investigated, not reproduced): one unnamed test failed once during a Batch F gate run. 12 consecutive clean runs since, including under CPU saturation. Treated as a transient environment hiccup, not a race.
- (r2) 12 bugs found (8 golden), ALL REAL (zero false positives). Fixed TDD in 6 batches. Full gate
  green: 172 files / 1703 tests (+41), type-check 4/4, build 6/6.
  - Batch A (my r1 miss) swept properly. The reported 11 store sites + the hook were only part of it:
    the audit found a THIRD crash site (`useFormConditions.ts` `repeatableOrder[id]`, unreported) and
    — beyond the repeatable tables — the SAME class on plain FIELD ids. A field named `toString`
    resolved `_fieldConditions.toString` to the inherited method, whose missing `visible` key rendered
    the field HIDDEN: the field silently vanished from the form. All per-field store selectors
    (`values`/`errors`/`touched`/`validationStates`/`_fieldConditions`/`_fieldProps`) + forms' and
    workflow's `fieldConditions[fieldId]` now read through `getOwn`.
  - Batch B root cause was NOT the compiled path: WorkflowProvider hands FormProvider only the current
    step's values, and useFormConditions evaluates against the form store alone. Hand-built flows share
    the defect identically — the negative cases only ever passed VACUOUSLY (the field was always
    hidden). Fixed once at the shared layer via a new FormProvider `conditionValues` prop.
  - Batch D superseded the r1 field-id-only props paths (3 tests updated deliberately). PropIssuePath
    is derived from core's PropsValidationResult rather than importing @standard-schema/spec into
    forms — that dep belongs to core, and forms must not rely on hoisting.
  - Batch F taught the r1 lesson again in reverse: reusing `clonePlainData` for defaults RE-BROKE r1's
    `__proto__` defaults fix, because the clone wrote `cloned[key] = ...` and grafted a prototype. The
    r1 regression test caught it. `clonePlainData` now defines own properties — correct for its own
    contract, since catalog registration reads it too.
  - Judgment calls PINNED, not changed: the step-effect phantom key is legitimate staging (lands under
    its own step slice; payload shape unaffected). `validateProps` coercion resolved as option (a) —
    it now feeds the coerced value, since a propsSchema transform was otherwise meaningless.
  - Residual: one unreproduced single test failure during a Batch F gate run; not captured by name and
    clean across 7 consecutive full-suite runs afterwards. Worth watching, not diagnosable as-is.
- (r1) 10 bugs found (7 golden), ALL REAL (zero false positives). Fixed TDD in 4 batches; ID-collision + prototype-guard mutation-checked. Full gate green: 160 files / 1662 tests (+51), type-check 4/4, build 6/6.
  - The prototype-key class was fixed SYSTEMICALLY: new `getOwn`/`hasOwn` primitive (core/utils/ownProperty.ts); module-owned tables → Map; consumer-owned (bindings) → own-property guard; untrusted-id accumulators → Map + Object.fromEntries. The audit found **6 MORE instances** beyond the 3 reported, incl. a hard crash (`effectsMap['toString'].push is not a function`) and the exact P1 `getFieldValue` defect recurring at repeatable-data.ts:89.
  - #7 (mixed-type props) taught a real lesson: the obvious fix (`FieldConfigFor<C>` per arg) type-checked and passed all package tests but broke EVERY playground call site — `ril.create()` carries a string index signature that collapses `keyof C & string`→`string`. Only the full `pnpm build` caught it. Shipped fix infers a tuple of component-type keys per argument instead.
  - Residual, deliberately deferred (P1 store surface, needs a prototype policy for the whole Zustand values object, not a half-fix): `flattenRepeatableValues` WRITE side still reassigns the prototype for a `__proto__` key.
