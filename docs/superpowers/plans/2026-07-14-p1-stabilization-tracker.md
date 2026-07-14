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
- [ ] `.component/.tool/.part` deep immutability under mutation of a shared entry object
- [ ] `.renderers()` partial attach (some keys valid, one invalid) — atomicity (no partial mutation)
- [ ] `validateProps` with non-zod Standard Schema (valibot-shape) + async-guard + nested objects
- [ ] `.use()` plugin composition order + a plugin that calls `.renderers()`
- [ ] Duplicate `replace:true` across kinds; cross-kind same-id isolation under stress
- [ ] `getComponent` generic inference edge cases (union component maps)

### Forms
- [ ] Deeply nested repeatables data structuring / flatten round-trip fidelity
- [ ] Conditional required + validation interaction (the MEMORY.md no-op validator caveat)
- [ ] `Form.Field` overrides precedence full matrix (defaultProps < config < dynamic < overrides < conditions)
- [ ] Async validation race (debounce + rapid change + blur) determinism
- [ ] Effects: chained effects, effect that sets a field which triggers another effect
- [ ] Submit with `force`/`skipInvalid` options end-to-end
- [ ] compileForm/fromSchema hostile inputs (unknown component type, malformed rows)

### Workflow
- [ ] Persistence save/restore round-trip with repeatables + conditional steps
- [ ] Persistence `useEffect` stability — no infinite loop when persistence enabled (MEMORY.md)
- [ ] Conditional-step navigation: all-hidden middle, first step hidden, last step hidden
- [ ] `onAfterValidation` that changes a later step's visibility mid-navigation
- [ ] `setNextStepFields`/`setStepFields` cross-step under skip + back + forward
- [ ] Analytics full lifecycle (start/complete/skip/abandon/error) exact ordering
- [ ] Flow with a single step; flow with zero visible steps (degenerate)

### Integration / e2e (power demos)
- [ ] A real "quote flow"-style multi-step form (mirrors lilycare) end-to-end
- [ ] A server-JSON-driven form compiled + rendered + submitted (mirrors stndrds subscription)
- [ ] Full form: 3-column rows, conditions, async validation, repeatables, submit payload exact
- [ ] Rerender-isolation: typing in one field does not re-render sibling fields (perf contract)

### Cross-cutting
- [ ] No `any` anywhere in `packages/*/src` (grep gate as a test)
- [ ] Every public export has at least one test touching it (export-surface audit)
- [ ] All error paths throw the correct RilayError subclass + code (extend the proof)
- [ ] Concurrent/StrictMode double-invoke safety for providers

## Bug inventory (found by adversarial hunt, iter 1) — TDD-fix each: red → fix → green

### core (fix this batch)
- [ ] BUG/high: `evaluateCondition` `matches` throws on invalid regex (non-total) + drops regex flags — conditions/index.ts
- [ ] BUG/high: catalog entries shallow-copied — nested `meta`/`defaultProps`/`validation` leak by reference — config/ril.ts
- [ ] BUG/high: `combine()`/`combineSchemas()` declared `async` → always Promise → validateProps rejects sync combined schemas — validators.ts + unified-utils.ts
- [ ] BUG/med: `combine()` doesn't thread transformed values (each sub-schema sees original input) — validators.ts
- [ ] BUG/med: `number()`/`min()`/`max()` coerce ''/'   '/[]/'0x10' to numbers — validators.ts
- [ ] BUG/med: `notContains` returns false (not vacuously true) for non-string/array field value — conditions/index.ts

### forms (next batch)
- [ ] BUG/high: async validation has no sequence/cancellation guard — stale result overwrites current — useFormValidationWithStore.ts
- [ ] BUG/high: `validation.debounceMs` accepted+resolved but never consumed (silent no-op) — form.ts / validation pipeline
- [ ] BUG/high: `reset()` wipes `_repeatableOrder`/`_repeatableNextKey`, repeatable rows vanish — formStore.ts
- [ ] BUG/med: `flattenRepeatableValues` throws on null/non-object item — hostile defaultValues — repeatable-data.ts
- [ ] BUG/med: async chained effects can infinite-loop (cycle detection only sync) — effect-engine.ts
- [ ] BUG/med: validation reads field conditions from React state not live store (stale) — useFormValidationWithStore.ts
- [ ] BUG/low: flatten/structure round-trip drops item fields outside template — repeatable-data.ts

### workflow (next batch)
- [ ] BUG/high: onStepChange stale visibility when onAfterValidation flips a later step mid-nav — useWorkflowNavigation.ts
- [ ] BUG/high: analytics onStepComplete receives NEW step's stepData not the completed step's — useWorkflowAnalytics.ts
- [ ] BUG/high: LocalStorage compress:true throws on non-Latin1 (accents/emoji) — persistence/adapters/localStorage.ts
- [ ] BUG/med: `flow.toJSON()/fromJSON()` mismatched keys — export/import loses id/name/description — builders/flow.ts
- [ ] BUG/med: skipping a step emits BOTH onStepSkip AND onStepComplete + marks 'passed' — useWorkflowNavigation.ts
- [ ] BUG/med: resume-from-persistence emits phantom onStepStart/onStepComplete for default step — useWorkflowAnalytics.ts
- [ ] BUG/low: persistence auto-save loop pins only lastSavedState equality — no regression test — usePersistence.ts

### power-demo e2e (coverage gaps — later batches)
- [ ] quote-flow.e2e: conditions + async-gated Next + onAfterValidation prefill + repeatables + exact payload
- [ ] from-schema-server-json.e2e: JSON.parse raw server payload + registry-provided validators/effects → render → submit
- [ ] rerender-isolation.e2e: prove through real FieldRenderer (render counts), not just store layer
- [ ] all-features-form.e2e: 3-column variadic .add(a,b,c) maxColumns:3 coercion + full submit payload

## Iteration log
- (iter 1) tracker created; gap-hunt found 19 bugs + 5 gaps; fixing core batch (6 bugs) TDD.
