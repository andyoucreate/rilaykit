import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '../../src/components/Form';
import { FormBody } from '../../src/components/FormBody';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';

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
    await waitFor(() =>
      expect(screen.getByTestId('input-lines[k0].label')).toBeInTheDocument()
    );
    expect(screen.getByTestId('input-a')).toHaveValue('typed');
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
