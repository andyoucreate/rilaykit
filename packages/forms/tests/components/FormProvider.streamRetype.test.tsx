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
 * THE MID-STREAM RETYPE — the third transition, between growth and swap.
 *
 * During a streamed emission a field's `type` string can arrive TORN at a chunk
 * boundary on a value that happens to be a valid, registered prefix of the real
 * component: `"text"` cut from `"textarea"`. The torn field mounts (its core is
 * complete and `text` exists), the user starts typing — in it AND in sibling
 * fields — and the next chunk completes the string to `"textarea"`.
 *
 * Same `instanceId`, same form id, the SAME set of field ids: this is ONE form
 * correcting itself mid-stream, not a new form. Treating the componentId change
 * as a swap resets the store and wipes EVERY sibling's keystrokes — the bug
 * pinned here. The retyped field itself is different: its held value was typed
 * into the WRONG control, so it alone is re-registered — value dropped,
 * re-seeded from the new compile's default when untouched siblings would be.
 *
 * The swap half stays intact: a different `instanceId` (a workflow step
 * crossing) or a dropped field id remains a genuine swap and still resets —
 * that is the cross-step-leak protection (bugs #10/#12), pinned again at the
 * bottom of this file with the retype in the same transition.
 */

function createRil() {
  return ril
    .create()
    .component('text', { name: 'Text Input', renderer: MockText })
    .component('textarea', { name: 'Textarea', renderer: MockTextarea });
}

/** Chunk 1 as the lenient pipeline sees it: `bio`'s type torn from "textarea". */
const tornChunk: FormSchema = {
  version: 1,
  id: 'contact-form',
  fields: [
    { id: 'name', type: 'text', props: {} },
    { id: 'bio', type: 'text', props: {} },
  ],
};

/** Chunk 2: the same emission, `bio`'s type completed. */
const completedChunk: FormSchema = {
  version: 1,
  id: 'contact-form',
  fields: [
    { id: 'name', type: 'text', props: {} },
    { id: 'bio', type: 'textarea', props: {} },
  ],
};

describe('FormProvider re-registers a mid-stream field retype in place', () => {
  it('PRESERVES every sibling keystroke when one field completes from a torn type prefix', async () => {
    const config = createRil();
    const onSubmit = vi.fn();

    const torn = compileForm(tornChunk, config, { lenient: true });
    const completed = compileForm(completedChunk, config);

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
    // AND in the torn field itself.
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Karl' } });
    fireEvent.change(screen.getByTestId('input-bio'), {
      target: { value: 'typed-into-wrong-control' },
    });

    // The next chunk completes `"text"` → `"textarea"`: same form id, same
    // field-id set — an in-place retype, NOT a swap.
    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('textarea-bio')).toBeInTheDocument());

    // The sibling's keystrokes survived the retype.
    expect(screen.getByTestId('input-name')).toHaveValue('Karl');
    // The retyped field's own value was typed into the wrong control: dropped.
    expect(screen.getByTestId('textarea-bio')).toHaveValue('');

    fireEvent.click(screen.getByTestId('submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ name: 'Karl', bio: undefined });
  });

  it('re-seeds the retyped field from the NEW compile default, and never overwrites an untouched sibling default', async () => {
    const config = createRil();

    const torn = compileForm(
      {
        version: 1,
        id: 'contact-form',
        fields: [
          { id: 'name', type: 'text', props: {}, default: 'seed-name' },
          { id: 'bio', type: 'text', props: {} },
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
          { id: 'name', type: 'text', props: {}, default: 'seed-name' },
          { id: 'bio', type: 'textarea', props: {}, default: 'seed-bio' },
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
    expect(screen.getByTestId('input-name')).toHaveValue('seed-name');

    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('textarea-bio')).toBeInTheDocument());

    // The retyped field is a fresh registration: the new control's default seeds it.
    expect(screen.getByTestId('textarea-bio')).toHaveValue('seed-bio');
    // The untouched sibling kept its own seeded default — no reset happened.
    expect(screen.getByTestId('input-name')).toHaveValue('seed-name');
  });

  it('a retype arriving IN THE SAME CHUNK as growth still spares siblings and seeds the newcomer', async () => {
    const config = createRil();

    const torn = compileForm(tornChunk, config, { lenient: true });
    // One chunk both completes `bio` AND appends `email` — a legal stream shape.
    const grownAndRetyped = compileForm(
      {
        version: 1,
        id: 'contact-form',
        fields: [
          { id: 'name', type: 'text', props: {} },
          { id: 'bio', type: 'textarea', props: {} },
          { id: 'email', type: 'text', props: {}, default: 'seed-email' },
        ],
      },
      config
    );

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(grownAndRetyped)}>
            complete
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
          </Form>
        </>
      );
    }

    render(<Host />);
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Karl' } });

    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('textarea-bio')).toBeInTheDocument());

    expect(screen.getByTestId('input-name')).toHaveValue('Karl');
    expect(screen.getByTestId('input-email')).toHaveValue('seed-email');
  });

  it('a retype inside a repeatable TEMPLATE drops only that column — sibling columns keep their rows', async () => {
    const config = createRil();

    const repeatableWith = (bioType: string): FormSchema => ({
      version: 1,
      id: 'contact-form',
      rows: [
        {
          kind: 'repeatable',
          repeatable: {
            id: 'lines',
            min: 1,
            rows: [
              {
                kind: 'fields',
                fields: [
                  { id: 'label', type: 'text' },
                  { id: 'bio', type: bioType },
                ],
              },
            ],
          },
        },
      ],
    });

    const torn = compileForm(repeatableWith('text'), config, { lenient: true });
    const completed = compileForm(repeatableWith('textarea'), config);

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

    fireEvent.change(screen.getByTestId('input-lines[k0].label'), {
      target: { value: 'typed-line' },
    });
    fireEvent.change(screen.getByTestId('input-lines[k0].bio'), {
      target: { value: 'typed-into-wrong-control' },
    });

    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('textarea-lines[k0].bio')).toBeInTheDocument());

    // The sibling column's rows survived; only the retyped column was dropped.
    expect(screen.getByTestId('input-lines[k0].label')).toHaveValue('typed-line');
    expect(screen.getByTestId('textarea-lines[k0].bio')).toHaveValue('');
  });

  // MUTATION GUARD (direction b) — the retype path must be a scalpel. A GENUINE
  // swap that ALSO looks like a retype (same shape transition, but a different
  // owner) is a workflow step crossing and MUST still reset: this is the
  // cross-step-leak protection (#10/#12).
  it('the same retype under a DIFFERENT instanceId is a step crossing — it still resets', async () => {
    const config = createRil();

    const torn = compileForm(tornChunk, config, { lenient: true });
    const completed = compileForm(completedChunk, config);

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
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'step-1-input' } });

    fireEvent.click(screen.getByTestId('cross'));
    await waitFor(() => expect(screen.getByTestId('textarea-bio')).toBeInTheDocument());

    // Another owner: nothing may leak across the crossing.
    expect(screen.getByTestId('input-name')).toHaveValue('');
  });

  // MUTATION GUARD — a retype COMBINED with a dropped field id is not an
  // in-place correction: the field-id set fundamentally differs, so it resets.
  it('a retype alongside a DROPPED field id is a swap — it still resets', async () => {
    const config = createRil();

    const v1 = compileForm(
      {
        version: 1,
        id: 'contact-form',
        fields: [
          { id: 'name', type: 'text', props: {} },
          { id: 'bio', type: 'text', props: {} },
          { id: 'legacy', type: 'text', props: {} },
        ],
      },
      config
    );
    const v2 = compileForm(completedChunk, config);

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
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'typed' } });

    fireEvent.click(screen.getByTestId('swap'));
    await waitFor(() => expect(screen.queryByTestId('input-legacy')).not.toBeInTheDocument());

    expect(screen.getByTestId('input-name')).toHaveValue('');
  });
});
