import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '../../src/components/Form';
import { FormBody } from '../../src/components/FormBody';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';

const MockText = ({ field, id }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

const MockTextarea = ({ field, id }: ComponentRenderContext) => (
  <textarea
    data-testid={`textarea-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

/**
 * THE TORN FIELD ID — the fourth transition, beside growth and retype.
 *
 * When the model emits `type` before `id`, a chunk boundary can tear the id
 * string itself: the field mounts under `"na"` and the next chunk completes it
 * to `"name"`. The field-id SET then differs between the two compiles — `na`
 * dropped, `name` added — which the classifier used to read as a SWAP: full
 * reset, every sibling's keystrokes wiped by a chunk that changed nothing but
 * two characters of one id.
 *
 * The campaign principle: within one streaming emission, a field whose id is a
 * strict PREFIX of the one id that replaced it is the SAME field's id
 * completing, not a new field. The classifier treats it as an in-place RENAME —
 * the field's state carries from the torn id to the completed id, siblings are
 * untouched — under deliberately airtight constraints: same owner, same form
 * id, same field COUNT, exactly one id differing, the previous id a strict
 * prefix of the new one, the SAME componentId on both sides, everything else
 * (fields and repeatables alike) identical. Anything looser is a swap and still
 * resets — the cross-step-leak protection (#10/#12) pinned at the bottom.
 */

function createRil() {
  return ril
    .create()
    .component('text', { name: 'Text Input', renderer: MockText })
    .component('textarea', { name: 'Textarea', renderer: MockTextarea });
}

function textFields(ids: string[]): FormSchema {
  return {
    version: 1,
    id: 'contact-form',
    fields: ids.map((id) => ({ id, type: 'text', props: {} })),
  };
}

describe('FormProvider carries a torn field id completing as an in-place rename', () => {
  it('PRESERVES sibling keystrokes and carries the torn field own text when its id completes', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    // Chunk 1: `name`'s id torn as `na` (type was emitted before id).
    const torn = compileForm(textFields(['sibling', 'na']), config, { lenient: true });
    // Chunk 2: the SAME emission, the id completed.
    const completed = compileForm(textFields(['sibling', 'name']), config);

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
            <FormBody />
            <button type="submit" data-testid="submit">
              Submit
            </button>
          </Form>
        </>
      );
    }

    render(<Host />);

    // The user types while the emission is still streaming — in the sibling
    // AND in the torn-id field itself.
    fireEvent.change(screen.getByTestId('input-sibling'), { target: { value: 'Karl' } });
    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'typed-into-torn' } });

    // The next chunk completes `na` → `name`: one field's identity key
    // finishing, NOT a new form.
    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());

    // The sibling's keystroke SURVIVED the chunk...
    expect(screen.getByTestId('input-sibling')).toHaveValue('Karl');
    // ...and the torn field's own text moved with its completing id.
    expect(screen.getByTestId('input-name')).toHaveValue('typed-into-torn');

    fireEvent.click(screen.getByTestId('submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ sibling: 'Karl', name: 'typed-into-torn' });
  });

  it('a rename never blocks a LATER default completion: the moved field stays eligible exactly as touched-ness says', async () => {
    const config = createRil();

    // The torn-id field carries a seeded default; the id completes; the field
    // stays untouched throughout. Its value must ride along unharmed.
    const torn = compileForm(
      {
        version: 1,
        id: 'contact-form',
        fields: [
          { id: 'sibling', type: 'text', props: {} },
          { id: 'na', type: 'text', props: {}, default: 'seed-na' },
        ],
      },
      config,
      { lenient: true }
    );
    const completed = compileForm(
      {
        version: 1,
        id: 'contact-form',
        fields: [
          { id: 'sibling', type: 'text', props: {} },
          { id: 'name', type: 'text', props: {}, default: 'seed-na' },
        ],
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
    expect(screen.getByTestId('input-na')).toHaveValue('seed-na');

    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());

    // The seeded value moved with the id — not dropped, not re-seeded to "".
    expect(screen.getByTestId('input-name')).toHaveValue('seed-na');
  });

  // MUTATION GUARD (direction b) — the airtightness pin. A real form may hold
  // BOTH `na` and `name` as genuinely-distinct fields: no transition between
  // shapes that contain both may ever merge one into the other.
  it('two REAL fields where one id prefixes the other never merge — growth keeps both values apart', async () => {
    const config = createRil();

    const v1 = compileForm(textFields(['na', 'name']), config);
    const v2 = compileForm(textFields(['na', 'name', 'email']), config);

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

    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'value-of-na' } });
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'value-of-name' } });

    fireEvent.click(screen.getByTestId('grow'));
    await waitFor(() => expect(screen.getByTestId('input-email')).toBeInTheDocument());

    // Both prefix-colliding fields kept exactly their own values.
    expect(screen.getByTestId('input-na')).toHaveValue('value-of-na');
    expect(screen.getByTestId('input-name')).toHaveValue('value-of-name');
  });

  it('DROPPING `na` while `name` exists is a swap, not a rename — the field count moved', async () => {
    const config = createRil();

    const v1 = compileForm(textFields(['na', 'name']), config);
    const v2 = compileForm(textFields(['name']), config);

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="swap" onClick={() => setCompiled(v2)}>
            swap
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);

    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'value-of-na' } });
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'value-of-name' } });

    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.queryByTestId('input-na')).not.toBeInTheDocument());

    // A dropped field is a different form: full reset, and above all `na`'s
    // value never leaked into `name`.
    expect(screen.getByTestId('input-name')).toHaveValue('');
  });

  // MUTATION GUARD — a prefix completion under ANOTHER OWNER is a workflow
  // step crossing, whatever the shape resemblance: it must still reset
  // (cross-step-leak protection, campaign bugs #10/#12).
  it('the same id completion under a DIFFERENT instanceId is a step crossing — it still resets', async () => {
    const config = createRil();

    const torn = compileForm(textFields(['sibling', 'na']), config, { lenient: true });
    const completed = compileForm(textFields(['sibling', 'name']), config);

    function Host() {
      const [mounted, setMounted] = useState({ compiled: torn, instanceId: 'step-1' });
      return (
        <>
          <button
            type="button"
            data-testid="cross"
            onClick={() => setMounted({ compiled: completed, instanceId: 'step-2' })}
          >
            cross
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
    fireEvent.change(screen.getByTestId('input-sibling'), { target: { value: 'step-1-input' } });
    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'step-1-torn' } });

    fireEvent.click(screen.getByTestId('cross'));
    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());

    // Another owner: nothing may leak across the crossing.
    expect(screen.getByTestId('input-sibling')).toHaveValue('');
    expect(screen.getByTestId('input-name')).toHaveValue('');
  });

  it('a prefix-id replacement with a DIFFERENT componentId is a swap — no state may cross a type change', async () => {
    const config = createRil();

    const v1 = compileForm(textFields(['sibling', 'na']), config);
    const v2 = compileForm(
      {
        version: 1,
        id: 'contact-form',
        fields: [
          { id: 'sibling', type: 'text', props: {} },
          { id: 'name', type: 'textarea', props: {} },
        ],
      },
      config
    );

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="swap" onClick={() => setCompiled(v2)}>
            swap
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    fireEvent.change(screen.getByTestId('input-sibling'), { target: { value: 'typed' } });
    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'torn-typed' } });

    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.getByTestId('textarea-name')).toBeInTheDocument());

    // The id-prefix resemblance is not enough once the type moved too: swap.
    expect(screen.getByTestId('input-sibling')).toHaveValue('');
    expect(screen.getByTestId('textarea-name')).toHaveValue('');
  });

  it('an id REPLACED by a non-prefix id is a swap — `legacy` → `email` resets', async () => {
    const config = createRil();

    const v1 = compileForm(textFields(['sibling', 'legacy']), config);
    const v2 = compileForm(textFields(['sibling', 'email']), config);

    function Host() {
      const [compiled, setCompiled] = useState(v1);
      return (
        <>
          <button type="button" data-testid="swap" onClick={() => setCompiled(v2)}>
            swap
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    fireEvent.change(screen.getByTestId('input-sibling'), { target: { value: 'typed' } });

    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.getByTestId('input-email')).toBeInTheDocument());

    expect(screen.getByTestId('input-sibling')).toHaveValue('');
  });
});
