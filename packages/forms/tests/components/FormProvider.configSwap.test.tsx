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

const MockNumberInput = ({ field, id }: ComponentRenderContext) => (
  <input
    type="number"
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.valueAsNumber)}
  />
);

/**
 * A form id is stable BUSINESS identity; the schema behind it evolves. When a
 * backend re-emits an evolved schema under the SAME id — the realistic
 * server-driven case — the store kept values for fields that no longer exist
 * and still submitted them.
 *
 * The reset therefore has to key on a genuine CONFIG change, not merely on an
 * id change. The dangerous failure mode of that fix is the opposite one: a mere
 * re-render with an identical config must NOT reset, or every parent render
 * would wipe what the user is typing. Both directions are pinned here.
 */

function createRil() {
  return ril
    .create()
    .component('input', { name: 'Text Input', renderer: MockInput })
    .component('number', { name: 'Number Input', renderer: MockNumberInput });
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

describe('FormProvider resets on a genuine config swap under a stable form id', () => {
  it('drops values for fields the evolved schema removed', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    const v1 = compileForm(schemaWith(['a', 'b']), config);
    const v2 = compileForm(schemaWith(['a']), config);

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="swap" onClick={() => setCompiled(v2)}>
            swap
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

    // Fill both fields of v1.
    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('input-b'), { target: { value: 'B' } });

    // Hot-swap to v2 — same form id 'f', field `b` removed.
    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.queryByTestId('input-b')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('submit'));

    // `b` no longer exists in the schema: it must not reach the backend. The
    // swap is a form swap, so the surviving field is re-seeded from the NEW
    // config's defaults — the same semantics the form-id reset already had.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ a: 'seed-a' });
  });

  it('drops values for repeatables the evolved schema removed', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    const withRepeatable: FormSchema = {
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
    };

    const v1 = compileForm(withRepeatable, config);
    const v2 = compileForm(schemaWith(['a']), config);

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="swap" onClick={() => setCompiled(v2)}>
            swap
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

    fireEvent.change(screen.getByTestId('input-lines[k0].label'), { target: { value: 'row' } });

    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() =>
      expect(screen.queryByTestId('input-lines[k0].label')).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('submit'));

    // The repeatable is gone from the schema: none of its composite keys may
    // survive into the payload.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ a: 'seed-a' });
  });

  // GUARD — must be green BEFORE and AFTER the fix. This is the dangerous
  // failure mode: keying the reset on anything that changes identity per render
  // (the config object, an inline array) wipes the user's input on every parent
  // re-render.
  it('does NOT reset on a re-render whose config is unchanged', async () => {
    const config = createRil();
    const compiled = compileForm(schemaWith(['a', 'b']), config);

    function Host() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <div data-testid="tick">{tick}</div>
          <button type="button" data-testid="rerender" onClick={() => setTick((t) => t + 1)}>
            rerender
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'typed' } });

    fireEvent.click(screen.getByTestId('rerender'));
    await waitFor(() => expect(screen.getByTestId('tick')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('rerender'));
    await waitFor(() => expect(screen.getByTestId('tick')).toHaveTextContent('2'));

    // The user's input survives unrelated parent renders.
    expect(screen.getByTestId('input-a')).toHaveValue('typed');
  });

  // The signature captures what the form can HOLD. A field's id says WHICH
  // value it holds; its type says what KIND of value it can hold. An evolved
  // schema that retypes a field under a stable id is a genuine config change —
  // the value the old type accepted is an orphan the new one cannot hold.
  it('drops a value whose field the evolved schema retyped', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    const v1 = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'x', type: 'input', props: {} }] },
      config
    );
    const v2 = compileForm(
      { version: 1, id: 'f', fields: [{ id: 'x', type: 'number', props: {} }] },
      config
    );

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="swap" onClick={() => setCompiled(v2)}>
            swap
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

    fireEvent.change(screen.getByTestId('input-x'), { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.getByTestId('input-x')).toHaveAttribute('type', 'number'));

    fireEvent.click(screen.getByTestId('submit'));

    // The host's evolved contract says number: a string must not reach it.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({});
  });

  // GUARD — a recompile of the SAME schema is structurally identical, even
  // though every object identity differs. Re-emitting an unchanged schema must
  // not destroy input either.
  it('does NOT reset when an identical schema is recompiled into a new object', async () => {
    const config = createRil();
    const first = compileForm(schemaWith(['a', 'b']), config);
    const second = compileForm(schemaWith(['a', 'b']), config);

    function Host() {
      const [compiled, setCompiled] = useState(first);
      return (
        <>
          <button type="button" data-testid="reemit" onClick={() => setCompiled(second)}>
            reemit
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByTestId('reemit'));

    await waitFor(() => expect(screen.getByTestId('input-a')).toHaveValue('typed'));
  });
});
