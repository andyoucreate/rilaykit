import { describe, expect, it } from 'vitest';
import { isRegistryManifest, isSurfaceSchema } from '../src/schemas';

describe('SurfaceSchema validation', () => {
  it('accepts a screen surface with nodes', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'summary',
        nodes: [
          {
            kind: 'content',
            type: 'text',
            props: { text: 'Hello' },
          },
        ],
      })
    ).toBe(true);
  });

  it('accepts a flow surface with steps', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'quote',
        steps: [
          {
            id: 'identity',
            title: 'Identity',
            nodes: [{ kind: 'field', id: 'email', type: 'text' }],
          },
        ],
      })
    ).toBe(true);
  });

  it('rejects a screen surface with steps instead of nodes', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'bad',
        steps: [],
      })
    ).toBe(false);
  });

  it('rejects a flow surface with nodes instead of steps', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'bad',
        nodes: [],
      })
    ).toBe(false);
  });

  it('rejects non-JSON values in node props', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'bad',
        nodes: [
          {
            kind: 'content',
            type: 'text',
            props: { render: () => 'Hello' },
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects non-JSON values in metadata', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'bad',
        metadata: { symbol: Symbol('bad') },
        nodes: [],
      })
    ).toBe(false);
  });

  it('rejects non-JSON field default values', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'bad',
        nodes: [
          {
            kind: 'field',
            id: 'startedAt',
            type: 'date',
            defaultValue: new Date(),
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects non-JSON condition values', () => {
    expect(
      isSurfaceSchema({
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'bad',
        nodes: [
          {
            kind: 'field',
            id: 'email',
            type: 'text',
            conditions: {
              visible: {
                field: 'status',
                operator: 'equals',
                value: () => 'active',
              },
            },
          },
        ],
      })
    ).toBe(false);
  });
});

describe('RegistryManifest validation', () => {
  it('rejects non-JSON values in examples', () => {
    expect(
      isRegistryManifest({
        version: 1,
        fields: {
          text: {
            kind: 'field',
            examples: [{ props: { normalize: () => 'bad' } }],
          },
        },
      })
    ).toBe(false);
  });

  it('rejects non-JSON values in capabilities', () => {
    expect(
      isRegistryManifest({
        version: 1,
        actions: {
          submit: {
            kind: 'action',
            capabilities: { run: () => undefined },
          },
        },
      })
    ).toBe(false);
  });
});
