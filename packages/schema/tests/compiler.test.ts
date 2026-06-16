import { describe, expect, it } from 'vitest';
import { normalizeSurface } from '../src/normalize';
import type { SurfaceNode, SurfaceSchema } from '../src/types';

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
    expect(graph.indexes.nodesByPath['steps[0].nodes[0]']).toBe(group);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[1]']).toBe(firstName);
    expect(graph.indexes.nodesByPath['steps[0].nodes[0].nodes[2]']).toBe(saveDraft);
  });
});
