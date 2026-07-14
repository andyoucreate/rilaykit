import type { FieldEffect, FieldEffectContext } from '@rilaykit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectEngine } from '../../src/effects/effect-engine';
import { createFormStore } from '../../src/stores/formStore';

function createEffect(
  watchFieldId: string,
  handler: (value: unknown, ctx: FieldEffectContext) => void | Promise<void>
): FieldEffect {
  return { trigger: 'change', watchFieldId, handler };
}

describe('EffectEngine — async cascade guard (BUG 6)', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('CAPS handler invocations for two mutually-writing async effects (A↔B)', async () => {
    const store = createFormStore({ a: 0, b: 0 });

    let aCount = 0;
    let bCount = 0;

    const engine = new EffectEngine({
      store,
      effectsMap: {
        a: [
          createEffect('a', async (_value, ctx) => {
            aCount++;
            // Async continuation across a macrotask — escapes the sync guards.
            await new Promise((resolve) => setTimeout(resolve, 1));
            // Always write a distinct value so the change always propagates.
            ctx.setValue('b', 1000 + aCount);
          }),
        ],
        b: [
          createEffect('b', async (_value, ctx) => {
            bCount++;
            await new Promise((resolve) => setTimeout(resolve, 1));
            ctx.setValue('a', 2000 + bCount);
          }),
        ],
      },
    });

    engine.start();

    // One user-initiated change kicks off the mutual cascade.
    store.getState()._setValue('a', 1);

    // Advance a virtual window far larger than any bounded cascade needs.
    // Without the guard, one hop happens per ~1ms tick → count climbs toward 100.
    await vi.advanceTimersByTimeAsync(100);

    const total = aCount + bCount;

    // A bounded cascade must not grow with the size of the time window.
    expect(total).toBeLessThanOrEqual(12);

    engine.stop();
  });
});
