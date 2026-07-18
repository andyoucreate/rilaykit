import type {
  ConditionBuilder,
  ConditionConfig,
  ConditionalBehavior,
  FormConfiguration,
  RepeatableFieldConfig,
} from '@rilaykit/core';
import { evaluateCondition, getOwn } from '@rilaykit/core';
import { defineOwn, parseCompositeKey } from './repeatable-data';
import { scopeConditions } from './scope-conditions';

/**
 * THE ONE VISIBILITY EVALUATOR for everything that treats an invisible field as
 * nonexistent. Validation established the contract (an invisible field is
 * excluded from `validateForm` and its errors force-cleared); the submit
 * boundaries enforce the SAME contract on the payload (a currently-hidden
 * field's value must not ship), so they must share one resolution + evaluation
 * or the two would eventually disagree about what "hidden" means. These
 * functions are the extraction of `useFormValidationWithStore`'s hook-internal
 * helpers into pure, config-parameterised form; the hook delegates to them.
 */

/**
 * Evaluate a single condition against form data, returning false on error.
 */
export function evaluateConditionLive(
  condition: ConditionConfig | ConditionBuilder,
  formData: Record<string, unknown>
): boolean {
  try {
    if (typeof condition === 'object' && condition && 'build' in condition) {
      return evaluateCondition(condition.build(), formData);
    }
    return evaluateCondition(condition, formData);
  } catch {
    return false;
  }
}

function evaluateTemplateVisibleCondition(
  condition: ConditionConfig | ConditionBuilder | undefined,
  formData: Record<string, unknown>
): boolean {
  if (!condition) return true;
  return evaluateConditionLive(condition, formData);
}

/**
 * Whether a repeatable is EFFECTIVELY visible: at least one of its template
 * fields' visible conditions holds (template-level, unscoped — the same
 * measure min-count validation uses).
 */
export function isRepeatableVisible(
  config: RepeatableFieldConfig,
  formData: Record<string, unknown>
): boolean {
  return config.allFields.some((field) =>
    evaluateTemplateVisibleCondition(field.conditions?.visible, formData)
  );
}

/**
 * Resolve a field's conditional behavior from the live config — a static field
 * by id, or a repeatable template field via its composite key, with the
 * template's conditions scoped to the concrete item.
 */
export function resolveFieldConditionalBehavior(
  formConfig: FormConfiguration,
  fieldId: string
): ConditionalBehavior | undefined {
  const staticField = formConfig.allFields.find((f) => f.id === fieldId);
  if (staticField) return staticField.conditions;

  const parsed = parseCompositeKey(fieldId);
  if (parsed && formConfig.repeatableFields) {
    const repeatableConfig = getOwn(formConfig.repeatableFields, parsed.repeatableId);
    const templateField = repeatableConfig?.allFields.find((f) => f.id === parsed.fieldId);
    if (repeatableConfig && templateField?.conditions) {
      const templateFieldIds = new Set(repeatableConfig.allFields.map((f) => f.id));
      return scopeConditions(
        templateField.conditions,
        parsed.repeatableId,
        parsed.itemKey,
        templateFieldIds
      );
    }
  }

  return undefined;
}

/**
 * Whether a field id is currently visible, evaluated against the given data.
 * A field with no `visible` condition — including a key that resolves to no
 * configured field at all (host-written extras are the host's business) — is
 * always visible.
 */
export function isFieldVisibleInData(
  formConfig: FormConfiguration,
  fieldId: string,
  conditionData: Record<string, unknown>
): boolean {
  const conditions = resolveFieldConditionalBehavior(formConfig, fieldId);
  if (!conditions?.visible) return true;
  return evaluateConditionLive(conditions.visible, conditionData);
}

export interface VisibleSubmitValues {
  /** The values with every currently-hidden field's key dropped. */
  values: Record<string, unknown>;
  /**
   * Repeatable ids whose template has NO visible field. Their composite keys
   * are already dropped from `values`; the caller must also leave them out of
   * structuring, or a hidden repeatable would still surface as an array key.
   */
  hiddenRepeatableIds: ReadonlySet<string>;
}

/**
 * Drops every currently-hidden field from a flat values record — THE payload
 * visibility filter, shared by the form submit boundary and the workflow
 * completion boundary.
 *
 * `conditionData` is what the conditions evaluate against, supplied by the
 * caller because it is boundary-specific: the form boundary reproduces
 * render-time semantics ({external non-own condition values} layered under the
 * LIVE store values), the workflow boundary reproduces them per step. Each
 * field's condition is evaluated against the FULL data — never against the
 * progressively-filtered result — so chained conditions resolve exactly as
 * they did on screen.
 *
 * Only a filter: a visible field with a falsy/empty value stays, a field with
 * no condition stays, and no key is ever added.
 */
export function pickVisibleSubmitValues(
  values: Record<string, unknown>,
  formConfig: FormConfiguration,
  conditionData: Record<string, unknown>
): VisibleSubmitValues {
  const hiddenRepeatableIds = new Set<string>();
  for (const [id, config] of Object.entries(formConfig.repeatableFields ?? {})) {
    if (!isRepeatableVisible(config, conditionData)) {
      hiddenRepeatableIds.add(id);
    }
  }

  const visible: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(values)) {
    const parsed = parseCompositeKey(key);
    if (parsed && hiddenRepeatableIds.has(parsed.repeatableId)) {
      changed = true;
      continue;
    }
    if (!isFieldVisibleInData(formConfig, key, conditionData)) {
      changed = true;
      continue;
    }
    // `defineOwn`: an author-chosen `__proto__` field id must survive the copy
    // as a real own key, exactly as it survives everywhere else in this file's
    // neighbours.
    defineOwn(visible, key, value);
  }

  return { values: changed ? visible : values, hiddenRepeatableIds };
}
