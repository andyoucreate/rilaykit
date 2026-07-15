# P2 Stabilization Tracker — "NASA-grade" (schema layer)

> Same discipline as the P1 campaign (50 bugs, 8 rounds): hunt real gaps → TDD fix → mutation-check →
> commit → tick. Stop condition: `cleanOnGoldenPath` for 2 consecutive rounds, then launch P3.

## Baseline (2026-07-15)
- P2 shipped: compileForm + bindings + inline defaults, FieldConfigFor<C>, FlowSchema/compileFlow/validateFlowSchema.
- 158 files / 1611 tests green, type-check 4/4, build 6/6. Suite is deterministic (wall-clock assertions de-flaked).

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
- (r1) 10 bugs found (7 golden), ALL REAL (zero false positives). Fixed TDD in 4 batches; ID-collision + prototype-guard mutation-checked. Full gate green: 160 files / 1662 tests (+51), type-check 4/4, build 6/6.
  - The prototype-key class was fixed SYSTEMICALLY: new `getOwn`/`hasOwn` primitive (core/utils/ownProperty.ts); module-owned tables → Map; consumer-owned (bindings) → own-property guard; untrusted-id accumulators → Map + Object.fromEntries. The audit found **6 MORE instances** beyond the 3 reported, incl. a hard crash (`effectsMap['toString'].push is not a function`) and the exact P1 `getFieldValue` defect recurring at repeatable-data.ts:89.
  - #7 (mixed-type props) taught a real lesson: the obvious fix (`FieldConfigFor<C>` per arg) type-checked and passed all package tests but broke EVERY playground call site — `ril.create()` carries a string index signature that collapses `keyof C & string`→`string`. Only the full `pnpm build` caught it. Shipped fix infers a tuple of component-type keys per argument instead.
  - Residual, deliberately deferred (P1 store surface, needs a prototype policy for the whole Zustand values object, not a half-fix): `flattenRepeatableValues` WRITE side still reassigns the prototype for a `__proto__` key.
