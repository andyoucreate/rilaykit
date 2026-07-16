import { getLogger, getOwn, hasOwn } from '@rilaykit/core';
import type { FieldEffect, FieldEffectContext } from '@rilaykit/core';
import type { FormStore } from '../stores/formStore';
import { parseCompositeKey } from '../utils/repeatable-data';

const log = getLogger('forms:effects');

const MAX_CASCADE_DEPTH = 10;

/**
 * A cascade chain tracks the fields already visited on the current propagation
 * path plus its depth. It is carried THROUGH async setValue continuations (not
 * just the synchronous call stack) so mutually-writing async effects cannot loop
 * unboundedly across microtasks. `initial` marks a cascade set off by
 * {@link EffectEngine.runInitialEffects} (directly or via a downstream write):
 * initial-run writes are subject to the user-owned-target guard, and the flag
 * must survive the same async hops the visited-set does.
 */
interface CascadeChain {
  readonly visited: Set<string>;
  readonly depth: number;
  readonly initial: boolean;
}

export interface EffectEngineOptions {
  readonly effectsMap: Record<string, FieldEffect[]>;
  readonly store: FormStore;
  /**
   * Re-validate a field after an effect writes its value, so a stale error on
   * that field is cleared/refreshed and `isValid` reflects the new value.
   * Optional so the engine stays usable without a validation layer.
   */
  readonly revalidateField?: (fieldId: string) => void;
  /**
   * Extra "the user owns this field" knowledge beyond the store's `touched`
   * (which only a blur sets) — FormProvider passes its interaction record
   * (every field whose value changed outside the provider's own writes). An
   * INITIAL-run effect write onto a user-owned target is dropped: initial
   * effects exist to derive values from defaults at mount time, and a rebuilt
   * engine (a streamed chunk that changed the effects) must never overwrite
   * what the user already answered. Subscription-driven writes are unaffected —
   * a watched change legitimately rewrites its derived targets.
   */
  readonly isUserOwnedField?: (fieldId: string) => boolean;
}

/**
 * Content equality for two effects indexes: same watched keys, and per key the
 * same effects (trigger, watched field, HANDLER REFERENCE) in the same order.
 *
 * This is the stable identity the engine's host should key its lifetime on
 * instead of the `effectsMap` OBJECT — every streamed growth chunk is a fresh
 * compile and therefore a fresh object, and rebuilding the engine on it re-runs
 * initial effects and aborts in-flight ones for nothing. Handler references are
 * the discriminant for behavior: hosts with stable handlers (built configs,
 * memoized bindings) compare equal across re-builds; a compile path that
 * re-curries handlers per compile compares unequal and keeps today's rebuild.
 */
export function effectsMapEquals(
  a: Record<string, FieldEffect[]> | undefined,
  b: Record<string, FieldEffect[]> | undefined
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const aEffects = getOwn(a, key);
    const bEffects = getOwn(b, key);
    if (aEffects === undefined || bEffects === undefined) return false;
    if (aEffects.length !== bEffects.length) return false;
    for (let i = 0; i < aEffects.length; i++) {
      if (
        aEffects[i].trigger !== bEffects[i].trigger ||
        aEffects[i].watchFieldId !== bEffects[i].watchFieldId ||
        aEffects[i].handler !== bEffects[i].handler
      ) {
        return false;
      }
    }
  }
  return true;
}

export class EffectEngine {
  private readonly effectsMap: Record<string, FieldEffect[]>;
  private readonly store: FormStore;
  private readonly revalidateField?: (fieldId: string) => void;
  private readonly isUserOwnedField?: (fieldId: string) => boolean;
  private unsubscribe: (() => void) | null = null;
  private readonly abortControllers = new Map<string, AbortController>();
  // Chain of the cascade currently propagating through a setValue call, if any.
  // Picked up by the store subscription so downstream effects inherit it.
  private pendingChain: CascadeChain | null = null;
  private stopped = false;

  constructor({ effectsMap, store, revalidateField, isUserOwnedField }: EffectEngineOptions) {
    this.effectsMap = effectsMap;
    this.store = store;
    this.revalidateField = revalidateField;
    this.isUserOwnedField = isUserOwnedField;
  }

  start(): void {
    this.stopped = false;

    this.unsubscribe = this.store.subscribe(
      (state) => state.values,
      (values, prevValues) => {
        if (this.stopped) return;

        // Inherit the cascade chain from the setValue that caused this change
        // (null for user-initiated changes → a fresh cascade).
        const incomingChain = this.pendingChain;

        // Find which fields changed
        for (const fieldId of Object.keys(values)) {
          if (values[fieldId] !== prevValues[fieldId]) {
            this.executeEffectsForField(fieldId, values[fieldId], incomingChain);
          }
        }
      }
    );
  }

