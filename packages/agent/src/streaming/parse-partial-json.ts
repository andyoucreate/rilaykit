export interface PartialJsonResult {
  /** `undefined` when nothing parseable has arrived yet. */
  readonly value: unknown;
  /** True only when `text` was itself complete, valid JSON. */
  readonly complete: boolean;
}

/**
 * Outcome of parsing one JSON value from the stream.
 *
 * - `kind: 'value'` — a value was recovered. `closed` is true when the value
 *   ended with its own terminator (closing brace/bracket/quote, or an
 *   unambiguous scalar token followed by a delimiter). `closed: false` means
 *   the input was truncated inside the value: the parent keeps what was
 *   recovered but must stop consuming.
 * - `kind: 'drop'` — nothing recoverable here (torn scalar, invalid input, or
 *   end of input). The parent discards the current member and stops.
 */
type ParseOutcome =
  | { readonly kind: 'value'; readonly value: unknown; readonly closed: boolean }
  | { readonly kind: 'drop' };

const DROP: ParseOutcome = { kind: 'drop' };

const KEYWORDS: ReadonlyArray<{ readonly token: string; readonly value: boolean | null }> = [
  { token: 'true', value: true },
  { token: 'false', value: false },
  { token: 'null', value: null },
];

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isNumberChar(char: string): boolean {
  return isDigit(char) || char === '-' || char === '+' || char === '.' || char === 'e' || char === 'E';
}

/**
 * Recursive-descent parser tolerant to truncation at any point.
 *
 * Torn-token rule (pinned by tests):
 * - A string is kept only once its closing quote has arrived; a torn string
 *   (including one torn mid-escape or mid-`\uXXXX`) is dropped, never emitted
 *   half-written.
 * - A number that runs into end-of-input is AMBIGUOUS (`12` may become `120`
 *   or `12.5`), so it is kept only when a delimiter follows; at end-of-input
 *   it is dropped.
 * - `true`/`false`/`null` are fixed tokens: once fully spelled they cannot be
 *   extended into another valid token, so they are kept even at end-of-input;
 *   a torn prefix (`tru`) is dropped.
 * - Invalid (non-JSON) input is treated like truncation: everything recovered
 *   so far is kept, the rest is discarded, and the result is incomplete.
 */
class PartialJsonParser {
  private pos = 0;

  constructor(private readonly text: string) {}

