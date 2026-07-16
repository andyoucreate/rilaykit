import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '../../src/components/Form';
import { FormBody } from '../../src/components/FormBody';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';
import { type FormStore, useFormStoreApi } from '../../src/stores';

const MockTags = ({ field, id }: ComponentRenderContext) => (
  <div data-testid={`value-${id}`}>{JSON.stringify(field?.value ?? null)}</div>
);

const MockText = ({ field, id }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

/**
 * THE TORN COMPOSITE DEFAULT — a late default that ARRIVES TWICE.
 *
 * A streamed `"default": ["alpha","beta"]` cut mid-array recovers as
 * `["alpha"]`, seeds the field, and becomes the committed baseline. When the
 * completed emission arrives, the field already exists AND already has a
 * baseline default, so the late-default detection (which only knows "a default
 * APPEARED") never fires — the torn value freezes through `ready` and into
 * submit: an UNTOUCHED field submits a value diverging from the emission with
 * no user action.
 *
 * The upgrade rides the exact untouched-guard family the campaign proved
 * airtight against the workflow echo: a field may only be re-seeded while its
 * live value IS (by identity) the committed baseline default, it is untouched,
 * and the newly compiled default differs from the baseline IN VALUE. Any user
 * write replaces the value's identity, any blur marks it touched, and an
 * echoed-back equal value differs in nothing — all three keep blocking, pinned
 * below.
 */

function createRil() {
  return ril
    .create()
    .component('tags', { name: 'Tags', renderer: MockTags })
    .component('text', { name: 'Text Input', renderer: MockText });
}

function tagsSchema(defaultTags: string[]): FormSchema {
  return {
    version: 1,
    id: 'prefs-form',
    fields: [{ id: 'tags', type: 'tags', props: {}, default: defaultTags }],
  };
}

function CaptureStore({ onStore }: { onStore: (store: FormStore) => void }) {
  onStore(useFormStoreApi());
  return null;
}

describe('FormProvider upgrades an untouched torn streamed default when it completes', () => {
  it('an untouched field cut mid-array ends at the COMPLETE default — parity with a single-chunk render', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    // Chunk 1: `"default":["alpha","beta"]` cut after `"alpha",` recovers as
    // ["alpha"] — same field shape as the completed emission, so no signature
    // ever moves between the two compiles.
    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });
    const completed = compileForm(tagsSchema(['alpha', 'beta']), config);

    let storeRef: FormStore | null = null;

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form
            formConfig={compiled.formConfig}
            defaultValues={compiled.defaultValues}
            onSubmit={onSubmit}
          >
            <CaptureStore
              onStore={(store) => {
                storeRef = store;
              }}
            />
            <FormBody />
            <button type="submit" data-testid="submit">
              Submit
            </button>
          </Form>
        </>
      );
    }

    render(<Host />);
    expect(screen.getByTestId('value-tags')).toHaveTextContent('["alpha"]');

    // The completed emission arrives; the field was never touched.
    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() =>
      expect(screen.getByTestId('value-tags')).toHaveTextContent('["alpha","beta"]')
    );

    // The upgraded default IS the new baseline: a later no-arg reset restores
    // the complete emission, not the torn prefix.
    expect(storeRef?.getState()._defaultValues.tags).toEqual(['alpha', 'beta']);

    // ...and it is what submit carries.
    fireEvent.click(screen.getByTestId('submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ tags: ['alpha', 'beta'] });
  });

  it('parity oracle: the multi-chunk value equals a single-chunk render of the same complete schema', async () => {
    const config = createRil();

    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });
    const completed = compileForm(tagsSchema(['alpha', 'beta']), config);

    function StreamedHost() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    const streamed = render(<StreamedHost />);
    fireEvent.click(streamed.getByTestId('complete'));
    const streamedValue = await waitFor(() => streamed.getByTestId('value-tags').textContent);
    streamed.unmount();

    // The oracle: one render of the complete schema, no streaming involved.
    const oracle = render(
      <Form formConfig={completed.formConfig} defaultValues={completed.defaultValues}>
        <FormBody />
      </Form>
    );
    expect(streamedValue).toBe(oracle.getByTestId('value-tags').textContent);
    expect(streamedValue).toBe('["alpha","beta"]');
  });

  it('NEVER upgrades over a value the user set — a user write replaces the baseline identity', async () => {
    const config = createRil();

    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });
    const completed = compileForm(tagsSchema(['alpha', 'beta']), config);

    let storeRef: FormStore | null = null;

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <CaptureStore
              onStore={(store) => {
                storeRef = store;
              }}
            />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    // The user replaces the seeded array — a write, no blur needed.
    act(() => {
      storeRef?.getState()._setValue('tags', ['mine']);
    });

    fireEvent.click(screen.getByTestId('complete'));

    await waitFor(() => expect(screen.getByTestId('value-tags')).toHaveTextContent('["mine"]'));
  });

  it('NEVER upgrades a TOUCHED field, even while it still holds the seeded default', async () => {
    const config = createRil();

    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });
    const completed = compileForm(tagsSchema(['alpha', 'beta']), config);

    let storeRef: FormStore | null = null;

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <CaptureStore
              onStore={(store) => {
                storeRef = store;
              }}
            />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    // The store's own touched tracking — what a blur records — is the guard.
    act(() => {
      storeRef?.getState()._setTouched('tags');
    });

    fireEvent.click(screen.getByTestId('complete'));

    await waitFor(() => expect(screen.getByTestId('value-tags')).toHaveTextContent('["alpha"]'));
  });

  it('a keystroke-masked completion never overwrites: the user typed over the torn STRING default', async () => {
    const config = createRil();

    const torn = compileForm(
      {
        version: 1,
        id: 'prefs-form',
        fields: [{ id: 'name', type: 'text', props: {}, default: 'al' }],
      },
      config,
      { lenient: true }
    );
    const completed = compileForm(
      {
        version: 1,
        id: 'prefs-form',
        fields: [{ id: 'name', type: 'text', props: {}, default: 'alpha' }],
      },
      config
    );

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    expect(screen.getByTestId('input-name')).toHaveValue('al');

    // The user types over the torn default — no blur, touched never set.
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'custom' } });

    fireEvent.click(screen.getByTestId('complete'));

    await waitFor(() => expect(screen.getByTestId('input-name')).toHaveValue('custom'));
  });

  it('still upgrades after a GROWTH pass — the rewritten baseline keeps the pristine value identity', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    // Chunk 1: `tags`' default torn as ["alpha"].
    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });
    // Chunk 2: GROWTH — a `notes` field appends; `tags`' default is STILL torn.
    // The growth pass rewrites `_defaultValues` from this compile's fresh
    // clones: if it re-clones the untouched `tags` baseline instead of keeping
    // the live value's identity, the upgrade below is silently lost.
    const grown = compileForm(
      {
        version: 1,
        id: 'prefs-form',
        fields: [
          { id: 'tags', type: 'tags', props: {}, default: ['alpha'] },
          { id: 'notes', type: 'text', props: {} },
        ],
      },
      config,
      { lenient: true }
    );
    // Chunk 3: the SAME emission completes `tags`' default.
    const completed = compileForm(
      {
        version: 1,
        id: 'prefs-form',
        fields: [
          { id: 'tags', type: 'tags', props: {}, default: ['alpha', 'beta'] },
          { id: 'notes', type: 'text', props: {} },
        ],
      },
      config
    );

    let storeRef: FormStore | null = null;

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(grown)}>
            grow
          </button>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form
            formConfig={compiled.formConfig}
            defaultValues={compiled.defaultValues}
            onSubmit={onSubmit}
          >
            <CaptureStore
              onStore={(store) => {
                storeRef = store;
              }}
            />
            <FormBody />
            <button type="submit" data-testid="submit">
              Submit
            </button>
          </Form>
        </>
      );
    }

    render(<Host />);
    expect(screen.getByTestId('value-tags')).toHaveTextContent('["alpha"]');

    // The growth chunk lands; `tags` is untouched throughout.
    fireEvent.click(screen.getByTestId('grow'));
    await waitFor(() => expect(screen.getByTestId('input-notes')).toBeInTheDocument());
    expect(screen.getByTestId('value-tags')).toHaveTextContent('["alpha"]');

    // The completing chunk lands: parity with the no-growth path above — the
    // untouched field must end at the COMPLETE default.
    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() =>
      expect(screen.getByTestId('value-tags')).toHaveTextContent('["alpha","beta"]')
    );
    expect(storeRef?.getState()._defaultValues.tags).toEqual(['alpha', 'beta']);

    fireEvent.click(screen.getByTestId('submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ tags: ['alpha', 'beta'], notes: undefined });
  });

  it('a growth pass never turns a pristine object-valued field dirty — the baseline keeps its identity', async () => {
    const config = createRil();

    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });
    const grown = compileForm(
      {
        version: 1,
        id: 'prefs-form',
        fields: [
          { id: 'tags', type: 'tags', props: {}, default: ['alpha'] },
          { id: 'notes', type: 'text', props: {} },
        ],
      },
      config,
      { lenient: true }
    );

    let storeRef: FormStore | null = null;

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(grown)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <CaptureStore
              onStore={(store) => {
                storeRef = store;
              }}
            />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.click(screen.getByTestId('grow'));
    await waitFor(() => expect(screen.getByTestId('input-notes')).toBeInTheDocument());

    // The dirty flag compares by IDENTITY (`value !== _defaultValues[id]`): a
    // pristine untouched field must still BE its own baseline after growth.
    const state = storeRef?.getState();
    expect(state?.values.tags).toBe(state?._defaultValues.tags);
  });

  it('a workflow host echoing a user-edited value back through `defaultValues` never rewrites the baseline', async () => {
    const config = createRil();

    const torn = compileForm(tagsSchema(['alpha']), config, { lenient: true });

    let storeRef: FormStore | null = null;
    const userEdit = ['mine'];

    // A workflow host mirrors what the user typed and hands it back as
    // `defaultValues` on the next render — same shape, user-authored keys,
    // and this field ALREADY has a committed baseline default.
    function Host() {
      const [echoed, setEchoed] = useState<Record<string, unknown> | undefined>(torn.defaultValues);
      return (
        <>
          <button type="button" data-testid="echo" onClick={() => setEchoed({ tags: userEdit })}>
            echo
          </button>
          <Form formConfig={torn.formConfig} defaultValues={echoed}>
            <CaptureStore
              onStore={(store) => {
                storeRef = store;
              }}
            />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    act(() => {
      storeRef?.getState()._setValue('tags', userEdit);
    });

    fireEvent.click(screen.getByTestId('echo'));

    // The user's own work coming back around is not a completed default: the
    // value stays theirs and the baseline stays the seeded emission default.
    await waitFor(() => expect(screen.getByTestId('value-tags')).toHaveTextContent('["mine"]'));
    expect(storeRef?.getState()._defaultValues.tags).toEqual(['alpha']);
  });
});
