import type { StepConfig } from '@rilaykit/core';
import { evaluateConditionLive, pickVisibleSubmitValues } from '@rilaykit/forms';
import { combineWorkflowDataForConditions } from './dataFlattening';

/**
 * A step slice is a plain object keyed by field id. An array or a primitive is
 * not a slice and is carried through untouched.
 */
function isSlice(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drops CURRENTLY-HIDDEN steps and fields from the workflow data on its way
 * into the COMPLETION payload — the flow-side half of the payload visibility
 * contract (`pickVisibleSubmitValues` is the form-side half, and this reuses
 * it per step).
 *
 * WHY: the store seeds every step's compiled defaults into `allData` at
 * creation, visibility notwithstanding — one internal shape, deliberately. But
 * validation and navigation already treat an invisible step/field as
 * NONEXISTENT, and the completion payload must agree: a hidden step's
 * defaulted field arriving in `onWorkflowComplete` is an answer to a question
 * the user was never asked, byte-identical to a real one.
 *
 * Visibility is evaluated LIVE, against the same combined data the render-time
 * `useWorkflowConditions` uses (all-step bare names + nested + dot-qualified
 * paths, current step's slice on top) — the caller reads both inputs from the
 * live store because a completion runs inside the submit tick, before any
 * React commit refreshes a snapshot.
 *
 * Per visible step, field conditions are evaluated with the SAME own-name
 * scoping FormProvider applies while the step is mounted: every bare name the
 * step's form declares answers from that step's own slice alone, and the
 * combined data fills only the names it does not own.
 *
 * ONLY the completion boundary: `onAfterValidation`'s data and
 * `WorkflowContext.allData` describe a flow in progress, where a hidden step's
 * slice is still the store's live state. A slice whose step is no longer in
 * the config (an orphan a recompile left behind) has no conditions to consult
 * and passes through untouched, exactly as {@link structureWorkflowData}
 * treats it.
 *
 * A SKIPPED step is dropped on the SAME terms as a hidden one — the payload is
 * a pure projection of answers, and a skip is "no answer" just as invisibility
 * is. `skippedStepIds` is the store's persistent skipped set at the boundary;
 * a step it names is deleted before its visibility is even consulted (a skipped
 * step is by definition one the user bypassed without answering).
 */
export function pickVisibleCompletionData(
  allData: Record<string, unknown>,
  steps: ReadonlyArray<StepConfig>,
  stepData: Record<string, unknown>,
  skippedStepIds: ReadonlySet<string> = new Set()
): Record<string, unknown> {
  const conditionData = combineWorkflowDataForConditions(allData, stepData);

  // A Map accumulator: a step id is author data, and deleting/setting
  // `__proto__` on a plain object would hit the prototype accessor instead.
  const picked = new Map<string, unknown>(Object.entries(allData));
  let changed = false;

  for (const step of steps) {
    if (!picked.has(step.id)) continue;

    // A skipped step ships no slice — one encoding of "no answer", shared with
    // the hidden case below.
    if (skippedStepIds.has(step.id)) {
      picked.delete(step.id);
      changed = true;
      continue;
    }

    if (
      step.conditions?.visible &&
      !evaluateConditionLive(step.conditions.visible, conditionData)
    ) {
      // The whole slice is a step the user never reached (or that stands
      // retracted): none of its keys may enter the payload.
      picked.delete(step.id);
      changed = true;
      continue;
    }

    const slice = picked.get(step.id);
    if (!step.formConfig || !isSlice(slice)) continue;

    // Mirror FormProvider's own-name scoping: bare names this step's form owns
    // answer from its own slice only; the combined data fills the rest
    // (qualified `stepA.fieldX` paths, other steps' bare names).
    const ownFieldIds = new Set<string>([
      ...step.formConfig.allFields.map((field) => field.id),
      ...Object.keys(step.formConfig.repeatableFields ?? {}),
    ]);
    const external: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(conditionData)) {
      if (!ownFieldIds.has(key)) {
        external[key] = value;
      }
    }

    const { values } = pickVisibleSubmitValues(slice, step.formConfig, {
      ...external,
      ...slice,
    });
    if (values !== slice) {
      picked.set(step.id, values);
      changed = true;
    }
  }

  return changed ? Object.fromEntries(picked) : allData;
}
