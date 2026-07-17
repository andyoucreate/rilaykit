import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageMonitoringAdapter } from '../../src/monitoring/adapters';

/**
 * `localStorage` access can throw even when the object exists: Safari private
 * browsing and disabled-cookie modes throw a SecurityError from setItem/
 * removeItem, and under SSR the global is absent (ReferenceError). `send` and
 * `getStoredEvents` already swallow this; `clearStoredEvents` did not, so a
 * consumer clearing monitoring buffers in those environments crashed. Every
 * localStorage-touching method must degrade, not throw.
 */
describe('LocalStorageMonitoringAdapter is robust to a throwing localStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clearStoredEvents does not throw when removeItem throws', () => {
    const adapter = new LocalStorageMonitoringAdapter();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    expect(() => adapter.clearStoredEvents()).not.toThrow();
  });

  it('send does not throw when setItem throws (control — already guarded)', async () => {
    const adapter = new LocalStorageMonitoringAdapter();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    await expect(adapter.send([{ type: 'x' } as never])).resolves.toBeUndefined();
  });

  it('getStoredEvents returns [] when getItem throws (control — already guarded)', () => {
    const adapter = new LocalStorageMonitoringAdapter();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    expect(adapter.getStoredEvents()).toEqual([]);
  });
});
