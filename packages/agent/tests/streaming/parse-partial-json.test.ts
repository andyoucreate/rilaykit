import { describe, expect, it } from 'vitest';
import { parsePartialJson } from '../../src/streaming/parse-partial-json';

describe('parsePartialJson', () => {
  it('parses complete JSON and reports it complete', () => {
    expect(parsePartialJson('{"a":1}')).toEqual({ value: { a: 1 }, complete: true });
  });

  it('closes a truncated object', () => {
    expect(parsePartialJson('{"a":1,"b"')).toEqual({ value: { a: 1 }, complete: false });
  });

  it('closes a truncated array', () => {
    expect(parsePartialJson('{"fields":[{"id":"name"}')).toEqual({
      value: { fields: [{ id: 'name' }] },
      complete: false,
    });
  });

  it('drops a half-written string value rather than yielding a torn one', () => {
    expect(parsePartialJson('{"label":"Na')).toEqual({ value: {}, complete: false });
  });

  it('keeps a completed sibling when the next key is half-written', () => {
    expect(parsePartialJson('{"id":"name","ty')).toEqual({
      value: { id: 'name' },
      complete: false,
    });
  });

  it('handles escaped quotes inside strings', () => {
    expect(parsePartialJson('{"q":"say \\"hi\\""}')).toEqual({
      value: { q: 'say "hi"' },
      complete: true,
    });
  });

  it('never throws on garbage — it reports incompleteness', () => {
    expect(parsePartialJson('not json at all')).toEqual({ value: undefined, complete: false });
  });

  it('handles the empty string', () => {
    expect(parsePartialJson('')).toEqual({ value: undefined, complete: false });
  });

  it('parses every prefix of a real emission without throwing', () => {
    const full =
      '{"schema":{"id":"contact","fields":[{"id":"name","type":"text","props":{"label":"Name"}}]}}';
    for (let i = 0; i <= full.length; i++) {
      expect(() => parsePartialJson(full.slice(0, i))).not.toThrow();
    }
    expect(parsePartialJson(full).complete).toBe(true);
  });
});

describe('parsePartialJson — torn-token rule', () => {
  // A number at end-of-input is ambiguous (12 may become 120 or 12.5): dropped.
  it('drops a number torn at end-of-input', () => {
    expect(parsePartialJson('{"a": 12')).toEqual({ value: {}, complete: false });
  });

  it('keeps a number once a delimiter confirms it is finished', () => {
    expect(parsePartialJson('{"a": 12,')).toEqual({ value: { a: 12 }, complete: false });
    expect(parsePartialJson('{"a":[1, 2')).toEqual({ value: { a: [1] }, complete: false });
    expect(parsePartialJson('{"a":[1, 2,')).toEqual({ value: { a: [1, 2] }, complete: false });
  });

  it('drops a torn negative sign or torn exponent', () => {
    expect(parsePartialJson('{"a": -')).toEqual({ value: {}, complete: false });
    expect(parsePartialJson('{"a": 1e')).toEqual({ value: {}, complete: false });
  });

  // Keywords are fixed tokens: fully spelled, they cannot extend into another
  // valid token, so they are kept even without a trailing delimiter.
  it('keeps a fully spelled keyword at end-of-input', () => {
    expect(parsePartialJson('{"a":true')).toEqual({ value: { a: true }, complete: false });
    expect(parsePartialJson('{"a":false')).toEqual({ value: { a: false }, complete: false });
    expect(parsePartialJson('{"a":null')).toEqual({ value: { a: null }, complete: false });
  });

  it('drops a keyword torn mid-token', () => {
    expect(parsePartialJson('{"a":tru')).toEqual({ value: {}, complete: false });
    expect(parsePartialJson('{"a":1,"b":fal')).toEqual({ value: { a: 1 }, complete: false });
  });

  it('drops a string torn inside a unicode escape', () => {
    expect(parsePartialJson('{"a":"\\u00')).toEqual({ value: {}, complete: false });
    expect(parsePartialJson('{"a":"\\u00e9')).toEqual({ value: {}, complete: false });
  });

  it('drops a string torn right after a backslash', () => {
    expect(parsePartialJson('{"a":"x\\')).toEqual({ value: {}, complete: false });
  });

  // A container materializes as soon as its opening bracket arrives, even if
  // none of its members have: the shape is known, the content is pending.
  it('materializes a container whose opening bracket arrived', () => {
    expect(parsePartialJson('[{"x":1},{"y')).toEqual({ value: [{ x: 1 }, {}], complete: false });
    expect(parsePartialJson('{"items":[')).toEqual({ value: { items: [] }, complete: false });
  });
});

describe('parsePartialJson — regressions from the brief sketch', () => {
  // Sketch: torn string value made the whole document unrecoverable.
  it('keeps completed siblings when a later string value is torn', () => {
    expect(parsePartialJson('{"a":"done","b":"par')).toEqual({
      value: { a: 'done' },
      complete: false,
    });
  });

  // Sketch: retry regex ran on the already-closed candidate, then re-appended
  // closers — a dangling colon after a completed key lost the whole document.
  it('keeps completed siblings when the input ends on a colon', () => {
    expect(parsePartialJson('{"a":1,"b":')).toEqual({ value: { a: 1 }, complete: false });
  });

  // Sketch: the dangling-key regex ("[^"]*"?) cannot span an escaped quote.
  it('handles escaped quotes inside keys, torn or completed', () => {
    expect(parsePartialJson('{"a":1,"ke\\"y":')).toEqual({ value: { a: 1 }, complete: false });
    expect(parsePartialJson('{"a":1,"ke\\"y')).toEqual({ value: { a: 1 }, complete: false });
    expect(parsePartialJson('{"say \\"hi\\"":1,"x')).toEqual({
      value: { 'say "hi"': 1 },
      complete: false,
    });
  });

  // Sketch: kept a torn number as if it were finished.
  it('does not surface an ambiguous torn number', () => {
    expect(parsePartialJson('{"a":1,"b": 34')).toEqual({ value: { a: 1 }, complete: false });
  });

  // Sketch: torn keyword or torn escape lost every completed sibling.
  it('keeps completed siblings when a keyword or escape is torn', () => {
    expect(parsePartialJson('{"ok":true,"next":nul')).toEqual({
      value: { ok: true },
      complete: false,
    });
    expect(parsePartialJson('{"ok":true,"s":"\\u25')).toEqual({
      value: { ok: true },
      complete: false,
    });
  });
});

