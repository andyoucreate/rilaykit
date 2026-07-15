# Migrating to RilayKit 0.2

RilayKit 0.2 removes the renderer-configuration layer entirely. You now compose
markup with compound headless components; the `ril` instance is a pure catalog.

## Catalog

| 0.1 | 0.2 |
|---|---|
| `ril.create().addComponent('text', { name, renderer })` | `ril.create().component('text', { renderer })` |
| `renderer: ({ id, value, onChange, props }) => …` | `renderer: ({ id, props, field }) => …` (`field.value`, `field.onChange`, `field.onBlur`, `field.error`) |
| `.configure({ rowRenderer, bodyRenderer, … })` | deleted — write markup in `Form.Body`/`Flow.*` render props |
| `builder:` metadata on components (`ComponentBuilderMetadata`) | `propsSchema` (zod / any Standard Schema) + `meta` |
| — | `.tool(name, entry)` / `.part(type, entry)` — namespaced catalog entries alongside components |
| — | `.renderers({ components, tools, parts })` — attach or override renderers on already-registered entries |
| — | `.use(plugin)` — apply a `RilayPlugin` to the catalog |
| — | `.validateProps(type, props)` — validate props against a component's `propsSchema` |

Every registration returns a NEW immutable instance; duplicate registrations throw
`DuplicateError` unless the entry sets `replace: true` (which swaps the whole entry).

## Forms

| 0.1 | 0.2 |
|---|---|
| `<Form formConfig={f} defaultValues={d}>` | `<Form of={f} defaults={d}>` (`of` also accepts a form builder — auto-built) |
| `<FormBody />` + `bodyRenderer`/`rowRenderer` | `<Form.Body>{({ rows }) => …}</Form.Body>` (bare `<Form.Body />` renders default markup) |
| `<FormRow>` | deleted — row markup is app-side via the `Form.Body` render prop |
| `<FormField fieldId="x" customProps={p} />` | `<Form.Field id="x" overrides={p} />` |
| `<FormSubmitButton>` + `submitButtonRenderer` | `<Form.Submit>{({ submitting, submit }) => …}</Form.Submit>` |
| `<RepeatableField />` / `<RepeatableItem />` | `<Form.List id="x">{({ items, add, remove, move, canAdd, canRemove }) => …}</Form.List>` |
| `useFormConfigContext()` | `useForm()` |

## Styling hooks

Bare defaults ship a coherent data-attribute system — style them without wrappers:
`[data-form-body]`, `[data-form-row]`, `[data-form-submit]`, `[data-form-list]`,
`[data-form-list-item]`, `[data-form-list-add]`, `[data-field-id]`
(+ `data-field-type`, `data-field-visible`, `data-field-disabled`,
`data-field-required`, `data-field-readonly` state attrs),
`[data-flow-progress]` (+ `data-active` per step) and
`[data-flow-nav="next|back|skip"]`.

## Workflows → Flows

### Components

| 0.1 | 0.2 |
|---|---|
| `<Workflow workflowConfig={wf} defaultValues={d}>` | `<Flow of={wf} defaults={d} onComplete={fn}>` (`of` also accepts a flow builder — auto-built) |
| `<WorkflowBody />` | `<Flow.Body>{({ step }) => …}</Flow.Body>` (bare default renders the current step's form) |
| `<WorkflowStepper />` | `<Flow.Progress>{({ steps, currentIndex, goTo }) => …}</Flow.Progress>` |
| `<WorkflowNextButton />` | `<Flow.Next>{({ go, canGo, submitting, isLastStep, step }) => …}</Flow.Next>` |
| `<WorkflowPreviousButton />` | `<Flow.Back>` (same render-prop context as `Flow.Next`) |
| `<WorkflowSkipButton />` | `<Flow.Skip>` (renders `null` while the current step is not skippable) |

### Hooks

| 0.1 | 0.2 |
|---|---|
| `useWorkflowContext` | `useFlow` |
| `useWorkflowAllData` | `useFlowData` |
| `useWorkflowStepData` | `useStepData` |
| `useWorkflowActions` | `useFlowActions` |
| `UseWorkflowActionsResult` (type) | `UseFlowActionsResult` |
| `useWorkflowStore` | `useFlowStore` |
| `useWorkflowStoreApi` | `useFlowStoreApi` |
| `useCurrentStepIndex` | `useFlowStepIndex` |
| `useWorkflowNavigationState` | `useFlowNavigationState` |
| `useWorkflowSubmitState` | `useFlowSubmitState` |
| `useWorkflowSubmitting` | `useFlowSubmitting` |
| `useWorkflowTransitioning` | `useFlowTransitioning` |
| `useWorkflowInitializing` | `useFlowInitializing` |
| — | `useStep()` — `{ step, index, metadata }` for the current step |
| — | `useFlowSteps()` — `{ steps, currentIndex, goTo }` over VISIBLE steps |

Unchanged: `useVisitedSteps`, `usePassedSteps`, `useIsStepVisited`, `useIsStepPassed`,
`useStepDataById`, `usePersistence`, `useWorkflowAnalytics`.

### `allowSkip` predicate

`allowSkip` on a step accepts a boolean or a predicate over the accumulated flow data:

```tsx
.step({
  id: 'profile',
  title: 'Profile',
  formConfig: profileForm,
  allowSkip: ({ allData }) => allData.account?.plan === 'free',
})
```

### Metadata smuggling → first-class composition

| 0.1 smuggling | 0.2 replacement |
|---|---|
| `metadata.hideNextButton` | conditional render around `<Flow.Next>`: `{step.id !== 'review' && <Flow.Next />}` |
| `metadata.skipVisible` | `allowSkip: ({ allData }) => …` (`<Flow.Skip>` auto-hides when not skippable) |
| `metadata.submitLabel` | render-prop children: `<Flow.Next>{({ isLastStep, go }) => <button onClick={go}>{isLastStep ? 'Finish' : 'Next'}</button>}</Flow.Next>` |

Step `metadata` still exists for app-specific data and is exposed through `useStep().metadata`.

## Monitoring

| 0.1 | 0.2 |
|---|---|
| `import { LocalStorageAdapter } from '@rilaykit/core'` | `import { LocalStorageMonitoringAdapter } from '@rilaykit/core'` |
| `new LocalStorageAdapter(1000)` | `new LocalStorageMonitoringAdapter(1000)` |

Core's monitoring adapter — the one that buffers monitoring EVENTS — is renamed.
It collided with `@rilaykit/workflow`'s `LocalStorageAdapter`, which persists
workflow STATE: two different classes under one name. The all-in-one `rilaykit`
package re-exports both, so the collision made its CommonJS bundle throw on
`require()` and let one adapter silently shadow the other in the type surface.

**Only core's monitoring adapter is renamed.** Workflow persistence is untouched
— `import { LocalStorageAdapter } from '@rilaykit/workflow'` still works, and
`rilaykit` exports both names side by side.

## Errors

`RilayError.code` values changed: `VALIDATION_ERROR` → `VALIDATION`,
`DUPLICATE_ID_ERROR` → `DUPLICATE`; new codes `NOT_FOUND`, `INVALID_SCHEMA`, `CONFIGURATION`.
Every error thrown by the library is a `RilayError` subclass
(`ValidationError`, `DuplicateError`, `NotFoundError`, `InvalidSchemaError`,
`ConfigurationError`) carrying a `meta` payload (e.g. the namespaced catalog key).
