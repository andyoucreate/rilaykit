# P1 Feature Proof Matrix — Unified Catalog & Headless Chrome

> Phase gate record (Task 19). Every user-facing capability of P1 is pinned by
> at least one exact-assertion, real-store test. `file:testname` points at the
> test that fails if the capability breaks. Proof tests added by this gate live
> in `tests/e2e/proof/`.

## Catalog

| Feature | Proven by |
|---|---|
| catalog: `.component()` register + retrieve + immutability | `packages/core/tests/catalog/component.test.tsx: registers a component retrievable by type`; `component.test.tsx: is immutable — the original instance is untouched` |
| catalog: `.tool()` / `.part()` register + namespace isolation | `packages/core/tests/catalog/tool-part.test.tsx: registers a tool with schema and retrieves it`; `tool-part.test.tsx: registers a part and lists entries by kind`; `tool-part.test.tsx: component, tool and part namespaces do not collide on the same identifier` |
| catalog: duplicate → `DuplicateError`; `replace: true` swaps whole entry | `packages/core/tests/catalog/component.test.tsx: throws DuplicateError on double registration`; `component.test.tsx: replaces the whole entry with replace: true`; `tool-part.test.tsx: throws DuplicateError on tool double registration without replace`; `tool-part.test.tsx: throws DuplicateError on part double registration without replace` |
| catalog: `.renderers()` attaches without touching schemas; `NotFoundError` on unknown key; static key constraint | `packages/core/tests/catalog/use-renderers.test.tsx: attaches renderers to existing entries without touching schemas`; `use-renderers.test.tsx: throws NotFoundError with the namespaced key for unknown entries`; `packages/core/tests/catalog/use-renderers.test-d.tsx: rejects component keys that are not registered` |
| catalog: `.use()` plugin chain | `packages/core/tests/catalog/use-renderers.test.tsx: applies the plugin to the current instance, preserving prior registrations`; `tests/e2e/proof/catalog.proof.e2e.test.tsx: a plugin-registered tool and a hydrated renderer survive the full chain` |
| catalog: `validateProps` success / issues+expectedKeys / no-schema passthrough / `NotFoundError` / async → `ConfigurationError` | `packages/core/tests/catalog/validate-props.test.ts: returns success with the parsed value, not the raw input`; `validate-props.test.ts: returns issues and expectedKeys on invalid props`; `validate-props.test.ts: passes through when the component has no propsSchema`; `validate-props.test.ts: throws NotFoundError with entry-key meta for an unknown component`; `validate-props.test.ts: throws ConfigurationError for async schemas` |
| catalog: propsSchema → renderer ctx type inference (type-level) | `packages/core/tests/catalog/component.test-d.tsx: infers renderer ctx props from the zod schema`; `component.test-d.tsx: accumulates the component map in the instance generic` |
| catalog: `meta` reaches the renderer context | `tests/e2e/proof/catalog.proof.e2e.test.tsx: meta and inferred props flow from registration to the rendered field` |
| catalog: `getStats` flat counts; `validate()` tolerates blueprint entries | `packages/core/tests/catalog/surface.test.ts: getStats counts entries by kind`; `surface.test.ts: validate() accepts renderer-less blueprint entries` |

## Form chrome

