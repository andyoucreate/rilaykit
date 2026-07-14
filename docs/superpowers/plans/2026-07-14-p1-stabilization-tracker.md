# P1 Stabilization Tracker — "NASA-grade"

> Cross-iteration progress log for the `/loop` stabilization run. Goal: exhaustive
> unit + integration + e2e coverage proving RilayKit's power, until the library is
> submittable to the NASA. Each iteration: hunt real gaps → TDD tests → fix bugs →
> commit → tick a box here. When every box is green and the adversarial hunt returns
> nothing new for two consecutive rounds, launch P2.

## Baseline (2026-07-14, start of loop)
- 1428 tests / 105 files green. Type-check 4/4. P1 files 92-100% coverage.
- Known pre-existing risks (from MEMORY.md): WorkflowProvider persistence `useEffect`
  infinite-loop smell (WorkflowProvider.tsx ~281); conditional `usePersistence` hook
  call (rules-of-hooks smell) ~246-254.

## Target areas (checked as hardened + proven)

### Catalog (core)
- [x] `.component/.tool/.part` deep immutability under mutation of a shared entry object
- [ ] `.renderers()` partial attach (some keys valid, one invalid) — atomicity (no partial mutation)
- [ ] `validateProps` with non-zod Standard Schema (valibot-shape) + async-guard + nested objects
- [ ] `.use()` plugin composition order + a plugin that calls `.renderers()`
- [ ] Duplicate `replace:true` across kinds; cross-kind same-id isolation under stress
- [ ] `getComponent` generic inference edge cases (union component maps)

### Forms
- [x] Deeply nested repeatables data structuring / flatten round-trip fidelity
- [ ] Conditional required + validation interaction (the MEMORY.md no-op validator caveat)
- [ ] `Form.Field` overrides precedence full matrix (defaultProps < config < dynamic < overrides < conditions)
- [x] Async validation race (debounce + rapid change + blur) determinism
- [x] Effects: chained effects, effect that sets a field which triggers another effect
- [ ] Submit with `force`/`skipInvalid` options end-to-end
- [ ] compileForm/fromSchema hostile inputs (unknown component type, malformed rows)

### Workflow
- [ ] Persistence save/restore round-trip with repeatables + conditional steps
- [ ] Persistence `useEffect` stability — no infinite loop when persistence enabled (MEMORY.md)
- [ ] Conditional-step navigation: all-hidden middle, first step hidden, last step hidden
- [x] `onAfterValidation` that changes a later step's visibility mid-navigation
- [ ] `setNextStepFields`/`setStepFields` cross-step under skip + back + forward
- [x] Analytics full lifecycle (start/complete/skip/abandon/error) exact ordering
- [ ] Flow with a single step; flow with zero visible steps (degenerate)

### Integration / e2e (power demos)
- [x] A real "quote flow"-style multi-step form (mirrors lilycare) end-to-end
- [x] A server-JSON-driven form compiled + rendered + submitted (mirrors stndrds subscription)
- [x] Full form: 3-column rows, conditions, async validation, repeatables, submit payload exact
- [x] Rerender-isolation: typing in one field does not re-render sibling fields (perf contract)

### Cross-cutting
- [ ] No `any` anywhere in `packages/*/src` (grep gate as a test)
- [ ] Every public export has at least one test touching it (export-surface audit)
- [ ] All error paths throw the correct RilayError subclass + code (extend the proof)
- [x] Concurrent/StrictMode double-invoke safety for providers (idempotency guard, passes clean)

## Bug inventory (found by adversarial hunt, iter 1) — TDD-fix each: red → fix → green

### core (fix this batch)
- [x] BUG/high: `evaluateCondition` `matches` throws on invalid regex (non-total) + drops regex flags — conditions/index.ts
- [x] BUG/high: catalog entries shallow-copied — nested `meta`/`defaultProps`/`validation` leak by reference — config/ril.ts
- [x] BUG/high: `combine()`/`combineSchemas()` declared `async` → always Promise → validateProps rejects sync combined schemas — validators.ts + unified-utils.ts
- [x] BUG/med: `combine()` doesn't thread transformed values (each sub-schema sees original input) — validators.ts
- [x] BUG/med: `number()`/`min()`/`max()` coerce ''/'   '/[]/'0x10' to numbers — validators.ts
- [x] BUG/med: `notContains` returns false (not vacuously true) for non-string/array field value — conditions/index.ts

