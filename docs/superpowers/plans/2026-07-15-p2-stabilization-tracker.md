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
- [ ] BUG/high (golden): validator descriptor `{type:'toString'}` → `PARAMETERIZED_BUILTINS[type]` resolves Object.prototype.toString → raw `TypeError: requiredParams is not iterable` instead of SchemaValidationError — compile-form.ts:487 (+ same defect at :513 registry lookup and :830 resolveValidationDescriptor)
- [ ] BUG/med: `validateEffect` truthiness check → handler `'toString'` resolves to Object.prototype.toString → compiles into a silent no-op effect; a non-function binding defers to a runtime TypeError — compile-form.ts:551, :887
- [ ] BUG/low: a step id (or field id) of `__proto__` silently discards that step's compiled defaults — compile-flow.ts

### Batch B — compile-form correctness
- [ ] BUG/high (golden): compileForm/compileFlow return the input schema's `defaultValues` **by reference** — two compiles of the same schema share mutable state — compile-form.ts
- [ ] BUG/med (golden): a null/non-object entry inside a repeatable's `rows` throws a raw TypeError; the guard exists in validateRow/validateField but was omitted in validateRepeatable — compile-form.ts:356-358

### Batch C — builder (P1 code, reachable from P2's untrusted JSON path)
- [ ] BUG/high (golden): a top-level field id equal to a repeatable id compiles cleanly, then `structureFormValues` **silently destroys the whole repeatable array** in the submit payload (two separate ID namespaces in form.validate()) — form.ts:737-759 + repeatable-data.ts:95-103
- [ ] BUG/med (type-safety): `.add()`/`.addSeparateRows()` cross-assign props between sibling component types in a mixed-type call — form.ts

### Batch D — compile-flow diagnostics
- [ ] BUG/med (golden): a step's form-builder failure escapes compileFlow with **no step identity** — compile-flow.ts
- [ ] BUG/med (golden): validateFlowSchema passes unresolvable allowSkip/after bindings that compileFlow then throws on (validation should catch it) — validate-flow-schema.ts
- [ ] BUG/med (golden): step `title` never validated — a title-less backend step compiles into `StepConfig { title: undefined }` — validate-flow-schema.ts

## Iteration log
- (r1) 10 bugs found (7 golden). Prototype-key class identified as systemic (3 instances).
