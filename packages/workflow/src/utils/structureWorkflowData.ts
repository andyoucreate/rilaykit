import type { RepeatableFieldConfig, StepConfig } from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { parseCompositeKey, structureFormValues } from '@rilaykit/forms';

/**
 * A step slice is a plain object keyed by field id. An array or a primitive is
 * not a slice and is carried through untouched.
 */
function isSlice(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defineOwn(table: Record<string, unknown>, key: string, value: unknown): void {
  // A repeatable id is author data: a plain `table[key] = value` routes a
  // `__proto__` key through Object.prototype's accessor, swallowing the entry.
  Object.defineProperty(table, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * The row keys present in a flat slice for one repeatable, in insertion order.
 *
 * This is all the values can ever tell us — a user reorder rewrites the order
 * and nothing else — which is why a mirrored order wins over it when there is
 * one.
 */
function reconstructRowOrder(slice: Record<string, unknown>, repeatableId: string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const key of Object.keys(slice)) {
    const parsed = parseCompositeKey(key);
    if (!parsed || parsed.repeatableId !== repeatableId) continue;
    if (seen.has(parsed.itemKey)) continue;
    seen.add(parsed.itemKey);
    keys.push(parsed.itemKey);
  }

  return keys;
}

/**
 * The repeatable ids a slice's OWN keys prove it holds rows for, in first-seen
 * order.
 *
 * DERIVED, NEVER ASKED OF THE CONFIG. This used to be `Object.keys(configs)`,
 * and that is the whole of the fourth failure: a flat composite key is the
 * STORE's, and a config is the FLOW's, and the flow's step set is live —
 * `createWorkflowStore` takes a `getSteps()` accessor precisely so a recompiled
 * FlowSchema is honoured at once. So the config is not entitled to say which
 * keys are rows: it may never have heard of the step, or may have dropped the
 * repeatable, and the keys are there either way.
 *
 * A composite key is self-describing (`lines[k0].label` names the repeatable,
 * the row and the field), so nothing about it needs a config to be understood.
 * The config, WHEN there is one, is a refinement and nothing more — it orders
 * the fields within a row (see `structureFormValues`, which carries over every
 * key the template does not name regardless).
 */
function repeatableIdsInSlice(slice: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const key of Object.keys(slice)) {
    const parsed = parseCompositeKey(key);
    if (!parsed || seen.has(parsed.repeatableId)) continue;
    seen.add(parsed.repeatableId);
    ids.push(parsed.repeatableId);
  }

  return ids;
}

/**
 * What a repeatable's rows are structured against when the flow no longer
 * declares it — a step a recompile dropped, or a repeatable it renamed.
 *
 * An empty template, not a guess: `structureFormValues` uses `allFields` only to
 * put a row's KNOWN fields first, then carries over every remaining composite
 * key of that row anyway. With nothing declared, every field is carried over and
 * the row's fields land in the order the slice holds them — which is the order
 * they were written in. No value is invented and none is dropped.
 */
function orphanedRepeatableConfig(id: string): RepeatableFieldConfig {
  return { id, rows: [], allFields: [] };
}

/**
 * Rewrites one step slice from the store's internal flat composite keys back
 * into the AUTHORED shape a host expects (`lines: [{label:'a'}]`).
 *
 * THE INVARIANT
 * -------------
 * Inside the workflow store, a step slice is ALWAYS flat composite keys for
 * repeatables. Structuring to the authored shape happens at EVERY host-facing
 * boundary, and flattening happens at EVERY host-authored write. No third
 * representation, no exceptions.
 *
 * WHY: `_removeFieldValues` deletes flat keys. A row that also lives inside a
 * raw authored array is unreachable to it — it survives the user's delete, is
 * submitted to the backend, and is resurrected on step re-entry. Two shapes in
 * one slice IS the bug. It has re-entered twice, each time through a boundary
 * nobody had enumerated, so the boundaries are named exhaustively:
 *
 *   WRITES — the STORE flattens, at EVERY write, with NO exempt action, so there
 *   is no door to forget: `createWorkflowStore`'s `normalizeSlice` covers
 *   `_setStepData`, `_setAllData`, `_setFieldValue`, `_loadPersistedState` and
 *   the seeded defaults alike. `_setFieldValue` was exempt once, on the ground
 *   that "the form reports composite key ids" — true of the FORM's calls and
 *   false of the PUBLIC `useFlowActions().setFieldValue`, through which the
 *   class re-entered a fifth time. An invariant with an exception is not an
 *   invariant. Guarding the callers instead is what failed twice; the callers
 *   are only listed here to show WHY that never worked:
 *     - authored `defaultValues` at store creation
 *     - the form's own submit, the context's `setStepData`, and every
 *       `StepDataHelper` mutator handed to `onAfterValidation`
 *       (`setStepData`/`setStepFields`/`setNextStepField`/`setNextStepFields`) —
 *       these usually name ANOTHER step, so the target step's config is what
 *       decides, not the current one's
 *     - a persistence restore
 *     - the PUBLIC `useFlowActions().setStepData` / `.setAllData` /
 *       `.setFieldValue` — raw store actions this provider never sees
 *
 *   NOT A WRITE DOOR — `_removeFieldValues` only DELETES keys from a slice, so
 *   it cannot introduce a second representation whatever it is handed, and it is
 *   not on the `useFlowActions()` surface (the form's own row removal is its
 *   only caller). It is the reason the invariant exists, not a way past it.
 *
 *   The enumeration above is prose and prose rots. What actually closes the
 *   class is the store-level test that walks EVERY action `useFlowActions()`
 *   exports and drives each with an authored array
 *   (packages/workflow/tests/stores/store-enforces-flat-shape.test.tsx): a new
 *   action added without normalisation fails there, unread comment or not.
 *
 *   FLAT IS NOT THE WHOLE INVARIANT — the row KEYS matter too, and that
 *   enumeration cannot see them: it asserts the shape that comes out, and a door
 *   that flattens to the wrong keys passes it. The store's row-order mirror
 *   (`_repeatableOrders`) is closed separately, by
 *   packages/workflow/tests/stores/store-enforces-order-mirror.test.tsx.
 *
 *   NOR IS THE SHAPE THE WHOLE INVARIANT — the step the slice is FILED UNDER
 *   matters too, and neither enumeration above can see that: both drive a live
 *   step, and the store's step set is not. A slice whose step is gone was the
 *   fourth failure of this class (see {@link structureWorkflowData}). It is
 *   closed by packages/workflow/tests/stores/store-enforces-step-identity.test.tsx,
 *   which does NOT list the step-keyed state by hand — it derives the list from
 *   a real store at runtime, so a new map keyed by step id fails there the day
 *   it is added rather than the day it leaks.
 *
 *   READS (structure, here and in {@link structureWorkflowData}) — unlike the
 *   writes, these are still an ENUMERATED list, because a read door that leaks
 *   FLAT to a host is invisible to an invariant that demands flat. Every host
 *   callback receives the AUTHORED shape:
 *     - the completion payload (`useWorkflowSubmission`)
 *     - `onAfterValidation`'s `data` param AND the helper's `getStepData` /
 *       `getAllData` — one invocation, one shape
 *     - `analytics.onStepComplete` / `onWorkflowComplete` / `onWorkflowAbandon`
 *     - `WorkflowContext.allData` / `.stepData` — built once in
 *       WorkflowProvider's `baseWorkflowContext` and handed to `onStepChange`,
 *       to `onAfterValidation`'s THIRD param, and to every analytics callback.
 *       It spoke flat while the `data` param beside it spoke authored: the same
 *       "two representations in one invocation" the helper's readers were fixed
 *       for, on the parameter next door. Nothing internal reads it — the
 *       conditions and `resolveAllowSkip` go to the store directly — so it owes
 *       the host contract and nothing else.
 *
 *   DELIBERATELY FLAT (the store's live view, not the host contract):
 *     - `useFlow().workflowState.allData` / `.stepData`, `useFlowData()`,
 *       `useStepData()`, `useStepDataById()` — the escape hatch, and the only
 *       way to observe the store as it is
 *     - `useFlowStoreApi()` — the raw store. Its `setState` bypasses the actions
 *       and therefore the invariant; write through `useFlowActions()`.
 *     - the persistence snapshot handed to an adapter — a round-trip format,
 *       normalised again on restore
 *
 * The whole class is pinned end-to-end by
 * tests/e2e/proof/shape-boundary.lifecycle.e2e.test.tsx, which asserts the
 * store holds one shape at every commit rather than trusting each boundary.
 *
 * A repeatable with no rows in the slice is left out entirely rather than
 * emitted as `[]`: the slice is the record of what the step HAS, and inventing
 * a key for a step the user never reached would put it in the payload. This now
 * falls out of the derivation rather than being a rule — a repeatable with no
 * rows contributes no key for {@link repeatableIdsInSlice} to find.
 */
export function structureStepSlice(
  slice: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig> | undefined,
  mirroredOrder?: Record<string, string[]>
): Record<string, unknown> {
  const order: Record<string, string[]> = {};
  const activeConfigs: Record<string, RepeatableFieldConfig> = {};

  // The SLICE names the repeatables, not the config. A slice with no composite
  // keys yields nothing here and keeps its identity below — including a slice
  // from a step that declares no repeatable at all, which is the overwhelmingly
  // common case and the one the old `if (!repeatableConfigs) return slice` was
  // really serving. It served the leak in the same breath.
  for (const id of repeatableIdsInSlice(slice)) {
    // Non-empty by construction: the id came from a row key of this slice.
    const reconstructed = reconstructRowOrder(slice, id);
    const config = repeatableConfigs ? getOwn(repeatableConfigs, id) : undefined;

    // THE ONLY PATH A USER'S REORDER HAS TO THE HOST. A move rewrites the order
    // and nothing else — the values cannot tell us the user dragged `beta` above
    // `alpha` — so dropping the mirror here does not degrade the payload, it
    // silently submits the arrangement the user explicitly rejected. Pinned by
    // `a user reorder reaches the completion payload` in
    // packages/workflow/tests/stores/store-enforces-order-mirror.test.tsx.
    //
    // A captured order may only re-sequence rows that actually resolved: it can
    // never resurrect a row whose values are gone (the user deleted it), and a
    // row it does not mention keeps its reconstructed position at the end. That
    // tolerance is a backstop, NOT the contract — the store reconciles the
    // mirror to the keys each write assigns, so a stale claim does not reach
    // here in the first place. See `WorkflowStoreState._repeatableOrders`.
    const captured = mirroredOrder ? getOwn(mirroredOrder, id) : undefined;
    const resolved = captured
      ? [
          ...captured.filter((key) => reconstructed.includes(key)),
          ...reconstructed.filter((key) => !captured.includes(key)),
        ]
      : reconstructed;

    defineOwn(order, id, resolved);
    defineOwn(activeConfigs, id, config ?? orphanedRepeatableConfig(id));
  }

  if (Object.keys(activeConfigs).length === 0) return slice;

  return structureFormValues(slice, activeConfigs, order);
}

/**
 * Structures every step slice of a workflow `allData` on its way out to the
 * host — the completion payload and the step data handed to `onAfterValidation`.
 *
 * ITERATES THE DATA, NOT THE STEPS — the fourth failure of the class, and the
 * reason the loop reads the way it does.
 *
 * It used to seed its output with EVERY slice in `allData` and then walk
 * `steps`, structuring the slice each one named. A slice whose step was not in
 * that list was therefore never visited and passed through VERBATIM — the
 * store's internal flat composite keys, in the host's completion payload and in
 * `onAfterValidation`. "The steps are the slices" is true of a store whose step
 * set never moves, and this store's does: `getSteps()` is an accessor so that a
 * host recompiling a FlowSchema is honoured at once (see
 * `CreateWorkflowStoreOptions.getSteps`), and `useFlowActions().setStepData
 * (data, stepId)` takes any step id at all. A step filled and then dropped —
 * a recompile, a rename, a persisted session restored into a newer schema —
 * leaves exactly such a slice behind.
 *
 * SO THE ORPHAN IS STRUCTURED, NOT DROPPED AND NOT INSPECTED. The host authored
 * that data and a removed step's answers are still its answers, so losing them
 * would be a defect of its own; but the internal keys are NEVER part of the
 * contract, so passing them through is not an option either. Structuring is
 * available without the config — a composite key is self-describing — so there
 * is no tradeoff to make: the orphan comes out in the authored shape, with the
 * user's arrangement applied, exactly as it would have while its step was live.
 * See {@link repeatableIdsInSlice}.
 *
 * A slice with no composite keys keeps its identity, so a step that declares no
 * repeatable costs one key scan and changes nothing.
 */
export function structureWorkflowData(
  allData: Record<string, unknown>,
  steps: ReadonlyArray<StepConfig>,
  repeatableOrders?: Record<string, Record<string, string[]>>
): Record<string, unknown> {
  const structured = new Map<string, unknown>(Object.entries(allData));
  let changed = false;

  // A Map, and keyed off the steps only to LOOK UP a config: a step id is
  // author data, and `configs['__proto__']` on a plain object would resolve an
  // inherited value rather than miss.
  const configsByStepId = new Map<string, Record<string, RepeatableFieldConfig> | undefined>();
  for (const step of steps) {
    configsByStepId.set(step.id, step.formConfig?.repeatableFields);
  }

  for (const [stepId, slice] of Object.entries(allData)) {
    if (!isSlice(slice)) continue;

    const out = structureStepSlice(
      slice,
      configsByStepId.get(stepId),
      repeatableOrders ? getOwn(repeatableOrders, stepId) : undefined
    );
    if (out === slice) continue;

    structured.set(stepId, out);
    changed = true;
  }

  // The accumulator is a Map: a step id is data, and a plain
  // `structured['__proto__'] = slice` would reassign the prototype instead of
  // recording the key, silently dropping that step from the payload.
  return changed ? Object.fromEntries(structured) : allData;
}