  /**
   * Execute effects for fields that have defaultValues at mount time.
   * This enables initial data loading (e.g., country='France' → load cities).
   *
   * INITIAL runs derive values from DEFAULTS — they carry `initial: true` on
   * their cascade chain, and any write they produce (however many async hops
   * later) onto a user-owned target is dropped. A host that rebuilds the engine
   * mid-session (a streamed chunk whose effects changed) re-enters here with
   * the user's answers already in the store; without the guard, the re-fired
   * effect would silently replace an answer the user typed even though the
   * watched field never changed.
   */
  runInitialEffects(): void {
    if (this.stopped) return;

    const values = this.store.getState().values;

    for (const fieldId of Object.keys(this.effectsMap)) {
      const value = values[fieldId];
      if (value !== undefined) {
        this.executeEffectsForField(fieldId, value, {
          visited: new Set(),
          depth: 0,
          initial: true,
        });
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;

    // Abort all pending async effects
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.pendingChain = null;
  }

  /** A field the USER owns: blurred (`touched`) or claimed by the host's record. */
  private isTargetUserOwned(fieldId: string): boolean {
    // Own-property only: `fieldId` may be schema-authored (`constructor`).
    if (getOwn(this.store.getState().touched, fieldId) === true) return true;
    return this.isUserOwnedField?.(fieldId) ?? false;
  }

  /**
   * A plain key is always writable; a composite key (`lines[k0].price`) is
   * writable only while its row is still in the live `_repeatableOrder`. A key
   * whose repeatableId the store does not know is host-authored (effects may
   * deliberately write undeclared derived keys) and stays writable.
   */
  private isTargetRowLive(fieldId: string): boolean {
    const parsed = parseCompositeKey(fieldId);
    if (parsed === null) return true;
    const state = this.store.getState();
    if (!hasOwn(state._repeatableConfigs, parsed.repeatableId)) return true;
    const liveOrder = getOwn(state._repeatableOrder, parsed.repeatableId);
    return liveOrder?.includes(parsed.itemKey) ?? false;
  }

  private executeEffectsForField(
    fieldId: string,
    newValue: unknown,
    incomingChain: CascadeChain | null = null
  ): void {
    // Own-property only: `fieldId` is a store key, so an unwatched field named
    // `constructor` would otherwise resolve an inherited method here.
    const effects = getOwn(this.effectsMap, fieldId);
    if (!effects || effects.length === 0) return;

    const chain: CascadeChain = incomingChain ?? { visited: new Set(), depth: 0, initial: false };

    // Cycle detection — carried across async continuations, so A→B→A loops are
    // caught even when each hop happens in a separate microtask.
    if (chain.visited.has(fieldId)) {
      log.warn(
        `[EffectEngine] Cycle detected: field "${fieldId}" is already being processed. Skipping.`
      );
      return;
    }

    // Cascade depth protection — bounds long distinct chains.
    if (chain.depth >= MAX_CASCADE_DEPTH) {
      log.warn(
        `[EffectEngine] Max cascade depth (${MAX_CASCADE_DEPTH}) reached for field "${fieldId}". Stopping cascade.`
      );
      return;
    }

    // The chain passed on to any effect this field triggers via setValue.
    // `initial` is inherited: a value derived FROM an initial run is still
    // initial-run output, so its own downstream writes stay guarded.
    const nextChain: CascadeChain = {
      visited: new Set(chain.visited).add(fieldId),
      depth: chain.depth + 1,
      initial: chain.initial,
    };

    // Abort previous async effects for this field
    const prevController = this.abortControllers.get(fieldId);
    if (prevController) {
      prevController.abort();
    }

    const abortController = new AbortController();
    this.abortControllers.set(fieldId, abortController);

    // Propagate a store write while tagging it with the current cascade chain so
    // downstream effects (triggered synchronously by the store subscription)
    // inherit the visited-set and depth.
    const propagate = (write: () => void) => {
      const previousChain = this.pendingChain;
      this.pendingChain = nextChain;
      try {
        write();
      } finally {
        this.pendingChain = previousChain;
      }
    };

    // Build context
    const context: FieldEffectContext = {
      setValue: (targetFieldId: string, value: unknown) => {
        if (abortController.signal.aborted || this.stopped) return;
        // INITIAL-run writes never land on a field the user owns: `touched`
        // (a blur — the same guard the provider's default-seeding uses) or the
        // host's interaction record (a keystroke that never blurred). Checked
        // at WRITE time, not schedule time, so an async initial effect racing
        // the user's typing loses to the keystroke it would have destroyed.
        if (chain.initial && this.isTargetUserOwned(targetFieldId)) return;
        // A composite-key write requires its ROW to still be live: a late
        // async effect must not resurrect a removed repeatable row's key
        // (mirrors the validation-side row-liveness guard).
        if (!this.isTargetRowLive(targetFieldId)) return;
        propagate(() => this.store.getState()._setValue(targetFieldId, value));
        // Re-validate the written field so a stale error (from a previous
        // invalid value) is cleared/refreshed and `isValid` reflects the new
        // value. Revalidation only mutates error/validation state — never
        // `values` — so it cannot re-trigger this value subscription (no loop).
        this.revalidateField?.(targetFieldId);
      },
      setProps: (targetFieldId: string, props: Record<string, unknown>) => {
        if (abortController.signal.aborted || this.stopped) return;
        propagate(() => this.store.getState()._setFieldProps(targetFieldId, props));
      },
      getValues: () => {
        return this.store.getState().values as Record<string, unknown>;
      },
      getFieldValue: (targetFieldId: string) => {
        return this.store.getState().values[targetFieldId];
      },
    };

    const promises: Promise<void>[] = [];

    for (const effect of effects) {
      if (abortController.signal.aborted || this.stopped) break;

      try {
        const result = effect.handler(newValue, context);
        if (result instanceof Promise) {
          promises.push(
            result.catch((error) => {
              // Ignore AbortError silently
              if (error?.name === 'AbortError') return;
              log.warn(`[EffectEngine] Async effect error for field "${fieldId}":`, error);
            })
          );
        }
      } catch (error) {
        log.warn(`[EffectEngine] Sync effect error for field "${fieldId}":`, error);
      }
    }

    // Clean up abort controller when all async effects settle
    if (promises.length > 0) {
      Promise.allSettled(promises).then(() => {
        // Only clean up if this is still the current controller
        if (this.abortControllers.get(fieldId) === abortController) {
          this.abortControllers.delete(fieldId);
        }
      });
    } else {
      this.abortControllers.delete(fieldId);
    }
  }
}
