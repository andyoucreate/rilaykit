import { type RegistryManifest, compileSurface } from '@rilaykit/schema';
import { describe, expect, it, vi } from 'vitest';
import { createSurfaceRuntime } from '../../src/surface';

const manifest: RegistryManifest = {
  version: 1,
  fields: {
    text: {
      kind: 'field',
      validations: ['required'],
    },
    checkbox: {
      kind: 'field',
    },
  },
  actions: {
    next: {
      kind: 'action',
    },
    previous: {
      kind: 'action',
    },
    submit: {
      kind: 'action',
      handlerRequired: true,
    },
  },
  groups: {
    stack: {
      kind: 'group',
    },
  },
};

describe('createSurfaceRuntime', () => {
  it('runs screen surfaces as a single implicit step and notifies subscribers from snapshots', () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'lead',
        nodes: [{ kind: 'field', id: 'email', type: 'text' }],
      },
      manifest
    );
    const runtime = createSurfaceRuntime(compiled.graph, {
      initialValues: { email: 'hello@rilay.dev' },
    });
    const listener = vi.fn();

    const unsubscribe = runtime.subscribe(listener);
    runtime.setFieldValue('email', 'team@rilay.dev');
    unsubscribe();
    runtime.setFieldValue('email', 'ignored@rilay.dev');

    expect(runtime.getSnapshot()).toMatchObject({
      currentStepId: '__screen',
      values: { email: 'ignored@rilay.dev' },
      visibleFields: { email: true },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].values.email).toBe('team@rilay.dev');
  });

  it('evaluates field visibility conditions from runtime values', () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'conditional',
        nodes: [
          { kind: 'field', id: 'hasCompany', type: 'checkbox' },
          {
            kind: 'field',
            id: 'companyName',
            type: 'text',
            conditions: {
              visible: { field: 'hasCompany', operator: 'equals', value: true },
            },
          },
        ],
      },
      manifest
    );
    const runtime = createSurfaceRuntime(compiled.graph, {
      initialValues: { hasCompany: false },
    });

    expect(runtime.getFieldState('companyName').visible).toBe(false);

    runtime.setFieldValue('hasCompany', true);

    expect(runtime.getFieldState('companyName').visible).toBe(true);
  });

  it('validates fields and blocks navigation when the current step has errors', async () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'quote',
        steps: [
          {
            id: 'identity',
            nodes: [
              {
                kind: 'field',
                id: 'email',
                type: 'text',
                validation: [{ type: 'required', message: 'Email is required' }],
              },
            ],
          },
          {
            id: 'success',
            nodes: [],
          },
        ],
      },
      manifest
    );
    const runtime = createSurfaceRuntime(compiled.graph, {
      validationHandlers: {
        required: (value, descriptor) =>
          value === undefined || value === '' ? (descriptor.message ?? 'Required') : undefined,
      },
    });

    await expect(runtime.goNext()).resolves.toBe(false);
    expect(runtime.getSnapshot()).toMatchObject({
      currentStepId: 'identity',
      errors: { email: ['Email is required'] },
    });

    runtime.setFieldValue('email', 'hello@rilay.dev');

    await expect(runtime.goNext()).resolves.toBe(true);
    expect(runtime.getSnapshot().currentStepId).toBe('success');
    expect(runtime.getSnapshot().errors.email).toBeUndefined();
  });

  it('skips invisible flow steps during navigation', async () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'adaptive-flow',
        steps: [
          {
            id: 'start',
            nodes: [{ kind: 'field', id: 'needsDetails', type: 'checkbox' }],
          },
          {
            id: 'details',
            conditions: {
              visible: { field: 'needsDetails', operator: 'equals', value: true },
            },
            nodes: [{ kind: 'field', id: 'detail', type: 'text' }],
          },
          {
            id: 'summary',
            nodes: [],
          },
        ],
      },
      manifest
    );
    const runtime = createSurfaceRuntime(compiled.graph, {
      initialValues: { needsDetails: false },
    });

    await expect(runtime.goNext()).resolves.toBe(true);
    expect(runtime.getSnapshot().currentStepId).toBe('summary');

    await expect(runtime.goPrevious()).resolves.toBe(true);
    expect(runtime.getSnapshot().currentStepId).toBe('start');
  });

  it('keeps the current step when navigating past the end of a flow', async () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'flow',
        id: 'bounded-flow',
        steps: [
          {
            id: 'only',
            nodes: [],
          },
        ],
      },
      manifest
    );
    const runtime = createSurfaceRuntime(compiled.graph);

    await expect(runtime.goNext()).resolves.toBe(false);

    expect(runtime.getSnapshot().currentStepId).toBe('only');
    expect(runtime.getSnapshot().currentStepIndex).toBe(0);
  });

  it('dispatches app-owned actions with a portable snapshot instead of built-in persistence', async () => {
    const compiled = compileSurface(
      {
        version: 2,
        kind: 'surface',
        mode: 'screen',
        id: 'submit-lead',
        nodes: [
          { kind: 'field', id: 'email', type: 'text' },
          {
            kind: 'action',
            id: 'submitLead',
            type: 'submit',
            handler: 'createLead',
          },
        ],
      },
      manifest
    );
    const createLead = vi.fn();
    const runtime = createSurfaceRuntime(compiled.graph, {
      initialValues: { email: 'team@rilay.dev' },
      actionHandlers: {
        createLead,
      },
    });

    await runtime.dispatchAction('submitLead');

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ id: 'submitLead', handler: 'createLead' }),
        snapshot: expect.objectContaining({
          values: { email: 'team@rilay.dev' },
          surfaceId: 'submit-lead',
        }),
      })
    );
    expect(runtime.getSnapshot().status).toBe('idle');
  });
});
