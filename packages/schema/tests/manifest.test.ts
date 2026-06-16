import { describe, expect, it } from 'vitest';
import { ManifestValidationError } from '../src/errors';
import { assertSurfaceMatchesManifest, getManifestEntry } from '../src/manifest';
import type { RegistryManifest, SurfaceSchema } from '../src/types';

const manifest = {
  version: 1,
  fields: {
    text: { kind: 'field', validations: ['required', 'minLength'] },
    email: { kind: 'field', validations: ['required', 'email'] },
    readonly: { kind: 'field' },
  },
  content: {
    text: { kind: 'content' },
  },
  actions: {
    submit: { kind: 'action', handlerRequired: true },
    cancel: { kind: 'action' },
  },
  groups: {
    section: { kind: 'group' },
  },
  slots: {
    footer: { kind: 'slot' },
  },
} satisfies RegistryManifest;

function captureManifestError(callback: () => void): ManifestValidationError {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestValidationError);
    return error as ManifestValidationError;
  }

  throw new Error('Expected ManifestValidationError');
}

describe('getManifestEntry', () => {
  it('returns registry entries by node kind and type', () => {
    expect(getManifestEntry(manifest, { kind: 'field', type: 'text' })).toBe(manifest.fields.text);
    expect(getManifestEntry(manifest, { kind: 'content', type: 'text' })).toBe(
      manifest.content.text
    );
    expect(getManifestEntry(manifest, { kind: 'action', type: 'submit' })).toBe(
      manifest.actions.submit
    );
    expect(getManifestEntry(manifest, { kind: 'group', type: 'section' })).toBe(
      manifest.groups.section
    );
    expect(getManifestEntry(manifest, { kind: 'slot', type: 'footer' })).toBe(
      manifest.slots.footer
    );
  });

  it('returns undefined for unknown registry entries', () => {
    expect(getManifestEntry(manifest, { kind: 'field', type: 'missing' })).toBeUndefined();
  });
});

describe('assertSurfaceMatchesManifest', () => {
  it('accepts a surface that only uses registered node and validation types', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [
        {
          kind: 'group',
          type: 'section',
          nodes: [
            {
              kind: 'field',
              id: 'email',
              type: 'email',
              validation: [{ type: 'required' }, { type: 'email' }],
            },
          ],
        },
        { kind: 'content', type: 'text', props: { text: 'Terms' } },
        { kind: 'slot', type: 'footer' },
        { kind: 'action', type: 'submit', handler: 'submitSignup' },
      ],
    } satisfies SurfaceSchema;

    expect(() => assertSurfaceMatchesManifest(surface, manifest)).not.toThrow();
  });

  it('reports an unknown node type with the node type path', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'flow',
      id: 'quote',
      steps: [
        {
          id: 'details',
          nodes: [
            { kind: 'content', type: 'text' },
            { kind: 'field', id: 'lastName', type: 'missing' },
          ],
        },
      ],
    } satisfies SurfaceSchema;

    const error = captureManifestError(() => assertSurfaceMatchesManifest(surface, manifest));

    expect(error.issues).toEqual([
      {
        path: ['steps', 0, 'nodes', 1, 'type'],
        message: 'Unknown field type "missing"',
        code: 'manifest_unknown_type',
      },
    ]);
    expect(error.message).toContain('[steps[0].nodes[1].type]');
  });

  it('reports validations that are not allowed by the field manifest entry', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [
        {
          kind: 'field',
          id: 'email',
          type: 'email',
          validation: [{ type: 'required' }, { type: 'url' }],
        },
      ],
    } satisfies SurfaceSchema;

    const error = captureManifestError(() => assertSurfaceMatchesManifest(surface, manifest));

    expect(error.issues).toEqual([
      {
        path: ['nodes', 0, 'validation', 1, 'type'],
        message: 'Validation type "url" is not allowed for field type "email"',
        code: 'manifest_unknown_validation',
      },
    ]);
  });

  it('rejects field validations when the field manifest entry defines no validations', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'readonly',
      nodes: [
        {
          kind: 'field',
          id: 'reference',
          type: 'readonly',
          validation: [{ type: 'required' }],
        },
      ],
    } satisfies SurfaceSchema;

    const error = captureManifestError(() => assertSurfaceMatchesManifest(surface, manifest));

    expect(error.issues).toEqual([
      {
        path: ['nodes', 0, 'validation', 0, 'type'],
        message: 'Validation type "required" is not allowed for field type "readonly"',
        code: 'manifest_unknown_validation',
      },
    ]);
  });

  it('reports missing required action handlers', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [{ kind: 'action', type: 'submit' }],
    } satisfies SurfaceSchema;

    const error = captureManifestError(() => assertSurfaceMatchesManifest(surface, manifest));

    expect(error.issues).toEqual([
      {
        path: ['nodes', 0, 'handler'],
        message: 'Action type "submit" requires a handler',
        code: 'manifest_missing_handler',
      },
    ]);
  });

  it('reports nested group node paths precisely', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'nested',
      nodes: [
        {
          kind: 'group',
          type: 'section',
          nodes: [
            {
              kind: 'field',
              id: 'website',
              type: 'text',
              validation: [{ type: 'url' }],
            },
          ],
        },
      ],
    } satisfies SurfaceSchema;

    const error = captureManifestError(() => assertSurfaceMatchesManifest(surface, manifest));

    expect(error.issues[0].path).toEqual(['nodes', 0, 'nodes', 0, 'validation', 0, 'type']);
    expect(error.message).toContain('[nodes[0].nodes[0].validation[0].type]');
  });

  it('accumulates flow issues across steps and nested groups', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'flow',
      id: 'quote',
      steps: [
        {
          id: 'details',
          nodes: [
            {
              kind: 'group',
              type: 'section',
              nodes: [
                {
                  kind: 'field',
                  id: 'website',
                  type: 'text',
                  validation: [{ type: 'url' }],
                },
              ],
            },
          ],
        },
        {
          id: 'submit',
          nodes: [{ kind: 'action', type: 'submit' }],
        },
      ],
    } satisfies SurfaceSchema;

    const error = captureManifestError(() => assertSurfaceMatchesManifest(surface, manifest));

    expect(error.issues).toEqual([
      {
        path: ['steps', 0, 'nodes', 0, 'nodes', 0, 'validation', 0, 'type'],
        message: 'Validation type "url" is not allowed for field type "text"',
        code: 'manifest_unknown_validation',
      },
      {
        path: ['steps', 1, 'nodes', 0, 'handler'],
        message: 'Action type "submit" requires a handler',
        code: 'manifest_missing_handler',
      },
    ]);
    expect(error.message).toContain('[steps[0].nodes[0].nodes[0].validation[0].type]');
    expect(error.message).toContain('[steps[1].nodes[0].handler]');
  });
});
