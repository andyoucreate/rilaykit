import type { FieldEffect, FieldEffectContext } from '@rilaykit/core';
import type { FormStore } from '../stores/formStore';

const MAX_CASCADE_DEPTH = 10;

export interface EffectEngineOptions {
  readonly effectsMap: Record<string, FieldEffect[]>;
  readonly store: FormStore;
}

export class EffectEngine {
  private readonly effectsMap: Record<string, FieldEffect[]>;
  private readonly store: FormStore;
  private unsubscribe: (() => void) | null = null;
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly processingFields = new Set<string>();
  private cascadeDepth = 0;
  private stopped = false;

  constructor({ effectsMap, store }: EffectEngineOptions) {
    this.effectsMap = effectsMap;
    this.store = store;
  }

  start(): void {
    this.stopped = false;

    this.unsubscribe = this.store.subscribe(
      (state) => state.values,
      (values, prevValues) => {
        if (this.stopped) return;

        // Find which fields changed
        for (const fieldId of Object.keys(values)) {
          if (values[fieldId] !== prevValues[fieldId]) {
            this.executeEffectsForField(fieldId, values[fieldId]);
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
    this.processingFields.clear();
    this.cascadeDepth = 0;
  }

  private executeEffectsForField(fieldId: string, newValue: unknown): void {
    const effects = this.effectsMap[fieldId];
    if (!effects || effects.length === 0) return;

    // Cascade depth protection
    if (this.cascadeDepth >= MAX_CASCADE_DEPTH) {
      console.warn(
        `[EffectEngine] Max cascade depth (${MAX_CASCADE_DEPTH}) reached for field "${fieldId}". Stopping cascade.`
      );
      return;
    }

    // Cycle detection
    if (this.processingFields.has(fieldId)) {
      console.warn(
        `[EffectEngine] Cycle detected: field "${fieldId}" is already being processed. Skipping.`
      );
      return;
    }

    // Abort previous async effects for this field
    const prevController = this.abortControllers.get(fieldId);
    if (prevController) {
      prevController.abort();
    }

    const abortController = new AbortController();
    this.abortControllers.set(fieldId, abortController);

    // Build context
    const context: FieldEffectContext = {
      setValue: (targetFieldId: string, value: unknown) => {
        if (abortController.signal.aborted || this.stopped) return;
        this.store.getState()._setValue(targetFieldId, value);
      },
      setProps: (targetFieldId: string, props: Record<string, unknown>) => {
        if (abortController.signal.aborted || this.stopped) return;
        this.store.getState()._setFieldProps(targetFieldId, props);
      },
      getValues: () => {
        return this.store.getState().values as Record<string, unknown>;
      },
      getFieldValue: (targetFieldId: string) => {
        return this.store.getState().values[targetFieldId];
      },
    };

    // Mark field as processing and increment cascade depth
    this.processingFields.add(fieldId);
    this.cascadeDepth++;

    try {
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
                console.warn(`[EffectEngine] Async effect error for field "${fieldId}":`, error);
              })
            );
          }
        } catch (error) {
          console.warn(`[EffectEngine] Sync effect error for field "${fieldId}":`, error);
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
    } finally {
      this.processingFields.delete(fieldId);
      this.cascadeDepth--;
    }
  }
}