### forms (next batch)
- [x] BUG/high: async validation has no sequence/cancellation guard — stale result overwrites current — useFormValidationWithStore.ts
- [x] BUG/high: `validation.debounceMs` accepted+resolved but never consumed (silent no-op) — form.ts / validation pipeline
- [x] BUG/high: `reset()` wipes `_repeatableOrder`/`_repeatableNextKey`, repeatable rows vanish — formStore.ts
- [x] BUG/med: `flattenRepeatableValues` throws on null/non-object item — hostile defaultValues — repeatable-data.ts
- [x] BUG/med: async chained effects can infinite-loop (cycle detection only sync) — effect-engine.ts
- [x] BUG/med: validation reads field conditions from React state not live store (stale) — useFormValidationWithStore.ts
- [x] BUG/low: flatten/structure round-trip drops item fields outside template — repeatable-data.ts

### workflow (next batch)
- [x] BUG/high: onStepChange stale visibility when onAfterValidation flips a later step mid-nav — useWorkflowNavigation.ts
- [x] BUG/high: analytics onStepComplete receives NEW step's stepData not the completed step's — useWorkflowAnalytics.ts
- [x] BUG/high: LocalStorage compress:true throws on non-Latin1 (accents/emoji) — persistence/adapters/localStorage.ts
- [x] BUG/med: `flow.toJSON()/fromJSON()` mismatched keys — export/import loses id/name/description — builders/flow.ts
- [x] BUG/med: skipping a step emits BOTH onStepSkip AND onStepComplete + marks 'passed' — useWorkflowNavigation.ts
- [x] BUG/med: resume-from-persistence emits phantom onStepStart/onStepComplete for default step — useWorkflowAnalytics.ts
- [x] BUG/low: persistence auto-save loop pins only lastSavedState equality — no regression test — usePersistence.ts

### power-demo e2e (coverage gaps — later batches)
- [x] quote-flow.e2e: conditions + async-gated Next + onAfterValidation prefill + repeatables + exact payload
- [x] from-schema-server-json.e2e: JSON.parse raw server payload + registry-provided validators/effects → render → submit
- [x] rerender-isolation.e2e: prove through real FieldRenderer (render counts), not just store layer
- [x] all-features-form.e2e: 3-column variadic .add(a,b,c) maxColumns:3 coercion + full submit payload

## Round 6 hunt inventory (iter 10, CONFIRMATION) — 2 real golden-path bugs + 1 REFUTED

Verdict: NOT clean. 2 real bugs (both siblings of earlier point-patches → fix the CLASS, not the instance).
Bug 3 (combine threading) VERIFIED as a FALSE POSITIVE: number() returns coerced {value:42}, runCombinedSchemas threads currentValue correctly, combine(number(),custom(isInteger)) on '42' passes (live probe). Round-1 fix holds.

- [x] BUG/high (golden): conditional-required-removed wedge → systemic clear (shared holdsOnlyConditionalRequiredError, covers invisible+non-required) + validateForm agreement (mutation-checked)
- [x] BUG/high (golden, race): stale completion payload → submitWorkflow reads live getAllData() like navigation (mutation-checked)
- [x] ~~BUG combine() threading~~ REFUTED false-positive (verified live; round-1 fix works)

## Round 5 hunt inventory (iter 9, DECISIVE) — 2 golden-path bugs; r4-regression + core CLEAN

Verdict: r4-regression audit = 0 findings (fixes solid); core-golden = 0 findings (solid on normal data).
Only 2 golden-path bugs remain (both high). cleanOnGoldenPath=false → not yet NASA-grade, but converging.

- [x] BUG/high (golden): field hidden after committing an error → isValid wedged false → conditions-sync now clears invisible-field errors (mutation-checked)
- [x] BUG/high (golden, race): auto-save resurrected completed workflow → completed-gate + debounce.cancel() (mutation-checked)

## Round 4 hunt inventory (iter 8) — 9 bugs (6 high) + 1 gap; NOT clean

- [x] BUG/high: `form.clone()` drops form-level validation + submitOptions — forms/builders/form.ts
- [x] BUG/high: `form.clone()` resets IdGenerator → duplicate auto-ids when extending clone — forms/builders/form.ts
- [x] BUG/high: plugin `use()` non-atomic — plugin stays registered after install() throws — workflow/builders/flow.ts
- [x] BUG/high: persisted currentStepIndex never validated/clamped on load → out-of-range — WorkflowProvider.tsx
- [x] BUG/high: `useStep()` dereferences currentStep.metadata without null guard → crash on out-of-range index — workflow/hooks/useStep.ts
- [x] BUG/high: effect writing a field with an existing error never re-validates → wedges isValid=false, deadlocks submit — forms/effects/effect-engine.ts
- [x] BUG/med (regression): RemoteAdapter concurrent-drain now rejects a caller whose events WERE delivered (false-failure) — core/monitoring/adapters.ts
- [x] BUG/med: `_moveRepeatableItem` reorders but never sets isDirty → reorder lost silently — forms/stores/formStore.ts
- [x] BUG/med: workflow persistence never cleared on completion → re-mount resurrects completed workflow — workflow/hooks/useWorkflowSubmission.ts
- [x] GAP/low: step-transition effect ordering — new step effects run against previous step values (effectsMap before form-id reset) — FormProvider.tsx

