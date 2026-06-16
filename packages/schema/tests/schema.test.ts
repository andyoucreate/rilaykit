import { describe, expect, it } from 'vitest';
import { isSurfaceSchema } from '../src/schemas';

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
      }),
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
      }),
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
      }),
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
      }),
    ).toBe(false);
  });
});
