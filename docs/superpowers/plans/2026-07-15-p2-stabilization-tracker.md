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
