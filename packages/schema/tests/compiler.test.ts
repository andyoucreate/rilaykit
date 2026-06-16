import { describe, expect, it } from 'vitest';
import { compileSurface } from '../src/compiler';
import { ManifestValidationError, SchemaValidationError } from '../src/errors';
import { normalizeSurface } from '../src/normalize';
import type { RegistryManifest, SurfaceNode, SurfaceSchema } from '../src/types';

describe('normalizeSurface', () => {
  it('normalizes a screen to one implicit step and indexes fields and node paths', () => {
    const field = { kind: 'field', id: 'email', type: 'text' } as const;
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      title: 'Signup',
      description: 'Create an account',
      metadata: { section: 'auth' },
      nodes: [field],
    } satisfies SurfaceSchema;

    const graph = normalizeSurface(surface);

    expect(graph.surfaceId).toBe('signup');
    expect(graph.mode).toBe('screen');
    expect(graph.steps).toEqual([
      {
        id: '__screen',
        implicit: true,
        title: 'Signup',
        description: 'Create an account',
        metadata: { section: 'auth' },
        nodes: [field],
      },
    ]);
    expect(graph.indexes.fields.email).toBe(field);
    expect(graph.indexes.nodesByPath['steps[0]']).toBe(graph.steps[0]);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0]']).toBe(field);
  });

  it('preserves declared flow steps and indexes fields and actions', () => {
    const firstName = { kind: 'field', id: 'firstName', type: 'text' } as const;
    const submit = { kind: 'action', id: 'submitQuote', type: 'submit' } as const;
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'flow',
      id: 'quote',
      steps: [
        {
          id: 'details',
          title: 'Details',
          description: 'Customer details',
          metadata: { order: 1 },
          conditions: { visible: { field: 'ready', operator: 'equals', value: true } },
          nodes: [firstName],
        },
        {
          id: 'confirm',
          title: 'Confirm',
          nodes: [submit],
        },
      ],
    } satisfies SurfaceSchema;

    const graph = normalizeSurface(surface);

    expect(graph.surfaceId).toBe('quote');
    expect(graph.mode).toBe('flow');
    expect(graph.steps).toEqual(surface.steps);
    expect(graph.steps[0]).not.toHaveProperty('implicit');
    expect(graph.steps[1]).not.toHaveProperty('implicit');
    expect(graph.indexes.fields.firstName).toBe(firstName);
    expect(graph.indexes.actions.submitQuote).toBe(submit);
  });

  it('indexes nested group fields, actions, and node paths', () => {
    const firstName = { kind: 'field', id: 'firstName', type: 'text' } as const;
    const saveDraft = { kind: 'action', id: 'saveDraft', type: 'button' } as const;
    const group = {
      kind: 'group',
      type: 'section',
      nodes: [{ kind: 'content', type: 'text' }, firstName, saveDraft],
    } satisfies SurfaceNode;
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'nested',
      nodes: [group],
    } satisfies SurfaceSchema;

    const graph = normalizeSurface(surface);

    expect(graph.indexes.fields.firstName).toBe(firstName);
    expect(graph.indexes.actions.saveDraft).toBe(saveDraft);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0]']).toEqual(group);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0]']).not.toBe(group);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[1]']).toBe(firstName);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[2]']).toBe(saveDraft);
  });

  it('keeps the normalized graph stable when the source structure is mutated later', () => {
    const originalField: SurfaceNode = { kind: 'field', id: 'firstName', type: 'text' };
    const addedField: SurfaceNode = { kind: 'field', id: 'lastName', type: 'text' };
    const group: SurfaceNode = {
      kind: 'group',
      type: 'section',
      nodes: [originalField],
    };
    const surface: SurfaceSchema = {
      version: 2,
      kind: 'surface',
      mode: 'flow',
      id: 'stable',
      steps: [
        {
          id: 'details',
          nodes: [group],
        },
        {
          id: 'confirm',
          nodes: [{ kind: 'action', id: 'submit', type: 'submit' }],
        },
      ],
    };

    const graph = normalizeSurface(surface);
    const firstStep = graph.steps[0];
    const normalizedGroup = graph.indexes.nodesByPath['steps[0].nodes[0]'] as Extract<
      SurfaceNode,
      { kind: 'group' }
    >;

    surface.steps.reverse();
    surface.steps[1].nodes.push(addedField);
    group.nodes.push(addedField);

    expect(graph.steps.map((step) => step.id)).toEqual(['details', 'confirm']);
    expect(graph.steps[0]).toBe(firstStep);
    expect(graph.steps[0].nodes).toHaveLength(1);
    expect(normalizedGroup.nodes).toEqual([originalField]);
    expect(graph.indexes.nodesByPath['steps[0]']).toBe(firstStep);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0]']).toBe(normalizedGroup);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[0]']).toBe(originalField);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[1]']).toBeUndefined();
    expect(graph.indexes.fields).toEqual({ firstName: originalField });
  });
});

describe('compileSurface', () => {
  const manifest = {
    version: 1,
    fields: {
      text: { kind: 'field' },
    },
    actions: {
      submit: { kind: 'action', handlerRequired: true },
    },
  } satisfies RegistryManifest;

  it('validates and compiles a surface with indexed fields and actions', () => {
    const email = { kind: 'field', id: 'email', type: 'text' } as const;
    const submit = { kind: 'action', id: 'submitSignup', type: 'submit', handler: 'submit' } as const;
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [email, submit],
    } satisfies SurfaceSchema;

    const compiled = compileSurface(surface, manifest);

    expect(compiled.graph.surfaceId).toBe('signup');
    expect(compiled.graph.indexes.fields.email).toEqual(email);
    expect(compiled.graph.indexes.actions.submitSignup).toEqual(submit);
  });

  it('throws SchemaValidationError when the surface shape is invalid', () => {
    const call = () => compileSurface({ kind: 'surface', mode: 'screen' }, manifest);

    expect(call).toThrow(SchemaValidationError);
    expect(call).toThrow('Invalid surface schema:');

    try {
      call();
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).issues[0].path[0]).toBe('surface');
    }
  });

  it('throws SchemaValidationError when the manifest shape is invalid', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [],
    } satisfies SurfaceSchema;

    const call = () => compileSurface(surface, { version: 2 });

    expect(call).toThrow(SchemaValidationError);
    expect(call).toThrow('Invalid registry manifest:');

    try {
      call();
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).issues[0].path).toEqual(['manifest', 'version']);
    }
  });

  it('throws ManifestValidationError when the surface does not match the manifest', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [{ kind: 'field', id: 'email', type: 'unknown' }],
    } satisfies SurfaceSchema;

    expect(() => compileSurface(surface, manifest)).toThrow(ManifestValidationError);
  });

  it('returns the normalized graph without duplicating normalization behavior', () => {
    const surface = {
      version: 2,
      kind: 'surface',
      mode: 'screen',
      id: 'signup',
      nodes: [{ kind: 'field', id: 'email', type: 'text' }],
    } satisfies SurfaceSchema;

    expect(compileSurface(surface, manifest).graph).toEqual(normalizeSurface(surface));
  });
});
