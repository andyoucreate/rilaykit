/**
 * Own-property access for string-keyed tables indexed by untrusted input.
 *
 * A plain object inherits from `Object.prototype`, so `table[key]` and
 * `key in table` both answer truthily for `toString`, `constructor`,
 * `__proto__`, `hasOwnProperty`, `valueOf` and friends. Any table indexed by a
 * key that came from outside — a JSON schema's validator type, an effect
 * handler name, a field id, a binding reference — must therefore be read
 * through an own-property guard, or a hostile (or merely unlucky) key resolves
 * to an inherited method and the caller proceeds on a value that was never
 * registered.
 *
 * Module-owned tables should prefer a `Map` outright; these helpers exist for
 * the tables that arrive from the consumer or are pinned by a public type to
 * `Record<string, T>`.
 */

/**
 * Reads `table[key]` only when `key` is an OWN property of `table`.
 *
 * @returns The entry, or `undefined` when the table is absent or the key is
 *   only inherited.
 */
export function getOwn<T>(table: Record<string, T> | undefined, key: string): T | undefined {
  if (table === undefined || table === null) return undefined;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/**
 * Own-property membership test — the prototype-safe replacement for `key in table`.
 */
export function hasOwn(table: object | undefined, key: string): boolean {
  if (table === undefined || table === null) return false;
  return Object.prototype.hasOwnProperty.call(table, key);
}
