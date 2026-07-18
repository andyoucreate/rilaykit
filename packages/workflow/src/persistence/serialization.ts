/**
 * JSON serialization that survives the values a plain `JSON.stringify`/`parse`
 * silently corrupts. Persisted workflow VALUES are the developer's field data —
 * a Date picker, a numeric field that parsed to NaN, a huge id — and bare JSON
 * turns a `Date` into an ISO string, `NaN`/`Infinity` into `null`, and THROWS on
 * a `BigInt`. Auto-persistence saves this data the developer never manually
 * serialized, so the corruption would be silent.
 *
 * Non-JSON-safe values are encoded as a tagged wrapper `{ [TAG]: kind, value }`
 * and decoded on load. The tag key is deliberately unlikely to collide with real
 * data; a value that legitimately carries it is passed through untouched unless
 * its shape matches an encoding exactly.
 */

import { hasOwn } from '@rilaykit/core';

const TAG = '__rilayType__';

interface Tagged {
  readonly [TAG]: 'date' | 'bigint' | 'number';
  readonly value: string;
}

function isTagged(value: unknown): value is Tagged {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasOwn(value, TAG) &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}

/**
 * The replacer reads `this[key]` — the RAW value — because `JSON.stringify`
 * applies `Date.prototype.toJSON` (→ ISO string) BEFORE calling the replacer, so
 * `value` alone can no longer tell a Date from a string. `NaN`/`Infinity`/`-0`
 * reach the replacer as numbers (before being nulled), and a `BigInt` reaches it
 * before the throw, so returning a tagged object here avoids both.
 */
function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key];
  if (raw instanceof Date) {
    return { [TAG]: 'date', value: raw.toISOString() } satisfies Tagged;
  }
  if (typeof value === 'bigint') {
    return { [TAG]: 'bigint', value: value.toString() } satisfies Tagged;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { [TAG]: 'number', value: 'NaN' } satisfies Tagged;
    if (value === Number.POSITIVE_INFINITY)
      return { [TAG]: 'number', value: 'Infinity' } satisfies Tagged;
    if (value === Number.NEGATIVE_INFINITY)
      return { [TAG]: 'number', value: '-Infinity' } satisfies Tagged;
    if (Object.is(value, -0)) return { [TAG]: 'number', value: '-0' } satisfies Tagged;
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (!isTagged(value)) return value;
  switch (value[TAG]) {
    case 'date':
      return new Date(value.value);
    case 'bigint':
      return BigInt(value.value);
    case 'number':
      switch (value.value) {
        case 'NaN':
          return Number.NaN;
        case 'Infinity':
          return Number.POSITIVE_INFINITY;
        case '-Infinity':
          return Number.NEGATIVE_INFINITY;
        case '-0':
          return -0;
        default:
          return value;
      }
    default:
      return value;
  }
}

/** Serialize workflow data, preserving Date/NaN/Infinity/-0/BigInt. */
export function serializePersistedData(value: unknown): string {
  return JSON.stringify(value, replacer);
}

/** Deserialize workflow data written by {@link serializePersistedData}. */
export function deserializePersistedData(text: string): unknown {
  return JSON.parse(text, reviver);
}
