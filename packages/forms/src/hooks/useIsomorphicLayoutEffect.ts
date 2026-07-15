import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * State that must be synchronised BEFORE the browser paints has to run in a
 * layout effect: a passive effect is flushed in a scheduler macrotask, which
 * leaves a window where the DOM is already committed (and paintable) while the
 * derived state is still stale.
 *
 * React warns when `useLayoutEffect` runs during server rendering, where it is
 * a no-op. Falling back to `useEffect` there is safe: a server render is a
 * single pass, so there is no "previous value" to synchronise against and no
 * paint to race.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
