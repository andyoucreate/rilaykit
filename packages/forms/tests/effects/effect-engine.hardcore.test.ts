import { setLogSink } from '@rilaykit/core';
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =================================================================
// HARDCORE TESTS
// =================================================================

describe('EffectEngine — Hardcore Edge Cases', () => {
  // Capture library `log.warn(...)` output via the logger sink (runtime code no
  // longer calls console directly). Forward only the message + args so existing
  // assertions stay unchanged.
  let consoleWarnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleWarnSpy = vi.fn();
    setLogSink((level, _scope, message, ...args) => {
      if (level === 'warn') consoleWarnSpy(message, ...args);
    });
  });

  afterEach(() => {
    setLogSink(null);
  });

  // -----------------------------------------------------------------
  // ERROR RESILIENCE
  // -----------------------------------------------------------------

  describe('error resilience', () => {
    it('should survive a sync effect that throws and still execute remaining effects', () => {
      const store = createFormStore({ trigger: '' });
      const order: number[] = [];

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', () => {
              order.push(1);
            }),
            createEffect('trigger', () => {
              order.push(2);
              throw new Error('BOOM');
            }),
            createEffect('trigger', () => {
              order.push(3);
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(order).toEqual([1, 2, 3]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sync effect error'),
        expect.any(Error)
      );

      engine.stop();
    });

    it('should survive an async effect that rejects', async () => {
      const store = createFormStore({ trigger: '' });
      const handler2 = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', async () => {
              throw new Error('ASYNC BOOM');
            }),
            createEffect('trigger', handler2),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      // handler2 is sync so it runs immediately
      expect(handler2).toHaveBeenCalledOnce();

      // Wait for async rejection to be caught
      await delay(10);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Async effect error'),
        expect.any(Error)
      );

      engine.stop();
    });

    it('should handle effect that throws TypeError accessing undefined', () => {
      const store = createFormStore({ trigger: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              // Intentionally buggy: accessing property on undefined
              const val = ctx.getFieldValue('nonExistent') as any;
              val.foo.bar; // TypeError
            }),
          ],
        },
      });

      engine.start();

      // Should not throw, should warn
      expect(() => store.getState()._setValue('trigger', 'go')).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // CYCLE & CASCADE EDGE CASES
  // -----------------------------------------------------------------

  describe('cycle and cascade edge cases', () => {
    it('should detect self-referential cycle (A watches A)', () => {
      const store = createFormStore({ a: '' });
      let callCount = 0;

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', (_value, ctx) => {
              callCount++;
              ctx.setValue('a', 'loop');
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('a', 'trigger');

      // Called once, then cycle detected on re-entry
      expect(callCount).toBe(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cycle detected: field "a"')
      );

      engine.stop();
    });

    it('should handle diamond cascade: A→B, A→C, B→D, C→D', () => {
      const store = createFormStore({ a: '', b: '', c: '', d: '' });
      const dValues: unknown[] = [];

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', (_value, ctx) => {
              ctx.setValue('b', 'from-a');
              ctx.setValue('c', 'from-a');
            }),
          ],
          b: [
            createEffect('b', (_value, ctx) => {
              ctx.setValue('d', 'from-b');
              dValues.push('from-b');
            }),
          ],
          c: [
            createEffect('c', (_value, ctx) => {
              ctx.setValue('d', 'from-c');
              dValues.push('from-c');
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('a', 'trigger');

      // Both B and C effects should fire, D gets set twice
      expect(dValues).toEqual(['from-b', 'from-c']);
      // Last write wins
      expect(store.getState().values.d).toBe('from-c');

      engine.stop();
    });

    it('should handle triangle A→B→C→A with cycle detection at A', () => {
      const store = createFormStore({ a: '', b: '', c: '' });
      const calls: string[] = [];

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', (_value, ctx) => {
              calls.push('a→b');
              ctx.setValue('b', 'from-a');
            }),
          ],
          b: [
            createEffect('b', (_value, ctx) => {
              calls.push('b→c');
              ctx.setValue('c', 'from-b');
            }),
          ],
          c: [
            createEffect('c', (_value, ctx) => {
              calls.push('c→a');
              ctx.setValue('a', 'from-c');
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('a', 'trigger');

      expect(calls).toEqual(['a→b', 'b→c', 'c→a']);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cycle detected: field "a"')
      );

      engine.stop();
    });

    it('should survive exactly depth=10 chain without warning', () => {
      // 10 effects: f0→f1→...→f9, each setting the next field
      // f10 has no effect, so depth check never blocks it
      // cascadeDepth: f0=1, f1=2, ..., f9=10 (check at entry is 9 < 10, OK)
      const fieldCount = 11;
      const initialValues: Record<string, unknown> = {};
      const effectsMap: Record<string, FieldEffect[]> = {};

      for (let i = 0; i < fieldCount; i++) {
        initialValues[`f${i}`] = '';
      }

      // 10 effects: f0→f1, f1→f2, ..., f9→f10
      for (let i = 0; i < fieldCount - 1; i++) {
        const nextField = `f${i + 1}`;
        effectsMap[`f${i}`] = [
          createEffect(`f${i}`, (_value, ctx) => {
            ctx.setValue(nextField, `from-f${i}`);
          }),
        ];
      }

      const store = createFormStore(initialValues);
      const engine = new EffectEngine({ store, effectsMap });

      engine.start();
      store.getState()._setValue('f0', 'trigger');

      // All 10 levels should cascade successfully
      expect(store.getState().values.f9).toBe('from-f8');
      // f10 gets set by f9's handler (f10 has no effects so no depth issue)
      expect(store.getState().values.f10).toBe('from-f9');
      // No warning because max depth was only reached, never exceeded
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      engine.stop();
    });

    it('should warn at depth=11 (one more than the limit)', () => {
      // 11 effects: f0→f1→...→f10→f11
      // When f10 tries to run, cascadeDepth=10 >= 10 → blocked
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
            ctx.setValue(nextField, `from-f${i}`);
          }),
        ];
      }

      const store = createFormStore(initialValues);
      const engine = new EffectEngine({ store, effectsMap });

      engine.start();
      store.getState()._setValue('f0', 'trigger');

      // f10's value gets set by f9's handler, but f10's own effects are blocked
      expect(store.getState().values.f10).toBe('from-f9');
      // f11 never gets set because f10's effects were blocked at depth 10
      expect(store.getState().values.f11).toBe('');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Max cascade depth (10) reached')
      );

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // SETPROPS MERGE BEHAVIOR
  // -----------------------------------------------------------------

  describe('setProps merge behavior', () => {
    it('should merge multiple setProps calls on the same field', () => {
      const store = createFormStore({ trigger: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setProps('target', { options: ['a', 'b'] });
              ctx.setProps('target', { placeholder: 'pick one' });
              ctx.setProps('target', { disabled: true });
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState()._fieldProps.target).toEqual({
        options: ['a', 'b'],
        placeholder: 'pick one',
        disabled: true,
      });

      engine.stop();
    });

    it('should allow setProps to overwrite a previously set prop key', () => {
      const store = createFormStore({ trigger: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setProps('target', { options: ['old'] });
            }),
            createEffect('trigger', (_value, ctx) => {
              ctx.setProps('target', { options: ['new'] });
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState()._fieldProps.target).toEqual({
        options: ['new'],
      });

      engine.stop();
    });

    it('should accumulate setProps across successive value changes', () => {
      const store = createFormStore({ trigger: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (value, ctx) => {
              if (value === 'step1') {
                ctx.setProps('target', { label: 'Step 1' });
              } else if (value === 'step2') {
                ctx.setProps('target', { hint: 'Step 2 hint' });
              }
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('trigger', 'step1');
      expect(store.getState()._fieldProps.target).toEqual({ label: 'Step 1' });

      store.getState()._setValue('trigger', 'step2');
      // _setFieldProps merges, so both should be present
      expect(store.getState()._fieldProps.target).toEqual({
        label: 'Step 1',
        hint: 'Step 2 hint',
      });

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // ABORT & STOP GUARDS
  // -----------------------------------------------------------------

  describe('abort and stop guards', () => {
    it('should no-op setValue in context after engine is stopped mid-async', async () => {
      const store = createFormStore({ trigger: '', target: 'original' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', async (_value, ctx) => {
              await delay(50);
              ctx.setValue('target', 'should-not-apply');
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');
      engine.stop();

      await delay(100);

      expect(store.getState().values.target).toBe('original');
    });

    it('should no-op setProps in context after engine is stopped mid-async', async () => {
      const store = createFormStore({ trigger: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', async (_value, ctx) => {
              await delay(50);
              ctx.setProps('target', { evil: true });
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');
      engine.stop();

      await delay(100);

      expect(store.getState()._fieldProps.target).toBeUndefined();
    });

    it('should abort first async and only apply second on rapid changes', async () => {
      const store = createFormStore({ trigger: '' });
      const appliedValues: string[] = [];

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', async (value, ctx) => {
              await delay(30);
              appliedValues.push(value as string);
              ctx.setProps('target', { from: value });
            }),
          ],
        },
      });

      engine.start();

      store.getState()._setValue('trigger', 'first');
      // Immediately change again — should abort first
      store.getState()._setValue('trigger', 'second');

      await delay(100);

      // Both handlers ran, but first one's setProps was aborted
      expect(appliedValues).toEqual(['first', 'second']);
      expect(store.getState()._fieldProps.target).toEqual({ from: 'second' });

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // START/STOP LIFECYCLE
  // -----------------------------------------------------------------

  describe('start/stop lifecycle', () => {
    it('should not crash when stop() is called without start()', () => {
      const store = createFormStore({ a: '' });
      const engine = new EffectEngine({
        store,
        effectsMap: { a: [createEffect('a', vi.fn())] },
      });

      expect(() => engine.stop()).not.toThrow();
    });

    it('should not crash when stop() is called twice', () => {
      const store = createFormStore({ a: '' });
      const engine = new EffectEngine({
        store,
        effectsMap: { a: [createEffect('a', vi.fn())] },
      });

      engine.start();
      engine.stop();
      expect(() => engine.stop()).not.toThrow();
    });

    it('should work correctly after stop→start cycle', () => {
      const store = createFormStore({ trigger: '', result: '' });
      const handler = vi.fn((_value: unknown, ctx: FieldEffectContext) => {
        ctx.setValue('result', 'set');
      });

      const engine = new EffectEngine({
        store,
        effectsMap: { trigger: [createEffect('trigger', handler)] },
      });

      // First cycle
      engine.start();
      store.getState()._setValue('trigger', 'go1');
      expect(handler).toHaveBeenCalledTimes(1);
      engine.stop();

      // Reset
      handler.mockClear();
      store.getState()._setValue('result', '');

      // Second cycle — should work again
      engine.start();
      store.getState()._setValue('trigger', 'go2');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(store.getState().values.result).toBe('set');

      engine.stop();
    });

    it('should handle rapid start/stop/start cycles without leaking subscriptions', () => {
      const store = createFormStore({ trigger: '' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { trigger: [createEffect('trigger', handler)] },
      });

      // Rapid lifecycle
      for (let i = 0; i < 20; i++) {
        engine.start();
        engine.stop();
      }

      engine.start();
      store.getState()._setValue('trigger', 'final');

      // Should only have been called once from the last start
      expect(handler).toHaveBeenCalledTimes(1);

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // RUNINITIALEFFECTS EDGE CASES
  // -----------------------------------------------------------------

  describe('runInitialEffects falsy values', () => {
    it('should trigger for value 0 (zero)', () => {
      const store = createFormStore({ count: 0 });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { count: [createEffect('count', handler)] },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).toHaveBeenCalledWith(0, expect.any(Object));

      engine.stop();
    });

    it('should trigger for value false', () => {
      const store = createFormStore({ active: false });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { active: [createEffect('active', handler)] },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).toHaveBeenCalledWith(false, expect.any(Object));

      engine.stop();
    });

    it('should trigger for empty string', () => {
      const store = createFormStore({ name: '' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { name: [createEffect('name', handler)] },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).toHaveBeenCalledWith('', expect.any(Object));

      engine.stop();
    });

    it('should trigger for null', () => {
      const store = createFormStore({ field: null });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { field: [createEffect('field', handler)] },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).toHaveBeenCalledWith(null, expect.any(Object));

      engine.stop();
    });

    it('should NOT trigger for undefined', () => {
      const store = createFormStore({ field: undefined });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { field: [createEffect('field', handler)] },
      });

      engine.start();
      engine.runInitialEffects();

      expect(handler).not.toHaveBeenCalled();

      engine.stop();
    });

    it('should not run if engine was stopped before runInitialEffects', () => {
      const store = createFormStore({ field: 'value' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { field: [createEffect('field', handler)] },
      });

      engine.start();
      engine.stop();
      engine.runInitialEffects();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // CONTEXT FRESHNESS
  // -----------------------------------------------------------------

  describe('context reads fresh state', () => {
    it('getFieldValue should see values set by previous effect in same batch', () => {
      const store = createFormStore({ trigger: '', intermediate: '', final: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setValue('intermediate', 'hello');
            }),
            createEffect('trigger', (_value, ctx) => {
              // Should see the value set by the previous effect
              const val = ctx.getFieldValue('intermediate');
              ctx.setValue('final', `got-${val}`);
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState().values.intermediate).toBe('hello');
      expect(store.getState().values.final).toBe('got-hello');

      engine.stop();
    });

    it('getValues should return a snapshot including all prior mutations', () => {
      const store = createFormStore({ a: '', b: '', c: '' });
      let snapshot: Record<string, unknown> = {};

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', (_value, ctx) => {
              ctx.setValue('b', 'set-b');
              ctx.setValue('c', 'set-c');
              snapshot = ctx.getValues();
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('a', 'trigger');

      expect(snapshot.a).toBe('trigger');
      expect(snapshot.b).toBe('set-b');
      expect(snapshot.c).toBe('set-c');

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // SETTING VALUE TO A FIELD WITHOUT EFFECTS
  // -----------------------------------------------------------------

  describe('setting value on non-watched field', () => {
    it('should set value on a field that has no effects without error', () => {
      const store = createFormStore({ trigger: '', noEffects: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setValue('noEffects', 'set-by-effect');
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState().values.noEffects).toBe('set-by-effect');
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      engine.stop();
    });

    it('should set value on a field that does not exist in initial state', () => {
      const store = createFormStore({ trigger: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setValue('dynamic', 'created-by-effect');
              ctx.setProps('dynamic', { label: 'Dynamic Field' });
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState().values.dynamic).toBe('created-by-effect');
      expect(store.getState()._fieldProps.dynamic).toEqual({ label: 'Dynamic Field' });

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // ASYNC CHAINS
  // -----------------------------------------------------------------

  describe('async chains', () => {
    it('should resolve A→(async)→B→(sync)→C cascade correctly', async () => {
      const store = createFormStore({ a: '', b: '', c: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', async (_value, ctx) => {
              await delay(20);
              ctx.setValue('b', 'from-a-async');
            }),
          ],
          b: [
            createEffect('b', (_value, ctx) => {
              ctx.setValue('c', 'from-b-sync');
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('a', 'trigger');

      // B and C should not be set yet (A is async)
      expect(store.getState().values.b).toBe('');

      await vi.waitFor(
        () => {
          expect(store.getState().values.b).toBe('from-a-async');
          expect(store.getState().values.c).toBe('from-b-sync');
        },
        { timeout: 200 }
      );

      engine.stop();
    });

    it('should handle multiple independent async effects on different fields', async () => {
      const store = createFormStore({ a: '', b: '', resultA: '', resultB: '' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          a: [
            createEffect('a', async (_value, ctx) => {
              await delay(30);
              ctx.setValue('resultA', 'done-a');
            }),
          ],
          b: [
            createEffect('b', async (_value, ctx) => {
              await delay(10);
              ctx.setValue('resultB', 'done-b');
            }),
          ],
        },
      });

      engine.start();

      // Fire both at the same time
      store.getState()._setValue('a', 'go');
      store.getState()._setValue('b', 'go');

      await vi.waitFor(
        () => {
          expect(store.getState().values.resultA).toBe('done-a');
          expect(store.getState().values.resultB).toBe('done-b');
        },
        { timeout: 200 }
      );

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // STRESS
  // -----------------------------------------------------------------

  describe('stress tests', () => {
    it('should handle 50 effects watching the same field', () => {
      const store = createFormStore({ trigger: '' });
      const results: number[] = [];

      const effects: FieldEffect[] = [];
      for (let i = 0; i < 50; i++) {
        const idx = i;
        effects.push(
          createEffect('trigger', () => {
            results.push(idx);
          })
        );
      }

      const engine = new EffectEngine({
        store,
        effectsMap: { trigger: effects },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(results).toHaveLength(50);
      expect(results).toEqual(Array.from({ length: 50 }, (_, i) => i));

      engine.stop();
    });

    it('should handle 100 rapid value changes without crashing', () => {
      const store = createFormStore({ trigger: '', count: 0 });
      let counter = 0;

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', () => {
              counter++;
            }),
          ],
        },
      });

      engine.start();

      for (let i = 0; i < 100; i++) {
        store.getState()._setValue('trigger', `v${i}`);
      }

      expect(counter).toBe(100);

      engine.stop();
    });

    it('should handle 20 independent field chains simultaneously', () => {
      const initialValues: Record<string, unknown> = {};
      const effectsMap: Record<string, FieldEffect[]> = {};

      // Create 20 independent 3-field chains: srcN → midN → dstN
      for (let i = 0; i < 20; i++) {
        initialValues[`src${i}`] = '';
        initialValues[`mid${i}`] = '';
        initialValues[`dst${i}`] = '';

        effectsMap[`src${i}`] = [
          createEffect(`src${i}`, (_value, ctx) => {
            ctx.setValue(`mid${i}`, `mid-${i}`);
          }),
        ];
        effectsMap[`mid${i}`] = [
          createEffect(`mid${i}`, (_value, ctx) => {
            ctx.setValue(`dst${i}`, `dst-${i}`);
          }),
        ];
      }

      const store = createFormStore(initialValues);
      const engine = new EffectEngine({ store, effectsMap });

      engine.start();

      // Trigger all 20 chains
      for (let i = 0; i < 20; i++) {
        store.getState()._setValue(`src${i}`, 'go');
      }

      // All destinations should be set
      for (let i = 0; i < 20; i++) {
        expect(store.getState().values[`dst${i}`]).toBe(`dst-${i}`);
      }

      engine.stop();
    });
  });

  // -----------------------------------------------------------------
  // EMPTY / NO-OP CASES
  // -----------------------------------------------------------------

  describe('no-op and edge cases', () => {
    it('should handle empty effectsMap without error', () => {
      const store = createFormStore({ a: '' });
      const engine = new EffectEngine({ store, effectsMap: {} });

      engine.start();
      store.getState()._setValue('a', 'go');
      engine.runInitialEffects();
      engine.stop();

      // No crash, no warnings
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not trigger effect when value is set to the same reference', () => {
      const store = createFormStore({ trigger: 'same' });
      const handler = vi.fn();

      const engine = new EffectEngine({
        store,
        effectsMap: { trigger: [createEffect('trigger', handler)] },
      });

      engine.start();

      // Set to the exact same value — Zustand subscribeWithSelector uses Object.is
      store.getState()._setValue('trigger', 'same');

      // The store's values object IS recreated (spread), so the subscription fires
      // But we compare individual values, so handler should still fire because
      // the store.subscribe detects values changed (new object reference)
      // Actually, looking at effect-engine: it compares values[fieldId] !== prevValues[fieldId]
      // Both are 'same' string, so they ARE equal → handler should NOT fire
      expect(handler).not.toHaveBeenCalled();

      engine.stop();
    });

    it('should handle setValue to undefined', () => {
      const store = createFormStore({ trigger: '', target: 'initial' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setValue('target', undefined);
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState().values.target).toBeUndefined();

      engine.stop();
    });

    it('should handle setValue to null', () => {
      const store = createFormStore({ trigger: '', target: 'initial' });

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setValue('target', null);
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState().values.target).toBeNull();

      engine.stop();
    });

    it('should handle setValue to complex objects', () => {
      const store = createFormStore({ trigger: '' });
      const complexValue = {
        nested: { deep: [1, 2, 3] },
        fn: () => 'hello',
        date: new Date('2024-01-01'),
      };

      const engine = new EffectEngine({
        store,
        effectsMap: {
          trigger: [
            createEffect('trigger', (_value, ctx) => {
              ctx.setValue('target', complexValue);
            }),
          ],
        },
      });

      engine.start();
      store.getState()._setValue('trigger', 'go');

      expect(store.getState().values.target).toBe(complexValue);

      engine.stop();
    });
  });
});