| Feature | Proven by |
|---|---|
| form: `<Form of={builder}>` auto-build + `of={config}`; `defaults` seeding | `packages/forms/tests/components/Form.test.tsx: builds from a builder passed via of and seeds defaults`; `Form.test.tsx: accepts a pre-built FormConfiguration passed via of and seeds defaults` |
| form: `Form.Body` bare markup (`data-form-body`/`data-form-row`); render prop `{ rows }`; hidden-field row dropped; repeatable row delegated to `Form.List` | `packages/forms/tests/components/FormBody.test.tsx: renders bare rows and fields by default`; `FormBody.test.tsx: exposes visible rows through the render prop`; `FormBody.test.tsx: drops rows whose only field is hidden`; `packages/forms/tests/components/FormList.test.tsx: renders FormList items from default values alongside static fields` |
| form: `Form.Field` binding (value/onChange/onBlur), error render path, `overrides` precedence, `defaultProps` merge, conditions (visible/disabled/required/readonly), `NotFoundError` ghost field/component | `packages/forms/tests/components/FormField.test.tsx: wires field binding (value/onChange) and entry meta into the renderer`; `FormField.test.tsx: should display validation errors`; `FormField.test.tsx: applies overrides with highest prop precedence`; `tests/e2e/forms/from-schema.e2e.test.tsx: merges schema props with component defaultProps`; `FormField.test.tsx: should expose condition flags and update them when the driving field changes`; `FormField.test.tsx: throws NotFoundError for an unknown field id`; `FormField.test.tsx: should throw NotFoundError when the component has no renderer`; `tests/e2e/proof/form-chrome.proof.e2e.test.tsx: Form.Field resolves a repeatable composite id without an explicit config` |
| form: `Form.Submit` bare + render prop; disabled during async submit; no double-submit | `packages/forms/tests/components/FormSubmit.test.tsx: renders a bare submit button by default`; `FormSubmit.test.tsx: submits the form through the render-prop submit callback`; `FormSubmit.test.tsx: disables the default button while the form is submitting`; `tests/e2e/proof/form-chrome.proof.e2e.test.tsx: double-clicking submit fires onSubmit exactly once` |
| form: `Form.List` default render + add/remove; `min`/`max` bounds drive `canAdd`/`canRemove`; validation inside items; `NotFoundError` ghost id | `packages/forms/tests/components/FormList.test.tsx: renders one item per default entry with an add button (bare default)`; `FormList.test.tsx: exposes items/add/remove through the render prop`; `tests/e2e/proof/form-chrome.proof.e2e.test.tsx: Form.List enforces min/max: remove disabled at min, add disabled at max`; `tests/e2e/forms/from-schema.e2e.test.tsx: validates fields inside repeatable items`; `FormList.test.tsx: throws NotFoundError for an unknown list id` |
| form: validation — mixed zod + built-ins, validateOnBlur/validateOnChange, submit blocked on invalid, error messages exact | `tests/e2e/proof/form-chrome.proof.e2e.test.tsx: submit is blocked while invalid and the exact message renders on blur` (mixed `required()` + zod, exact messages); `tests/e2e/forms/form-validation.e2e.test.tsx: should show errors while typing an invalid value`; `form-validation.e2e.test.tsx: should validate using a Zod schema as Standard Schema` |
| form: effects (`onChange` handler `setValue`/`setProps`) still fire through new chrome | `packages/forms/tests/components/FormField.effects.test.tsx: should update city options when country changes`; `FormField.effects.test.tsx: should reset city value and update options when country changes`; `tests/e2e/forms/from-schema.e2e.test.tsx: effect handler with setValue clears dependent field` |
| form (hardening): all-hidden form contract | `tests/e2e/proof/form-chrome.proof.e2e.test.tsx: a form whose every field is hidden renders an empty body and still submits {}` — engine contract: hidden never-touched fields are absent from the payload; `onSubmit` receives exactly `{}` |

## Flow chrome

| Feature | Proven by |
|---|---|
| flow: `<Flow of>` + `defaults` + `onComplete` exact payload; `defaultStep` passthrough | `packages/workflow/tests/components/Flow.test.tsx: seeds workflow values from defaults`; `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx: completes a 2-step flow and delivers the exact namespaced payload to onComplete`; `packages/workflow/tests/components/Flow.defaultStep.test.tsx: should start at specified defaultStep with Flow component` |
| flow: `Flow.Body` default renders current step form; custom `step.renderer` precedence; render-prop children | `packages/workflow/tests/components/Flow.test.tsx: renders the current step form through FlowBody default`; `Flow.test.tsx: renders the custom step renderer instead of the FormBody default`; `Flow.test.tsx: prefers the custom step renderer over static children`; `Flow.test.tsx: supports the render-prop children with step context` |
| flow: `Flow.Progress` visible-only steps, active index, `goTo` navigates with hidden-step index mapping | `packages/workflow/tests/components/FlowProgress.test.tsx: lists only visible steps with exact active flags, bare default`; `FlowProgress.test.tsx: goTo maps the visible index back to the original index before navigating`; `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx: Progress goTo lands on the right step when a middle step is hidden` (contract: forward `goTo` to a visible unvisited step navigates) |
| flow: `Flow.Next` validates then advances; invalid step blocks; last step triggers `onComplete` | `packages/workflow/tests/components/FlowNav.test.tsx: Next advances to the next step (bare default)`; `tests/e2e/workflow/workflow-with-repeatables.e2e.test.tsx: should block navigation when repeatable fields have validation errors`; `packages/workflow/tests/components/Flow.test.tsx: calls onComplete with the collected data when the last step submits` |
| flow: `Flow.Back` disabled on first step; navigates back; entered values preserved | `packages/workflow/tests/components/FlowNav.test.tsx: bare Flow.Back renders a disabled default button on the first step`; `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx: Back preserves the values typed on the previous step` |
| flow: `Flow.Skip` hidden when disallowed; `allowSkip` boolean; `allowSkip` predicate over `allData` (both truth values); skip advances without validating | `packages/workflow/tests/components/FlowNav.test.tsx: Skip renders when allowSkip is true`; `FlowNav.test.tsx: skipStep resolves false and stays on the step when the allowSkip predicate is false`; `FlowNav.test.tsx: Skip shows and advances when the dynamic allowSkip predicate is true`; `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx: allowSkip predicate flips live when allData changes` |
| flow: cross-step data (`onAfterValidation` + `setStepFields`/`setNextStepFields`) prefills later steps | `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx: onAfterValidation setNextStepFields prefills the next step through the real store`; `packages/workflow/tests/integration/onAfterValidation-navigation.test.tsx: should reproduce the navigation bug when onAfterValidation changes conditions` — the gate proof exposed a real defect (the step transition read a stale `allData` snapshot and wiped same-tick prefills), fixed in `useWorkflowNavigation` via a live `getAllData` accessor |
| flow: conditional steps — hidden step skipped in navigation both directions | `tests/e2e/workflow/workflow-conditions.e2e.test.tsx: should skip hidden steps when navigating forward`; `tests/e2e/workflow/workflow-conditional-steps-navigation.e2e.test.tsx: should keep conditional steps visible when navigating back and forth` |
| flow: workflows containing repeatables still work end-to-end | `tests/e2e/workflow/workflow-with-repeatables.e2e.test.tsx: should add and remove repeatable items within a workflow step`; `workflow-with-repeatables.e2e.test.tsx: should pass structured nested arrays (not flat composite keys) to onWorkflowComplete` |
| flow: persistence save/restore unaffected; analytics `onStepStart`/`onStepComplete` fire | `tests/e2e/workflow/workflow-persistence.e2e.test.tsx: should save workflow state to localStorage`; `workflow-persistence.e2e.test.tsx: should restore workflow state from localStorage on mount`; `tests/e2e/proof/flow-chrome.proof.e2e.test.tsx: analytics onStepStart / onStepComplete fire while navigating with the new chrome` |

