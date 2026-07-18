import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '../../src/components/Form';
import { FormBody } from '../../src/components/FormBody';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';
import { type FormStore, useFormStoreApi } from '../../src/stores';

const MockInput = ({ field, id }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

/**
 * GROWTH is the half `FormProvider.configSwap.test.tsx` does not cover: the
 * SAME form (same owner, same form id) gaining fields — the shape of a
 * streaming schema being progressively mounted. An appended field must register
 * incrementally, with NO reset: everything the user already typed survives the
 * chunk that appended it. The swap half (drop / retype / different owner) keeps
 * resetting — those tests must stay green alongside these.
 */

function createRil() {
  return ril.create().component('input', { name: 'Text Input', renderer: MockInput });
}

function schemaWith(fieldIds: string[]): FormSchema {
  return {
    version: 1,
    id: 'f',
    fields: fieldIds.map((id) => ({
      id,
      type: 'input',
      props: { label: id },
      default: `seed-${id}`,
    })),
  };
}

describe('FormProvider registers appended fields incrementally — growth is not a swap', () => {
  it('PRESERVES what the user typed when the schema grows, and seeds only the field that appeared', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    const v1 = compileForm(schemaWith(['a']), config);
    const v2 = compileForm(schemaWith(['a', 'b']), config);

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(v2)}>
            grow
          </button>
          <Form
            formConfig={compiled.formConfig}
            defaultValues={compiled.defaultValues}
            onSubmit={onSubmit}
          >
            <FormBody />
            <button type="submit" data-testid="submit">
              Submit
            </button>
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'typed-by-user' } });

    // The next chunk appends `b` — same form id, same owner: growth.
    fireEvent.click(screen.getByTestId('grow'));
    await waitFor(() => expect(screen.getByTestId('input-b')).toBeInTheDocument());

    // The user's keystrokes survived the chunk; the newcomer got its default.
    expect(screen.getByTestId('input-a')).toHaveValue('typed-by-user');
    expect(screen.getByTestId('input-b')).toHaveValue('seed-b');

    fireEvent.click(screen.getByTestId('submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ a: 'typed-by-user', b: 'seed-b' });
  });

  it('installs a repeatable that APPEARS mid-growth, min-padding its rows', async () => {
    const config = createRil();

    const v1 = compileForm(schemaWith(['a']), config);
    const v2 = compileForm(
      {
        version: 1,
        id: 'f',
        rows: [
          { kind: 'fields', fields: [{ id: 'a', type: 'input', default: 'seed-a' }] },
          {
            kind: 'repeatable',
            repeatable: {
              id: 'lines',
              min: 1,
              rows: [{ kind: 'fields', fields: [{ id: 'label', type: 'input' }] }],
            },
          },
        ],
      },
      config
    );

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(v2)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByTestId('grow'));

    // The new repeatable pads to its min — and the padding did not reset `a`.
    await waitFor(() => expect(screen.getByTestId('input-lines[k0].label')).toBeInTheDocument());
    expect(screen.getByTestId('input-a')).toHaveValue('typed');
  });

  it('an EXISTING repeatable whose template GAINS a field mid-growth keeps its live rows — the new field renders empty on them, even when the template declares a default for it', async () => {
    const config = createRil();

    const repeatableWith = (templateFieldIds: string[], defaultValue: Record<string, unknown>) => ({
      version: 1 as const,
      id: 'f',
      rows: [
        {
          kind: 'repeatable' as const,
          repeatable: {
            id: 'lines',
            min: 1,
            rows: [
              {
                kind: 'fields' as const,
                fields: templateFieldIds.map((id) => ({ id, type: 'input' })),
              },
            ],
            defaultValue,
          },
        },
      ],
    });

    const v1 = compileForm(repeatableWith(['label'], { label: 'seed-label' }), config);
    // The next chunk grows the TEMPLATE itself: it gains `qty`, and the
    // per-item defaults now cover it too.
    const v2 = compileForm(
      repeatableWith(['label', 'qty'], { label: 'seed-label', qty: 'seed-qty' }),
      config
    );

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(v2)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-lines[k0].label'), {
      target: { value: 'typed-line' },
    });

    fireEvent.click(screen.getByTestId('grow'));

    // The grown template reaches the existing row: `qty` renders on it.
    await waitFor(() => expect(screen.getByTestId('input-lines[k0].qty')).toBeInTheDocument());
    // The user's row survived the template growth untouched...
    expect(screen.getByTestId('input-lines[k0].label')).toHaveValue('typed-line');
    // ...and the late template default does NOT re-seed an existing row: live
    // rows are never touched (the documented price of the never-reset rule),
    // so the new field renders EMPTY, not 'seed-qty'.
    expect(screen.getByTestId('input-lines[k0].qty')).toHaveValue('');
  });

  it('applies a `default` that arrives AFTER its field mounted — same shape, no signature change', async () => {
    const config = createRil();

    // Same shape (`a:input`) in both compiles: the second chunk only carries
    // the late default, so neither reset nor growth-registration fires.
    const bare = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'a', type: 'input', props: { label: 'a' } }] },
      config
    );
    const withDefault = compileForm(schemaWith(['a']), config);

    function Host() {
      const [compiled, setCompiled] = useState(bare);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(withDefault)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    expect(screen.getByTestId('input-a')).toHaveValue('');

    fireEvent.click(screen.getByTestId('grow'));

    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue('seed-a'));
  });

  it('a late default NEVER overwrites what the user already typed', async () => {
    const config = createRil();

    const bare = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'a', type: 'input', props: { label: 'a' } }] },
      config
    );
    const withDefault = compileForm(schemaWith(['a']), config);

    function Host() {
      const [compiled, setCompiled] = useState(bare);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(withDefault)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'typed-by-user' } });

    fireEvent.click(screen.getByTestId('grow'));

    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue('typed-by-user'));
  });

  it('a late default NEVER fills a field the user has TOUCHED, even while it holds no value', async () => {
    const config = createRil();

    const bare = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'a', type: 'input', props: { label: 'a' } }] },
      config
    );
    const withDefault = compileForm(schemaWith(['a']), config);

    let storeRef: FormStore | null = null;
    function CaptureStore() {
      storeRef = useFormStoreApi();
      return null;
    }

    function Host() {
      const [compiled, setCompiled] = useState(bare);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(withDefault)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <CaptureStore />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    // The store's own touched tracking — what a blur records — is the guard.
    act(() => {
      storeRef?.getState()._setTouched('a');
    });

    fireEvent.click(screen.getByTestId('grow'));

    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue(''));
  });

  it('a host echoing captured values back through `defaultValues` is NOT a late default — the baseline stays pristine', async () => {
    const config = createRil();

    const bare = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'a', type: 'input', props: { label: 'a' } }] },
      config
    );

    let storeRef: FormStore | null = null;
    function CaptureStore() {
      storeRef = useFormStoreApi();
      return null;
    }

    // A workflow host mirrors what the user typed and hands it back as
    // `defaultValues` on the next render — same shape, user-authored keys.
    function Host() {
      const [echoed, setEchoed] = useState<Record<string, unknown>>({});
      return (
        <>
          <button
            type="button"
            data-testid="echo"
            onClick={() => setEchoed({ a: 'typed-by-user' })}
          >
            echo
          </button>
          <Form formConfig={bare.formConfig} defaultValues={echoed}>
            <CaptureStore />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'typed-by-user' } });

    fireEvent.click(screen.getByTestId('echo'));

    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue('typed-by-user'));
    // The user's own work coming back around never becomes the reset baseline.
    expect(storeRef?.getState()._defaultValues).toEqual({});
  });

  it('a late default lands in `_defaultValues` too — a later reset restores it, not ""', async () => {
    const config = createRil();

    const bare = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'a', type: 'input', props: { label: 'a' } }] },
      config
    );
    const withDefault = compileForm(schemaWith(['a']), config);

    let storeRef: FormStore | null = null;
    function CaptureStore() {
      storeRef = useFormStoreApi();
      return null;
    }

    function Host() {
      const [compiled, setCompiled] = useState(bare);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setCompiled(withDefault)}>
            grow
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <CaptureStore />
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    fireEvent.click(screen.getByTestId('grow'));
    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue('seed-a'));

    // A no-arg reset restores the CURRENT form's defaults — the late default
    // must be part of that baseline, or reset would wipe it back to "".
    act(() => {
      storeRef?.getState()._reset();
    });

    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue('seed-a'));
  });

  it('a different instanceId is a DIFFERENT form even when the shape only grew — the swap still resets', async () => {
    const config = createRil();

    const v1 = compileForm(schemaWith(['a']), config);
    const v2 = compileForm(schemaWith(['a', 'b']), config);

    function Host() {
      const [mounted, setMounted] = useState({ compiled: v1, instanceId: 'step-1' });
      return (
        <>
          <button
            type="button"
            data-testid="swap"
            onClick={() => setMounted({ compiled: v2, instanceId: 'step-2' })}
          >
            swap
          </button>
          <Form
            formConfig={mounted.compiled.formConfig}
            defaultValues={mounted.compiled.defaultValues}
            instanceId={mounted.instanceId}
          >
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'step-1-input' } });

    // Same grown shape, but ANOTHER OWNER: cross-step protection wins.
    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.getByTestId('input-b')).toBeInTheDocument());

    expect(screen.getByTestId('input-a')).toHaveValue('seed-a');
  });
});
