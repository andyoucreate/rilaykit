# Spec — RilayKit "honest API" refactor (pre-1.0)

## Why

Three e2e hunts surfaced design smells where the library encodes one concept two
different ways, or hides state the user must see. Pre-1.0 is the moment to make
**illegal states unrepresentable** and give each concept **one source of truth**.

Order of work: **#3 (small) → #2 (medium) → #1 (large)**. Each lands red-first,
passes the checker panel, and clears the full gate (2498+ tests, `type-check`)
before the next starts. The zones are independent (no cross-dependency).

---

## #3 — Completion payload is a pure projection of answers

### Problem
`useWorkflowSubmission.submitWorkflow` builds the payload with
`structureWorkflowData(pickVisibleCompletionData(...))`. `pickVisibleCompletionData`
drops **hidden** steps but keeps **skipped-yet-visible** steps, which ship their
seeded defaults (often `{}`). So "user skipped this" and "user filled this" and
"step never existed" collapse into ambiguous payload shapes: a host doing
`'step' in payload` reads a skip as a visit.

### Design
- **Payload = answers only.** A step the user did not answer (skipped, or never
  visible) is **absent** from `completionData`. One encoding of "no answer".
- **Lifecycle travels on a separate channel.** `onComplete` gains a second arg:
  `onComplete(data, meta)` where
  `meta: { visitedSteps: string[]; skippedSteps: string[]; passedSteps: string[] }`.
  Arrays are derived from the `Set`s already in `workflowState` at the boundary
  (insertion order preserved).
- Adding a 2nd arg is **non-breaking** for existing `onComplete(data)` callers.
  Analytics `onWorkflowComplete(id, duration, data)` is unchanged; its `data` is
  now the same pure projection.
- The skipped-step set must be tracked explicitly and threaded to the submission
  boundary (a skip signal already exists for analytics — reuse it; do not invent
  a parallel notion of "skipped").

### Components / reuse
- Extend `pickVisibleCompletionData` (or wrap it) to also drop steps in the
  skipped set — do NOT duplicate the visibility-filter logic.
- `meta` derivation is a small pure helper (`Set → ordered array`), colocated
  with the submission boundary.

---

## #2 — Two-phase validation timing (RHF model), form-level

### Problem
A cluster of per-field/per-form booleans with heterogeneous defaults:
`validateOnChange` (opt-in), `validateOnBlur` (opt-**out**, `!== false` — reads
backwards), `validateOnSubmit`, `debounceMs`. The submit path did not mark fields
`touched`, so `FormField`'s `validateOnChange || touched` gate froze submit errors
(fixed by hand in `c35df61`; this refactor makes the model explicit).

### Design — mirror React Hook Form
Form-level config gains two fields:
- **`mode`**: `'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all'` —
  **default `'onSubmit'`**. Governs when a field first validates.
- **`reValidateMode`**: `'onChange' | 'onBlur' | 'onSubmit'` — **default
  `'onChange'`**. Governs re-validation **after** a field has errored once.
- **Hard-replace**: remove per-field `validateOnChange` / `validateOnBlur` and
  form-level `validateOnSubmit`. One source of truth, no deprecation aliases.
- **Keep `debounceMs` per field** — it controls async cost, orthogonal to timing
  phase.
- The **form-level cross-field validation participates in the same cadence**
  (see #1): it is evaluated per `mode`, re-evaluated per `reValidateMode`.

### Migration
~85 call-sites across `apps/`, `tests/`, `packages/*/tests` plus the readers in
`core/types`, `forms/builders/form.ts`, `forms/schema/*`, `FormField.tsx`. Most
are tests/playground owned here. Migrate all; the old flags stop compiling.

### Components / reuse
- A single `resolveTiming(mode, reValidateMode, hasErrored)` predicate replaces
  the scattered `validateOnChange || touched` / `!== false` checks — one place
  decides "validate on this event?". `FormField` calls it; no duplicated gates.

---

## #1 — One error map keyed by path; `isValid` reads it

### Problem
The error map is already keyed by field id (`_setErrors(fieldId, [...])`), but
`validateForm` only **returns** form-level `formResult.errors` (line ~473) — it
never writes them to the store. So cross-field errors are invisible on fields and
`isValid` (derived live) disagrees with what a submit actually blocks on.

### Design
- **Route every Standard Schema issue by its `path`.** For each issue, build the
  target key from `issue.path` using the existing `buildCompositeKey` convention;
  if the joined path matches a known field id (incl. composite repeatable keys),
  attach the issue there. **Empty/unmatched path → `FORM_LEVEL_ERROR_KEY`**
  (`'__form__'`), a new reserved constant.
- **`isValid` reads the stored map** (all keys incl. `__form__`) — no live
  recompute, no second source of truth.
- **Cadence:** form-level validation runs on the `mode`/`reValidateMode` schedule
  from #2 (unified pipeline), so a cross-field error appears and **clears live**
  as the user fixes it.
- **New hook `useFormErrors()`** exposes the `__form__` bucket for a form-level
  error banner. `useFieldErrors(id)` is unchanged and now also receives routed
  cross-field issues that target that field.

### Components / reuse
- `FORM_LEVEL_ERROR_KEY` constant in core (single definition, imported both
  sides).
- One `routeIssuesToKeys(issues, knownFieldIds)` helper (pure) — used by both the
  live path and the submit path so routing can never diverge.
- Reuse `buildCompositeKey`/`parseCompositeKey`; do not hand-roll key strings.

---

## Implementation conventions (Karl's Code DNA — every subagent gets this)

- **DRY**: one predicate for validation timing (#2), one issue-router (#1), one
  visibility+skip filter (#3). 3+ similar blocks → extract. Reuse
  `buildCompositeKey`, `pickVisibleCompletionData`, the existing skip signal.
- **Elegant / YAGNI**: smallest design that works. No deprecation shims (pre-1.0).
  No config knob nobody asked for.
- **Typed errors**: never `throw new Error`. Use the project error hierarchy /
  Standard Schema issues. **No `console.*`** — `getLogger(scope)`.
- **TypeScript**: `function` for declarations, arrows for callbacks. `unknown`
  over `any`. `mode`/`reValidateMode` are string-literal unions, not `string`.
- **React**: one component per file; derived state + event handlers over
  `useEffect`; no inline styles / hard-coded colors (Tailwind tokens); ref-as-prop.
- **Tests (load-bearing)**: test-first, red for the right reason before green.
  Assert exact behavior (`toBe('A@9')`, not `toBeDefined()`). Error paths are
  first-class. Real code paths — render a renderer that paints
  `field.errors`/`touched`, drive real submit/nav; no store-only theater.
- **Commits**: conventional, one per coherent change (`refactor(forms):`,
  `feat(workflow):`, `fix:`), body explains the *why*. `git commit -F` (never
  `-m` with backticks).

## Green gate (per task)
`pnpm vitest run <impacted>` red→green, then full suite + `pnpm turbo type-check`
+ `pnpm biome check` on touched files. No red tree handed to the next task; no
green tree whose tests don't prove the behavior.