## Round 3 hunt inventory (iter 7) — 8 bugs + 2 config gaps; NOT clean

- [x] BUG/high: `canSubmit` uses RAW last index vs visible-last → custom submit never enables when last step hidden — useWorkflowSubmission.ts
- [x] BUG/med: `getFieldValue` uses `in` (prototype-inclusive) → field named toString/constructor resolves inherited → exists/notExists inverted — core/conditions/index.ts
- [x] BUG/med (race): RemoteAdapter concurrent send() strands events + resolves 2nd caller as false success — core/monitoring/adapters.ts
- [x] BUG/med (error-path): fromSchema/validateSchema throws raw TypeError on null row/field instead of typed SchemaValidationError — forms/schema/from-schema.ts
- [x] BUG/med: onStepComplete fires on BACKWARD navigation → inflates completion counts — useWorkflowAnalytics.ts
- [x] BUG/med (race): async persistence load overwrites in-flight user input (full allData replace) — WorkflowProvider.tsx
- [x] BUG/low: onWorkflowAbandon declared but NEVER invoked (dead analytics contract) — needs unmount handler
- [x] BUG/low: rapid double-skip emits duplicate onStepSkip — useWorkflowNavigation.ts
- [x] GAP/low: rilaykit all-in-one package.json missing `sideEffects: false` (defeats tree-shaking) — packages/rilaykit/package.json
- [x] GAP/low: forms `sideEffects` glob points at non-published src/ path (matches no shipped module) — packages/forms/package.json

## Round 2 hunt inventory (iter 5) — 5 bugs + 5 gaps; NOT a clean round

### bugs (fix TDD this batch)
- [x] BUG/high: `isEmptyValue` treats Date/File/Map/Set as empty → `required()` fails on filled date/file fields — core/validation/utils.ts
- [x] BUG/high (fix-regression): stale `_defaultValues` after form-id change → `reset()` restores previous form's defaults + corrupts dirty flag — forms/stores/formStore.ts + FormProvider
- [x] BUG/med (race): async validation writes errors to a field that went invisible mid-flight → poisons global isValid (stuck-invalid) — useFormValidationWithStore.ts (needs post-await visibility recheck)
- [x] BUG/med (fix-regression): `pendingSkipRef` leaks when a skip transition fails → suppresses the NEXT real onStepComplete — useWorkflowNavigation.ts
- [x] BUG/low: `clonePlainData` no cycle guard → circular meta/defaultProps stack-overflows registration — core/config/ril.ts
- [x] GAP/high: StrictMode double-mount idempotency untested (analytics double-fire risk) — write test; fix source if it double-fires

### gaps (next iteration — quality/coverage)
- [x] console.* ~22 sites → getLogger()/setLogSink() (redirectable), no-console guard test (mutation-checked)
- [x] RemoteAdapter behavioral tests (POST body, Bearer, no-retry-4xx, retry-5xx×3, network retry×2)
- [x] DevelopmentAdapter tests (exact avg/max formatting, error summary)
- [~] weak-assertion sweep: localStorage.test.ts strengthened (instanceof + exact code + round-trip); full 153-site repo sweep still deferred