describe('parsePartialJson — every-prefix properties over realistic emissions', () => {
  const briefEmission =
    '{"schema":{"id":"contact","fields":[{"id":"name","type":"text","props":{"label":"Name"}}]}}';

  const flowEmission = JSON.stringify({
    flow: {
      id: 'onboarding',
      name: 'User "Onboarding" Flow',
      description: null,
      version: 2,
      progress: 0.75,
      steps: [
        {
          id: 'welcome',
          kind: 'form',
          weight: -1.5e3,
          optional: false,
          fields: [
            {
              id: 'email',
              type: 'text',
              props: { label: 'E-mail', placeholder: 'you@example.com' },
            },
            { id: 'age', type: 'number', props: { min: 0, max: 120 } },
          ],
        },
        {
          id: 'review',
          kind: 'summary',
          weight: 1,
          optional: true,
          notes: 'He said "go"',
          fields: [],
        },
      ],
    },
  });

  const componentTreeEmission = JSON.stringify({
    node: {
      type: 'card',
      props: { title: 'Résumé \\ "quoted"', elevation: 2, visible: true },
      children: [
        { type: 'text', props: { content: 'Line 1\nLine 2', size: 14.5 }, children: [] },
        {
          type: 'list',
          props: { ordered: false, gap: null },
          children: [
            { type: 'item', props: { label: 'first' }, children: [] },
            { type: 'item', props: { label: 'second' }, children: [] },
          ],
        },
      ],
    },
  });

  const fixtures: ReadonlyArray<[string, string]> = [
    ['brief FormSchema emission', briefEmission],
    ['FlowSchema emission', flowEmission],
    ['ComponentNode tree emission', componentTreeEmission],
  ];

  it.each(fixtures)('%s: never throws on any prefix', (_name, full) => {
    for (let i = 0; i <= full.length; i++) {
      expect(() => parsePartialJson(full.slice(0, i))).not.toThrow();
    }
  });

  it.each(fixtures)('%s: every defined value survives a JSON round-trip', (_name, full) => {
    for (let i = 0; i <= full.length; i++) {
      const { value } = parsePartialJson(full.slice(0, i));
      if (value !== undefined) {
        expect(JSON.parse(JSON.stringify(value))).toEqual(value);
      }
    }
  });

  it.each(fixtures)('%s: only the whole emission reports complete', (_name, full) => {
    for (let i = 0; i < full.length; i++) {
      expect(parsePartialJson(full.slice(0, i)).complete).toBe(false);
    }
    expect(parsePartialJson(full)).toEqual({ value: JSON.parse(full), complete: true });
  });
});

describe('parsePartialJson — __proto__ key never grafts a prototype', () => {
  // A bare `result[key] = value` assignment routes a `__proto__` key through
  // Object.prototype's setter, which grafts the payload onto the object's
  // PROTOTYPE instead of storing it as an own key. JSON.parse never does
  // this (it always creates an own property named "__proto__"), so a
  // hand-rolled builder must match that own-property semantics exactly, or
  // the same input silently changes meaning between mid-stream and the
  // final `JSON.parse`-backed emission.

  it('keeps a top-level __proto__ key as an own property, not a grafted prototype', () => {
    const { value } = parsePartialJson('{"__proto__":{"isAdmin":true},"name":"x');
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(value as object, '__proto__')?.value).toEqual({
      isAdmin: true,
    });
  });

  it('keeps a nested __proto__ key as an own property, not a grafted prototype', () => {
    const { value } = parsePartialJson('{"user":{"__proto__":{"isAdmin":true},"name":"x');
    const user = (value as { user: unknown }).user;
    expect(Object.getPrototypeOf(user)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(user as object, '__proto__')?.value).toEqual({
      isAdmin: true,
    });
  });

  it('keeps an escaped-unicode __proto__ key as an own property, not a grafted prototype', () => {
    // _ is "_": the key spells "__proto__" only after JSON unescaping.
    const { value } = parsePartialJson(
      '{"\\u005f\\u005fproto\\u005f\\u005f":{"isAdmin":true},"name":"x'
    );
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(value as object, '__proto__')?.value).toEqual({
      isAdmin: true,
    });
  });

  it('keeps an array-valued __proto__ key as an own property, not a grafted prototype', () => {
    const { value } = parsePartialJson('{"__proto__":[1,2,3],"name":"x');
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(value as object, '__proto__')?.value).toEqual([1, 2, 3]);
  });
});

describe('parsePartialJson — pinned edge cases', () => {
  // A bare number at the root is syntactically complete JSON on its own —
  // the parser has no way to know the stream might still extend it into
  // `120` or `12.5`. This matches the documented contract ("text was itself
  // complete, valid JSON"); the root-level ambiguity is accepted as-is.
  it('reports a bare root number as complete, per the documented contract', () => {
    expect(parsePartialJson('12')).toEqual({ value: 12, complete: true });
  });

  it('does not report complete when trailing garbage follows a complete value', () => {
    expect(parsePartialJson('{"a":1}xyz')).toEqual({ value: { a: 1 }, complete: false });
  });
});