  parse(): ParseOutcome {
    const outcome = this.parseValue();
    return outcome;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') this.pos += 1;
      else break;
    }
  }

  private parseValue(): ParseOutcome {
    this.skipWhitespace();
    if (this.pos >= this.text.length) return DROP;
    const char = this.text[this.pos];
    if (char === '{') return this.parseObject();
    if (char === '[') return this.parseArray();
    if (char === '"') return this.parseString();
    if (char === '-' || isDigit(char)) return this.parseNumber();
    if (char === 't' || char === 'f' || char === 'n') return this.parseKeyword();
    return DROP;
  }

  private parseObject(): ParseOutcome {
    this.pos += 1; // consume '{'
    const result: Record<string, unknown> = {};
    const partial = (): ParseOutcome => ({ kind: 'value', value: result, closed: false });

    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) return partial();
      if (this.text[this.pos] === '}') {
        this.pos += 1;
        return { kind: 'value', value: result, closed: true };
      }
      if (this.text[this.pos] !== '"') return partial();

      const key = this.parseString();
      if (key.kind === 'drop' || typeof key.value !== 'string') return partial();

      this.skipWhitespace();
      if (this.pos >= this.text.length || this.text[this.pos] !== ':') return partial();
      this.pos += 1; // consume ':'

      const member = this.parseValue();
      if (member.kind === 'drop') return partial();
      // `defineProperty`, not `result[key.value] = ...`: a bare assignment
      // routes a `__proto__` key through Object.prototype's setter, which
      // GRAFTS the value onto the object's prototype instead of storing it
      // as an own key. JSON.parse always creates an own property named
      // "__proto__" — this must match that exactly, or the same input
      // changes meaning between this mid-stream value and the eventual
      // JSON.parse-backed complete emission.
      Object.defineProperty(result, key.value, {
        value: member.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      if (!member.closed) return partial();

      this.skipWhitespace();
      if (this.pos >= this.text.length) return partial();
      if (this.text[this.pos] === ',') {
        this.pos += 1;
        continue;
      }
      if (this.text[this.pos] === '}') {
        this.pos += 1;
        return { kind: 'value', value: result, closed: true };
      }
      return partial();
    }
  }

  private parseArray(): ParseOutcome {
    this.pos += 1; // consume '['
    const result: unknown[] = [];
    const partial = (): ParseOutcome => ({ kind: 'value', value: result, closed: false });

    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) return partial();
      if (this.text[this.pos] === ']') {
        this.pos += 1;
        return { kind: 'value', value: result, closed: true };
      }

      const element = this.parseValue();
      if (element.kind === 'drop') return partial();
      result.push(element.value);
      if (!element.closed) return partial();

      this.skipWhitespace();
      if (this.pos >= this.text.length) return partial();
      if (this.text[this.pos] === ',') {
        this.pos += 1;
        continue;
      }
      if (this.text[this.pos] === ']') {
        this.pos += 1;
        return { kind: 'value', value: result, closed: true };
      }
      return partial();
    }
  }

  private parseString(): ParseOutcome {
    const start = this.pos;
    let i = this.pos + 1; // past opening quote
    while (i < this.text.length) {
      const char = this.text[i];
      if (char === '\\') {
        i += 2; // skip the escaped character; may jump past the end (torn escape)
        continue;
      }
      if (char === '"') {
        const token = this.text.slice(start, i + 1);
        this.pos = i + 1;
        try {
          // Delegate escape decoding (\", \n, \uXXXX…) to JSON.parse on the
          // exact token; an invalid escape sequence downgrades to a drop.
          return { kind: 'value', value: JSON.parse(token) as unknown, closed: true };
        } catch {
          return DROP;
        }
      }
      i += 1;
    }
    // Unterminated string: torn, never emit a half-written value.
    this.pos = this.text.length;
    return DROP;
  }

  private parseNumber(): ParseOutcome {
    const start = this.pos;
    while (this.pos < this.text.length && isNumberChar(this.text[this.pos])) this.pos += 1;
    // A number at end-of-input is ambiguous (12 vs 12.5 vs 120): drop it.
    if (this.pos >= this.text.length) return DROP;
    const token = this.text.slice(start, this.pos);
    try {
      return { kind: 'value', value: JSON.parse(token) as unknown, closed: true };
    } catch {
      return DROP;
    }
  }

  private parseKeyword(): ParseOutcome {
    for (const { token, value } of KEYWORDS) {
      if (this.text.startsWith(token, this.pos)) {
        this.pos += token.length;
        return { kind: 'value', value, closed: true };
      }
      // The whole remaining input is a strict prefix of the keyword: torn.
      const rest = this.text.slice(this.pos);
      if (rest.length < token.length && token.startsWith(rest)) {
        this.pos = this.text.length;
        return DROP;
      }
    }
    return DROP;
  }
}

/**
 * Best-effort parser for a JSON document truncated at an arbitrary point,
 * as produced by a model streaming structured output token by token.
 *
 * Contract: NEVER throws. A model streaming JSON produces torn input by
 * definition, so a throw here would be a crash on the golden path.
 */
export function parsePartialJson(text: string): PartialJsonResult {
  if (text.length === 0) return { value: undefined, complete: false };

  try {
    // A root-level scalar (e.g. "12") is syntactically complete JSON on its
    // own, even though a still-streaming caller could in principle extend it
    // further (`12` -> `120`); that root-level ambiguity is accepted as-is.
    return { value: JSON.parse(text) as unknown, complete: true };
  } catch {
    // Not complete JSON — fall through to tolerant recovery.
  }

  try {
    const outcome = new PartialJsonParser(text).parse();
    if (outcome.kind === 'drop') return { value: undefined, complete: false };
    return { value: outcome.value, complete: false };
  } catch {
    // Safety net (e.g. call-stack exhaustion on pathological nesting):
    // the never-throws contract wins over recovering a value.
    return { value: undefined, complete: false };
  }
}