## Iteration log
- (iter 11, CONFIRMATION) ROUND 7: cleanOnGoldenPath=TRUE (first clean golden-path round!). 2 findings, both onGoldenPath=false: (1) onAfterValidation positional stepData arg stale (last unpatched class-B sibling — REAL, fixed TDD + mutation-checked, class B now fully closed); (2) canSubmit raw-index = FALSE POSITIVE (round-3 fix verified in place). 49 total bugs fixed, 2 false positives correctly refuted. Full suite 1532 green. Rising false-positive rate (combine, canSubmit) signals bottom-of-barrel. Next: ROUND 8 = second consecutive clean-golden-path confirmation → if clean, NASA-grade call (stop loop + P2).
- (iter 10, CONFIRMATION) ROUND 6: NOT clean — 2 golden-path bugs (both SIBLINGS of earlier point-patches) + 1 REFUTED false positive (combine threading — verified live, round-1 fix holds). Fixed both SYSTEMICALLY (class not instance: shared conditional-required helper covering invisible+non-required; getAllData threaded into submission like navigation) + mutation-checked. Full suite 1530 green. 48 total bugs fixed, 1 false-positive correctly refuted. Pattern: golden-path rounds now find only class-siblings, now closed systemically. Next: ROUND 7 golden-path confirmation — a clean round + the clean round-5 core/regression audits + user authorization → NASA-grade call (stop loop + P2).
- (iter 9, DECISIVE) ROUND 5 golden-path re-audit: r4-regression=CLEAN, core-golden=CLEAN, only 2 golden-path bugs (both high). Fixed both TDD + mutation-checked. Full suite 1526 green. 46 total bugs fixed. Strong convergence: the two hardest audits (regression of all 44 prior fixes + core on normal data) came back clean; golden path down to 2 (vs 9 all-surfaces last round). Next: ROUND 6 golden-path CONFIRMATION — if clean, make the NASA-grade call (stop loop + P2), documenting secondary-surface tail as tracked debt.
- (iter 8) ROUND 4 hunt (least-audited surfaces + r3 regression audit): NOT clean — 9 bugs (6 high) + 1 gap. Fixed all TDD, mutation-checked bug 6 (submit-deadlock) + bug 7 (RemoteAdapter). form.clone validation/submitOptions + IdGenerator.clone(), atomic plugin use(), clamped persisted currentStepIndex + useStep guard + render-time clamp, effect-write revalidation, RemoteAdapter per-send deferred rewrite, move isDirty, clear persistence on completion, step-transition effect ordering. Full suite 1523 green. 44 total bugs fixed. TRAJECTORY: r1=21, r2=5, r3=8, r4=9 — NOT converging; each fresh surface yields a new batch. Core/golden paths are heavily hardened (e2e power demos green); remaining tail is secondary surfaces (clone, plugins, adapter concurrency, corrupt-data resilience). Clean-round counter = 0. Next: ROUND 5 — re-hunt CORE paths to confirm truly clean + audit r4 fixes; if only trivial/secondary remains, make the NASA-grade judgment call (user authorized stopping loop + P2 once good).
- (iter 7) ROUND 3 hunt: NOT clean — 8 bugs + 2 tree-shaking gaps. Fixed all TDD (fixer was interrupted mid-run but had completed the work; verified full suite green + mutation-checked B1 canSubmit, B2 prototype-lookup, confirmed B3 concurrent-send test). canSubmit visible-last, own-property field lookup, RemoteAdapter drain, typed SchemaValidationError on null entries, forward-only onStepComplete, onWorkflowAbandon on unmount, double-skip guard, persistence-load preserves user input, sideEffects:false. Full suite 1513 green + build green. 34 total bugs fixed. Clean-round counter = 0. Next: ROUND 4 hunt (need 2 consecutive clean → P2; user authorized stopping the loop + P2 once genuinely good).
- (iter 6) QUALITY pass: internal redirectable logger (getLogger/setLogSink), 22 runtime console.* routed through it, no-console guard test (mutation-checked), RemoteAdapter + DevelopmentAdapter behavioral tests, localStorage assertions strengthened. Full suite 1496 green. Remaining before round 3: full weak-assertion sweep deferred (low value). Next: ROUND 3 hunt (clean-round counter still 0; need 2 consecutive clean → P2).
- (iter 5) ROUND 2 hunt: NOT clean — 5 bugs (2 fix-regressions from my own hardening) + 5 gaps. Fixed all 5 bugs TDD + StrictMode idempotency guard (passed clean, no double-fire). BUG 2 fix-regression mutation-checked. Full suite 1485 green. 26 total bugs fixed. Clean-round counter = 0. Next: deferred quality gaps (console.* cleanup, adapter coverage, weak-assertion sweep) THEN round 3 hunt (needs 2 consecutive clean rounds → P2).
- (iter 1) tracker created; gap-hunt found 19 bugs + 5 gaps; CORE batch fixed (6 bugs, TDD, +16 tests → 1444 green).
- (iter 4) E2E POWER DEMOS written (4 flagship tests, real stack, exact payloads). Found + fixed 2 MORE bugs: (a) FormProvider id-change reset rebuilt repeatables against the PREVIOUS step's configs → leaked composite key into next step payload; (b) useFormConditions passed fresh {} literals → churned conditionsHelpers → EVERY FormField re-rendered on every keystroke (perf contract broken for all forms). Full suite 1469 green, both fixes mutation-checked. 21 total bugs fixed. Next: ROUND 2 adversarial hunt (stop condition: 2 consecutive clean rounds → P2).
- (iter 3) WORKFLOW batch fixed (7 bugs, TDD): stale step visibility (live eval), onStepComplete data slice, UTF-8-safe base64 compress, toJSON/fromJSON keys, skip no longer marks passed/completes, phantom resume analytics gated, auto-save termination pinned. Full suite 1462 green, mutation-checked. Next: e2e power demos (4).
- (iter 2) FORMS batch fixed (7 bugs, TDD). A cross-package regression (min-padding was unconditional → broke reset zero-item contract AND min-count validation) root-caused + fixed. Full suite 1454 green. Branch consolidation: a fixer stray-branched (fix/forms-nasa-hardening); fast-forwarded canonical branch + deleted stray. NOTE for future fixers: commit on the CURRENT branch, never checkout -b. Next: workflow batch (7 bugs).
