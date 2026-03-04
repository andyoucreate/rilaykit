import type { FieldEffect, FieldEffectContext } from '@rilaykit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectEngine } from '../../src/effects/effect-engine';
import { createFormStore } from '../../src/stores/formStore';

// =================================================================
// HELPERS
// =================================================================

function createEffect(
  watchFieldId: string,
  handler: (value: unknown, ctx: FieldEffectContext) => void | Promise<void>
): FieldEffect {
  return { trigger: 'change', watchFieldId, handler };
}

// =================================================================
// TESTS
// =================================================================

describe('EffectEngine', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // -----------------------------------------------------------------
  // 1. Sync effect: country changes → city reset via setValue
  // -----------------------------------------------------------------
  describe('sync effect', () => {
    it('should reset city when country changes', () => {
      const store = createFormStore({ country: '', city: 'Paris' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [
            createEffect('country', (_value, ctx) => {
              ctx.setValue('city', '');
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('country', 'Germany');

      expect(store.getState().values.city).toBe('');
      expect(store.getState().values.country).toBe('Germany');

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 2. Async effect: country changes → fetch cities → setProps
  // -----------------------------------------------------------------
  describe('async effect', () => {
    it('should set props after async resolution', async () => {
      const store = createFormStore({ country: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [
            createEffect('country', async (_value, ctx) => {
              const cities = await Promise.resolve(['Berlin', 'Munich']);
              ctx.setProps('city', { options: cities });
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('country', 'Germany');

      // Wait for the async effect to resolve
      await vi.waitFor(() => {
        expect(store.getState()._fieldProps.city).toEqual({
          options: ['Berlin', 'Munich'],
        });
      });

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 3. Cascade: country → city → district (3 levels)
  // -----------------------------------------------------------------
  describe('cascade effects', () => {
    it('should support 3-level cascading effects', () => {
      const store = createFormStore({
        country: '',
        city: '',
        district: '',
      });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [
            createEffect('country', (_value, ctx) => {
              ctx.setValue('city', 'default-city');
            }),
          ],
          city: [
            createEffect('city', (_value, ctx) => {
              ctx.setValue('district', 'default-district');
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('country', 'France');

      expect(store.getState().values.country).toBe('France');
      expect(store.getState().values.city).toBe('default-city');
      expect(store.getState().values.district).toBe('default-district');

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 4a. Cycle detection: A ↔ B → warn about cycle on A (re-entered)
  // -----------------------------------------------------------------
  describe('cycle detection', () => {
    it('should warn and stop when a field is re-entered during processing (A↔B)', () => {
      const store = createFormStore({ a: '', b: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', (_value, ctx) => {
              ctx.setValue('b', `b-${Date.now()}`);
            }),
          ],
          b: [
            createEffect('b', (_value, ctx) => {
              ctx.setValue('a', `a-${Date.now()}`);
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('a', 'trigger');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cycle detected: field "a" is already being processed')
      );

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 4b. Max cascade depth: chain of 11+ distinct fields → warn at depth 10
  // -----------------------------------------------------------------
  describe('max cascade depth', () => {
    it('should warn and stop at MAX_CASCADE_DEPTH=10 for a long chain', () => {
      // Build a chain: f0 → f1 → f2 → ... → f11
      // Each field sets the next one, all distinct so cycle detection won't trigger
      const fieldCount = 12;
      const initialValues: Record<string, unknown> = {};
      const effectsMap: Record<string, FieldEffect[]> = {};

      for (let i = 0; i < fieldCount; i++) {
        initialValues[`f${i}`] = '';
      }

      for (let i = 0; i < fieldCount - 1; i++) {
        const nextField = `f${i + 1}`;
        effectsMap[`f${i}`] = [
          createEffect(`f${i}`, (_value, ctx) => {
            ctx.setValue(nextField, `set-by-f${i}`);
          }),
        ];
      }

      const store = createFormStore(initialValues);
      const engine = new EffectEngine({ store, effectsMap });

      engine.start();

      store.getState()._setValue('f0', 'trigger');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Max cascade depth (10) reached')
      );

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 5. Abort async: rapid country changes, only the last one takes effect
  // -----------------------------------------------------------------
  describe('abort async', () => {
    it('should only apply the last async effect on rapid changes', async () => {
      const store = createFormStore({ country: '' });

      let callCount = 0;

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [
            createEffect('country', async (value, ctx) => {
              callCount++;
              // Simulate a network delay
              await new Promise((resolve) => setTimeout(resolve, 50));
              ctx.setProps('city', { options: [`city-of-${value}`] });
            }),
          ],
        },
      });

      engine.start();

      // Rapid changes — first two should be aborted
      store.getState()._setValue('country', 'France');
      store.getState()._setValue('country', 'Germany');
      store.getState()._setValue('country', 'Italy');

      // Wait long enough for the last async to settle
      await vi.waitFor(
        () => {
          expect(store.getState()._fieldProps.city).toEqual({
            options: ['city-of-Italy'],
          });
        },
        { timeout: 500 }
      );

      // All handlers were called, but only the last one's setProps took effect
      // (previous ones were aborted via AbortController)
      expect(callCount).toBe(3);

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 6. Execution order: multiple effects for same watchFieldId
  // -----------------------------------------------------------------
  describe('execution order', () => {
    it('should execute multiple effects in declaration order', () => {
      const store = createFormStore({ country: '' });
      const order: number[] = [];

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [
            createEffect('country', () => {
              order.push(1);
            }),
            createEffect('country', () => {
              order.push(2);
            }),
            createEffect('country', () => {
              order.push(3);
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('country', 'France');

      expect(order).toEqual([1, 2, 3]);

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 7. stop() cleanup: after stop(), no effects should fire
  // -----------------------------------------------------------------
  describe('stop() cleanup', () => {
    it('should not fire effects after stop()', () => {
      const store = createFormStore({ country: '' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [createEffect('country', handler)],
        },
      });

      engine.start();
      engine.stop();

      store.getState()._setValue('country', 'France');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should abort pending async effects on stop()', async () => {
      const store = createFormStore({ country: '' });
      const setPropsSpy = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [
            createEffect('country', async (_value, ctx) => {
              await new Promise((resolve) => setTimeout(resolve, 100));
              setPropsSpy();
              ctx.setProps('city', { options: ['Berlin'] });
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('country', 'Germany');

      // Stop immediately, before the async resolves
      engine.stop();

      // Wait past the async delay
      await new Promise((resolve) => setTimeout(resolve, 150));

      // The setProps call inside the handler should have been guarded by abort
      expect(store.getState()._fieldProps.city).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // 8. runInitialEffects: executes effects for fields with defaultValues
  // -----------------------------------------------------------------
  describe('runInitialEffects', () => {
    it('should execute effects for fields with default values present in effectsMap', () => {
      const store = createFormStore({ country: 'France', city: '' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [createEffect('country', handler)],
        },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith('France', expect.any(Object));

      engine.stop();
    });

    // -----------------------------------------------------------------
    // 9. runInitialEffects: does nothing if no watched field has a default value
    // -----------------------------------------------------------------
    it('should do nothing if no watched field has a default value', () => {
      const store = createFormStore({ unrelated: 'hello' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [createEffect('country', handler)],
        },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).not.toHaveBeenCalled();

      engine.stop();
    });

    it('should skip fields with undefined default values', () => {
      const store = createFormStore({ country: undefined });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: {
          country: [createEffect('country', handler)],
        },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).not.toHaveBeenCalled();

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 10. Cross-field watching: effect on 'total' watches 'price'
  // -----------------------------------------------------------------
  describe('cross-field watching', () => {
    it('should compute total when price changes', () => {
      const store = createFormStore({ price: 0, quantity: 5, total: 0 });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          price: [
            createEffect('price', (value, ctx) => {
              const quantity = ctx.getFieldValue('quantity') as number;
              ctx.setValue('total', (value as number) * quantity);
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('price', 10);

      expect(store.getState().values.total).toBe(50);

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // 11. getValues / getFieldValue: context methods return correct values
  // -----------------------------------------------------------------
  describe('context methods', () => {
    it('getValues should return all current values', () => {
      const store = createFormStore({ a: 'alpha', b: 'beta' });
      let capturedValues: Record<string, unknown> = {};

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', (_value, ctx) => {
              capturedValues = ctx.getValues();
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('a', 'updated');

      // getValues returns the current snapshot, including the new value of 'a'
      expect(capturedValues.a).toBe('updated');
      expect(capturedValues.b).toBe('beta');

      engine.stop();
    });

    it('getFieldValue should return the current value of a specific field', () => {
      const store = createFormStore({ x: 42, y: 0 });
      let capturedY: unknown;

      const engine = new EffectEngine({
        store,
        effectsMap: {
          x: [
            createEffect('x', (_value, ctx) => {
              capturedY = ctx.getFieldValue('y');
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('x', 100);

      expect(capturedY).toBe(0);

      engine.stop();
    });

    it('getFieldValue should return undefined for non-existent fields', () => {
      const store = createFormStore({ x: 1 });
      let capturedValue: unknown = 'sentinel';

      const engine = new EffectEngine({
        store,
        effectsMap: {
          x: [
            createEffect('x', (_value, ctx) => {
              capturedValue = ctx.getFieldValue('nonExistent');
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('x', 2);

      expect(capturedValue).toBeUndefined();

      engine.stop();
    });
  });
});
