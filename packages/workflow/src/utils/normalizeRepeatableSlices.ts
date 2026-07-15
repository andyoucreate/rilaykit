import type { RepeatableFieldConfig, StepConfig } from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { buildCompositeKey, parseCompositeKey } from '@rilaykit/forms';

/**
 * A step slice is a plain object keyed by field id. An array or a primitive is
 * not a slice and is carried through untouched.
 */
function isSlice(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Row-key list equality — the unit the order mirror is compared in. */
export function sameRowKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * One step slice normalised to the store's internal shape, and the row keys the
 * normalisation ASSIGNED.
 *
 * `rowKeys` is what makes the order mirror derivable rather than remembered: a
 * write that re-authors a repeatable's rows reports the keys it gave them, so
 * the store can keep the mirror describing the rows that are actually there
 * instead of the rows they replaced. It is empty when the slice carried no
 * authored array — the overwhelmingly common case, a form reporting its own
 * composite keys, which re-keys nothing.
 */
export interface FlattenedSlice {
  slice: Record<string, unknown>;
  rowKeys: Record<string, string[]>;
}

const NO_ROW_KEYS: Record<string, string[]> = Object.freeze(Object.create(null));

/**
 * Rewrites one step slice from the AUTHORED shape (a repeatable's rows as an
 * array under its bare id) into the store's internal flat composite keys.
 * Everything else is carried through untouched, and a slice with no authored
 * array keeps its identity.
 *
 * `liveOrder` is the step's mirrored row order and exists to keep the row KEYS
 * stable. Re-keying the rows `k0..kn` would be silently wrong whenever the user
 * has reordered or deleted: the order mirror still names the old keys, so on
 * re-entry it would either resolve to nothing or — worse — re-sequence the rows
 * against values that no longer belong to them. When no order is mirrored the
 * rows can only ever be in insertion order, and `k0..kn` is exactly right; a
 * length mismatch means the mirror is not describing these rows, so it is not
 * trusted.
 *
 * NOT TRUSTING THE MIRROR IS ONLY HALF THE ANSWER, which is why `rowKeys` comes
 * back out. This function declining to use a stale mirror does not make the
 * mirror any less stale, and the READ boundary ({@link structureStepSlice})
 * trusts it unconditionally — so a length mismatch used to re-key the rows here
 * and leave the mirror sequencing the host's fresh array by the arrangement of
 * the rows it replaced. The two consumers disagreeing about when the mirror is
 * describing these rows IS the desync; reporting the keys assigned lets the
 * store settle it at the write, where it can.
 *
 * The accumulator is a Map: both a field id and a repeatable id are author
 * data, and a plain `flat['__proto__'] = value` reassigns the prototype instead
 * of recording the key.
 */
export function flattenAuthoredSlice(
  slice: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig> | undefined,
  liveOrder?: Record<string, string[]>
): FlattenedSlice {
  if (!repeatableConfigs) return { slice, rowKeys: NO_ROW_KEYS };

  const authoredIds = Object.keys(repeatableConfigs).filter((id) =>
    Array.isArray(getOwn(slice, id))
  );
  if (authoredIds.length === 0) return { slice, rowKeys: NO_ROW_KEYS };

  const flat = new Map<string, unknown>();
  const assigned = new Map<string, string[]>();

  for (const [key, value] of Object.entries(slice)) {
    if (!authoredIds.includes(key)) {
      // An authored array is the WHOLE truth about that repeatable — it
      // replaces its rows, it does not merge with them. A slice can already
      // hold flat keys for the same repeatable (a helper's
      // `{...existingData, ...fields}` merge layers the array over them);
      // carrying those keys through would leave rows the authored array
      // dropped, invisible to the user and submitted to the host.
      const parsed = parseCompositeKey(key);
      if (parsed && authoredIds.includes(parsed.repeatableId)) continue;

      flat.set(key, value);
      continue;
    }

    const items = value as unknown[];
    const captured = liveOrder ? getOwn(liveOrder, key) : undefined;
    const itemKeys =
      captured && captured.length === items.length
        ? captured
        : items.map((_, index) => `k${index}`);
    assigned.set(key, itemKeys);

    items.forEach((rawItem, index) => {
      // Degrade gracefully: a null / non-object row (e.g. a null entry from
      // backend JSON) contributes no field values but still holds its slot.
      if (rawItem === null || typeof rawItem !== 'object' || Array.isArray(rawItem)) return;
      for (const [fieldId, fieldValue] of Object.entries(rawItem as Record<string, unknown>)) {
        flat.set(buildCompositeKey(key, itemKeys[index], fieldId), fieldValue);
      }
    });
  }

  return { slice: Object.fromEntries(flat), rowKeys: Object.fromEntries(assigned) };
}

/**
 * Folds the row keys a write ASSIGNED back into one step's order mirror, so the
 * mirror never describes rows that are no longer there.
 *
 * ONLY THE CLAIMS THE MIRROR ALREADY MAKES ARE RECONCILED. An absent entry is
 * not an empty one — it is the mirror declining to have an opinion, and the read
 * boundary answers that by reconstructing insertion order from the flat keys,
 * which is exactly what a repeatable nobody has reordered is in. Inventing an
 * entry for it would only restate that, and would put a bookkeeping key into
 * every persistence snapshot to say nothing.
 */
function reconcileStepOrder(
  current: Record<string, string[]> | undefined,
  rowKeys: Record<string, string[]>
): Record<string, string[]> | undefined {
  if (!current) return current;

  const next = new Map<string, string[]>(Object.entries(current));
  let changed = false;

  for (const [id, assigned] of Object.entries(rowKeys)) {
    const existing = next.get(id);
    if (!existing || sameRowKeys(existing, assigned)) continue;
    next.set(id, assigned);
    changed = true;
  }

  return changed ? Object.fromEntries(next) : current;
}

/**
 * {@link reconcileStepOrder} for the whole store's mirror. Returns the map's own
 * identity when nothing moved, so an unrelated re-render is not published.
 *
 * The accumulator is a Map: a step id is author data, and a plain
 * `next['__proto__'] = order` reassigns the prototype instead of recording the
 * key, silently dropping that step's arrangement.
 */
export function reconcileRepeatableOrders(
  orders: Record<string, Record<string, string[]>>,
  stepId: string,
  rowKeys: Record<string, string[]>
): Record<string, Record<string, string[]>> {
  const current = getOwn(orders, stepId);
  const reconciled = reconcileStepOrder(current, rowKeys);
  if (reconciled === current || reconciled === undefined) return orders;

  const next = new Map<string, Record<string, string[]>>(Object.entries(orders));
  next.set(stepId, reconciled);
  return Object.fromEntries(next);
}

/**
 * The row keys one step slice ACTUALLY HOLDS, per repeatable, derived from the
 * slice alone.
 *
 * DERIVED, NOT ASKED. A flat composite key is self-describing — `lines[k0].label`
 * names the repeatable, the row and the field — so this consults no config and no
 * step list. That is the lesson the fifth member of this class paid for: a
 * boundary that asks the config which keys are a repeatable's rows is a boundary
 * that answers wrongly the moment the config and the data disagree, and they
 * disagree exactly when the step set moves.
 *
 * Insertion order of the returned keys is meaningless — this answers WHICH rows
 * the slice holds, never in what arrangement. The arrangement is the mirror's
 * whole job, and it is unreconstructable from here (a move rewrites the order
 * and nothing else).
 */
function heldRowKeys(slice: Record<string, unknown>): Map<string, Set<string>> {
  const held = new Map<string, Set<string>>();

  for (const key of Object.keys(slice)) {
    const parsed = parseCompositeKey(key);
    if (!parsed) continue;

    const keys = held.get(parsed.repeatableId) ?? new Set<string>();
    keys.add(parsed.itemKey);
    held.set(parsed.repeatableId, keys);
  }

  return held;
}

/**
 * The part of an order report a step is ENTITLED TO — the claims that are about
 * rows this step's own slice holds.
 *
 * THE THIRD INVARIANT, ENFORCED AT THE ONE DOOR THAT WROTE THE MIRROR BLIND.
 * `_setRepeatableOrder` is the only action that writes `_repeatableOrders`
 * without going through a normaliser, because it is the only one whose whole
 * purpose IS the mirror — so it had nothing to normalise, and wrote whatever
 * `(stepId, order)` pair it was handed. That was safe only while the pair was
 * guaranteed well-formed, and its one caller forms the pair by reading the
 * step id from `currentStep?.id` at call time while the order comes from a form
 * that may not be the one that step mounted. The pair is an ASSUMPTION at the
 * call site; here it is a question the slice can answer.
 *
 * A claim is admitted when the rows the slice holds for that repeatable are all
 * named by it. Not equality: a row the user just appended and has not typed into
 * contributes no composite key, so the slice legitimately holds FEWER rows than
 * the form is arranging, and rejecting that would throw away the arrangement of
 * every half-filled repeatable. What cannot be tolerated is the reverse — a
 * claim that fails to name a row the slice holds is not describing these rows,
 * and {@link structureStepSlice} applies the mirror unconditionally, so it would
 * re-sequence the host's rows against an arrangement that was never theirs.
 *
 * A step whose slice holds no rows for a repeatable at all therefore admits NO
 * claim about it: there are no rows here to arrange. That is what makes a
 * foreign form's arrangement unrepresentable rather than merely unlikely — it
 * does not matter which step the caller named, only whether that step's own data
 * bears the claim out.
 *
 * `undefined` when nothing survives, and the caller must write NO ENTRY rather
 * than an empty one. An absent entry is the mirror declining to have an opinion,
 * which the read boundary answers by reconstructing insertion order from the
 * flat keys; an empty entry says the same thing while putting a bookkeeping key
 * into every persistence snapshot. See {@link reconcileStepOrder}.
 */
export function admissibleStepOrder(
  slice: Record<string, unknown>,
  order: Record<string, string[]>
): Record<string, string[]> | undefined {
  const held = heldRowKeys(slice);
  // A Map: a repeatable id is author data, and `admitted['__proto__'] = keys` on
  // a plain object reassigns the prototype instead of recording the key.
  const admitted = new Map<string, string[]>();

  for (const [repeatableId, claimedKeys] of Object.entries(order)) {
    const heldKeys = held.get(repeatableId);
    if (!heldKeys || heldKeys.size === 0) continue;

    const claimed = new Set(claimedKeys);
    if (![...heldKeys].every((key) => claimed.has(key))) continue;

    admitted.set(repeatableId, claimedKeys);
  }

  return admitted.size === 0 ? undefined : Object.fromEntries(admitted);
}

/**
 * Normalises every step slice of a workflow `allData` to the store's ONE
 * internal representation: flat composite keys (`lines[k0].label`).
 *
 * A repeatable's default arrives in its AUTHORED shape — `lines: [{label:'a'}]`
 * under the bare repeatable id — while the form mirrors every live change as
 * flat composite keys. Letting both shapes live in `allData` is what made the
 * append-only mirror re-enter: `_removeFieldValues` deletes flat keys, so a row
 * that exists only inside the raw array is unreachable — it survives the user's
 * delete, is submitted to the backend, and is restored on step re-entry. The
 * persistence layer inherits the same split, with `mergeStepSlices` layering
 * flat persisted keys over an intact default array.
 *
 * Collapsing to one shape at every point where data ENTERS the store closes the
 * mismatch at the root rather than teaching each consumer to speak both shapes.
 * The authored/structured shape remains the public contract of the submitted
 * form payload (`structureFormValues`); flat is internal only.
 *
 * `orders` IS NOT OPTIONAL, and that is the whole point. This used to take the
 * data and the steps and nothing else — mirror-blind — because its first caller
 * was store CREATION, where the mirror is empty by construction and there is
 * genuinely no arrangement to preserve. "There is no order to consult" was TRUE
 * of that caller. It was FALSE of `_setAllData` and `_loadPersistedState`, two
 * PUBLIC actions routed through it later: they re-indexed a host's rows `k0..kn`
 * underneath a mirror that still named `k1, k0`, and the host read its own array
 * back reversed. The store had two normalisers, one of which quietly did not
 * maintain the invariant — so a caller reaching for the wrong one was the door
 * nobody enumerated. There is now one, it takes the mirror, and it hands back
 * the mirror it leaves behind.
 *
 * The accumulator is a Map: a step id is untrusted data, and
 * `normalized['__proto__'] = slice` on a plain object reassigns the prototype
 * instead of recording a key, silently dropping that step.
 */
export function normalizeRepeatableSlices(
  data: Record<string, unknown>,
  steps: ReadonlyArray<StepConfig>,
  orders: Record<string, Record<string, string[]>>
): { data: Record<string, unknown>; orders: Record<string, Record<string, string[]>> } {
  const normalized = new Map<string, unknown>(Object.entries(data));
  let changed = false;
  let nextOrders = orders;

  for (const step of steps) {
    const repeatableConfigs = step.formConfig?.repeatableFields;
    if (!repeatableConfigs) continue;

    const slice = normalized.get(step.id);
    if (!isSlice(slice)) continue;

    // `flattenAuthoredSlice` returns the slice itself when there is no authored
    // array, so an already-flat slice keeps its identity and unrelated
    // memoisation and change detection do not churn.
    const flat = flattenAuthoredSlice(slice, repeatableConfigs, getOwn(nextOrders, step.id));
    nextOrders = reconcileRepeatableOrders(nextOrders, step.id, flat.rowKeys);
    if (flat.slice === slice) continue;

    normalized.set(step.id, flat.slice);
    changed = true;
  }

  return { data: changed ? Object.fromEntries(normalized) : data, orders: nextOrders };
}