## Hooks & errors

| Feature | Proven by |
|---|---|
| hooks: `useForm`/`useFlow`/`useFlowData`/`useStep`/`useFlowSteps`/`useFormRows` return documented shapes; old names absent from surfaces | `packages/workflow/tests/hooks/flow-hooks.test.tsx: exposes flow context, current step and data`; `flow-hooks.test.tsx: useStep reflects the active step and defaults metadata to {}`; `flow-hooks.test.tsx: old names are gone from the public surface`; `packages/workflow/tests/stores/workflowStore.test.tsx: useFlowData should return all data`; `packages/forms/tests/components/form-compound.test.tsx: exports useForm and drops useFormConfigContext`; `packages/forms/tests/components/FormBody.test.tsx: is exported from @rilaykit/forms and returns visible row ids and kinds` (useFormRows); `useFlowSteps` exercised by `packages/workflow/tests/components/FlowProgress.test.tsx: lists only visible steps with exact active flags, bare default` |
| errors: every public throw is a `RilayError` subclass with stable `code` (grep `throw new Error(` in `packages/*/src` → zero) | `tests/e2e/proof/errors.proof.e2e.test.ts: packages/*/src contains zero bare throw new Error(`; class/code contracts: `packages/core/tests/errors.test.ts` — the gate found 24 bare throws left in legacy builders/utils and converted them all to `RilayError` subclasses (messages unchanged). Known pre-P1 exceptions (both predate P1, both carry their own stable `code`, both outside the RilayError hierarchy by prior contract, so converting them would break published behavior): `SchemaValidationError` (forms schema layer) is typed with its own stable `code: 'SCHEMA_VALIDATION_ERROR'` and structured `issues`; `WorkflowPersistenceError` (workflow persistence layer, thrown from the public `persistence/adapters/localStorage.ts`) carries its own stable `code: string`. Both are enumerated in the grep proof's documented-exceptions set |

## Coverage gate

`pnpm vitest run --coverage` — suite: 105 files / 1421 tests pass. Global v8
thresholds (90/85/90/90) are **not met globally** (82.24 L / 72.9 B / 83.23 F /
81.66 S): the shortfall is identical on the pre-gate commit and comes from
pre-P1 legacy modules outside this phase's scope (`core/monitoring/*`,
`workflow/hooks/useWorkflowState.ts`, legacy analytics/condition hooks,
`core/validation/utils.ts`), plus type-only files counted at 0% by `all: true`.
Caveat on `core/monitoring/adapters.ts`: commit 473befa (in P1) did touch it,
but only via a mechanical 3-line throw-conversion (bare `Error` →
`ConfigurationError`) that changes no branches or lines executed and so does not
change its coverage profile; its low coverage predates P1 and is unrelated to
that change.

P1 files themselves meet or exceed the bar — `errors.ts`, `Form.tsx`,
`FormBody`, `FormSubmit`, `FormList(+Item)`, `useFormRows`, `Flow.tsx`,
`FlowBody`, `FlowProgress`, `FlowNav`, `useStep`, `useFlowSteps`,
`create-ril.ts` are at 92-100% on every metric; `config/ril.ts` 97.8 L / 88.6 B.
Holes the gate found in P1 files were closed with proof tests (FormField
composite-key path, analytics callbacks, cross-step prefill). Raising the
legacy modules to threshold is tracked as pre-existing debt, not a P1 gap.
