import { getLogger, getOwn } from '@rilaykit/core';
import type { FieldEffect, FieldEffectContext } from '@rilaykit/core';
import type { FormStore } from '../stores/formStore';

const log = getLogger('forms:effects');

const MAX_CASCADE_DEPTH = 10;

/**
 * A cascade chain tracks the fields already visited on the current propagation
 * path plus its depth. It is carried THROUGH async setValue continuations (not
 * just the synchronous call stack) so mutually-writing async effects cannot loop
 * unboundedly across microtasks.
 */
interface CascadeChain {
  readonly visited: Set<string>;
  readonly depth: number;
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
}

export class EffectEngine {
  private readonly effectsMap: Record<string, FieldEffect[]>;
  private readonly store: FormStore;
  private readonly revalidateField?: (fieldId: string) => void;
  private unsubscribe: (() => void) | null = null;
  private readonly abortControllers = new Map<string, AbortController>();
  // Chain of the cascade currently propagating through a setValue call, if any.
  // Picked up by the store subscription so downstream effects inherit it.
  private pendingChain: CascadeChain | null = null;
  private stopped = false;

  constructor({ effectsMap, store, revalidateField }: EffectEngineOptions) {
    this.effectsMap = effectsMap;
    this.store = store;
    this.revalidateField = revalidateField;
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
   */
  runInitialEffects(): void {
    if (this.stopped) return;

    const values = this.store.getState().values;

    for (const fieldId of Object.keys(this.effectsMap)) {
      const value = values[fieldId];
      if (value !== undefined) {
        this.executeEffectsForField(fieldId, value);
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

  private executeEffectsForField(
    fieldId: string,
    newValue: unknown,
    incomingChain: CascadeChain | null = null
  ): void {
    // Own-property only: `fieldId` is a store key, so an unwatched field named
    // `constructor` would otherwise resolve an inherited method here.
    const effects = getOwn(this.effectsMap, fieldId);
    if (!effects || effects.length === 0) return;

    const chain: CascadeChain = incomingChain ?? { visited: new Set(), depth: 0 };

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
    const nextChain: CascadeChain = {
      visited: new Set(chain.visited).add(fieldId),
      depth: chain.depth + 1,
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
