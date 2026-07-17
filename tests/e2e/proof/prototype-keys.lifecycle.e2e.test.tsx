/**
 * PROOF — the prototype-key class, closed by exhaustion rather than by patching
 * whichever site a hunter happened to walk past.
 *
 * Every table RilayKit keeps is a plain object keyed by an author-chosen id
 * (`values`, `_defaultValues`, `_repeatableOrder`, `_repeatableNextKey`,
 * `touched`, `errors`, step metadata, namespaced flow data...). When that id is
 * an Object.prototype member — `__proto__`, `constructor`, `toString`, ... — a
 * plain `table[id]` read returns an INHERITED value and a plain `table[id] =`
 * write can hit Object.prototype's `__proto__` accessor and vanish.
 *
 * This suite does not test one site. For EACH prototype key it drives the whole
 * golden path — compile from JSON, render, dirty tracking, validation, submit,
 * reset, and a compiled 2-step flow — and asserts exact behavior at every stage.
 * A regression anywhere in the class fails here, whether or not anyone knew the
 * site existed.
 */
import { compileForm } from '@rilaykit/forms';
import type { FormSchema } from '@rilaykit/forms';
import { Form, useFieldState, useFormActions } from '@rilaykit/forms/react';
import { compileFlow } from '@rilaykit/workflow';
import type { FlowSchema } from '@rilaykit/workflow';
import { Flow, useStepMetadata } from '@rilaykit/workflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createProofRil } from '../_setup/proof-fixtures';

/**
 * Every own member of Object.prototype an author could plausibly pick as an id.
 * `__proto__` is the accessor one; the rest are inherited data/method ones.
 */
const PROTOTYPE_KEYS = [
  '__proto__',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'prototype',
] as const;

/** Reads `useFieldState(id).dirty` out of a live form into the DOM. */
function DirtyProbe({ id }: { id: string }) {
  const { dirty } = useFieldState(id);
  return <output data-testid="dirty">{String(dirty)}</output>;
}

/** Exposes the store's `reset()` as a clickable control. */
function ResetProbe() {
  const { reset } = useFormActions();
  return <button type="button" data-testid="reset" onClick={() => reset()} />;
}

/** Reads the current step's metadata through the public `useStepMetadata` hook. */
function MetadataProbe({ id }: { id: string }) {
  const { hasCurrentKey, getCurrentValue } = useStepMetadata();
  return (
    <output data-testid="meta">{`${hasCurrentKey(id)}|${String(getCurrentValue(id, 'fallback'))}`}</output>
  );
}

/**
 * A single-field schema, authored as a JSON STRING so `__proto__` arrives as a
 * REAL own key (an object literal would route it through the accessor and lose
 * it before the framework ever sees it).
 */
function fieldSchema(key: string): FormSchema {
  return JSON.parse(`{
    "version": 1,
    "id": "lifecycle-field",
    "fields": [
      {
        "id": ${JSON.stringify(key)},
        "type": "text",
        "default": "seed",
        "validation": { "rules": [{ "type": "required", "message": "Value is required" }] }
      },
      { "id": "control", "type": "text", "default": "ctl" }
    ]
  }`);
}

/**
 * A repeatable schema whose GROUP id and TEMPLATE field id are both the
 * prototype key. Template ids live in their own namespace, so this is a legal
 * schema; a top-level field sharing the group id is not (one payload key, one
 * owner) and is covered by `fieldSchema` separately.
 */
function repeatableSchema(key: string): FormSchema {
  return JSON.parse(`{
    "version": 1,
    "id": "lifecycle-repeatable",
    "rows": [
      { "kind": "fields", "fields": [{ "id": "control", "type": "text" }] },
      {
        "kind": "repeatable",
        "repeatable": {
          "id": ${JSON.stringify(key)},
          "min": 1,
          "defaultValue": { ${JSON.stringify(key)}: "row-seed" },
          "rows": [{ "kind": "fields", "fields": [{ "id": ${JSON.stringify(key)}, "type": "text" }] }]
        }
      }
    ]
  }`);
}

/** A 2-step flow whose FIRST step id is the prototype key. */
function flowSchema(key: string): FlowSchema {
  return JSON.parse(`{
    "version": 1,
    "id": "lifecycle-flow",
    "name": "Lifecycle",
    "steps": [
      {
        "id": ${JSON.stringify(key)},
        "title": "First",
        "metadata": { ${JSON.stringify(key)}: "meta-value" },
        "form": {
          "version": 1,
          "id": "step-one",
          "fields": [{ "id": "one", "type": "text", "default": "1" }]
        }
      },
      {
        "id": "normal",
        "title": "Second",
        "metadata": { "note": "no key here" },
        "form": {
          "version": 1,
          "id": "step-two",
          "fields": [{ "id": "two", "type": "text", "default": "2" }]
        }
      }
    ]
  }`);
}

describe.each(PROTOTYPE_KEYS)('PROOF prototype-key lifecycle — id %s', (key) => {
  it('the JSON schema carries the key as a REAL own key', () => {
    // Guards the fixture itself: if this ever reads false, every assertion below
    // is testing a plain field named something else and proves nothing.
    const schema = fieldSchema(key);
    expect(Object.prototype.hasOwnProperty.call(schema.fields?.[0] ?? {}, 'id')).toBe(true);
    expect(schema.fields?.[0]?.id).toBe(key);
  });

  it('renders its default, tracks dirty, validates, submits and resets', async () => {
    const { formConfig, defaultValues } = compileForm(fieldSchema(key), createProofRil());

    // The compiled defaults hold the key as an OWN entry — not grafted onto the
    // prototype by a plain `__proto__` write.
    expect(Object.prototype.hasOwnProperty.call(defaultValues ?? {}, key)).toBe(true);
    expect(defaultValues).toEqual({ [key]: 'seed', control: 'ctl' });

    const onSubmit = vi.fn();
    render(
      <Form of={formConfig} defaults={defaultValues} onSubmit={onSubmit}>
        <Form.Body />
        <DirtyProbe id={key} />
        <ResetProbe />
        <Form.Submit>
          {({ submit }) => <button type="button" data-testid="submit" onClick={submit} />}
        </Form.Submit>
      </Form>
    );

    // (b) the default reaches the live input.
    const input = (await screen.findByTestId(key)) as HTMLInputElement;
    expect(input.value).toBe('seed');

    // (c) untouched is NOT dirty; typing flips it.
    expect(screen.getByTestId('dirty').textContent).toBe('false');
    fireEvent.change(input, { target: { value: 'typed' } });
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('true'));

    // (d) emptied → the exact required message; refilled → it clears.
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Value is required'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'final' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    // (e) the exact payload — the key is an own entry of the submitted object.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, key)).toBe(true);
    expect(payload).toEqual({ [key]: 'final', control: 'ctl' });

    // (f) reset restores the default and clears dirty.
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset'));
    });
    await waitFor(() => expect((screen.getByTestId(key) as HTMLInputElement).value).toBe('seed'));
    expect(screen.getByTestId('dirty').textContent).toBe('false');
  });

  it('does not report an untouched field that declares NO default as dirty', async () => {
    // The `default`-carrying case above seeds `_defaultValues[key]` as an own
    // entry, which masks an inherited read. A field with no default leaves the
    // table empty for `key` — the only shape where a prototype-inclusive lookup
    // resolves an Object.prototype member and makes `undefined !== <method>`
    // report a pristine field as permanently dirty.
    const schema: FormSchema = JSON.parse(`{
      "version": 1,
      "id": "lifecycle-no-default",
      "fields": [{ "id": ${JSON.stringify(key)}, "type": "text" }]
    }`);
    const { formConfig, defaultValues } = compileForm(schema, createProofRil());
    expect(defaultValues).toBeUndefined();

    render(
      <Form of={formConfig}>
        <Form.Body />
        <DirtyProbe id={key} />
      </Form>
    );

    expect((await screen.findByTestId(key)).getAttribute('value')).toBe('');
    expect(screen.getByTestId('dirty').textContent).toBe('false');
  });

  it('renders its repeatable rows, adds, submits the structured array and resets to min', async () => {
    const { formConfig, defaultValues } = compileForm(repeatableSchema(key), createProofRil());
    const onSubmit = vi.fn();

    render(
      <Form of={formConfig} defaults={defaultValues} onSubmit={onSubmit}>
        <Form.Body />
        <Form.List id={key}>
          {({ items, add }) => (
            <>
              <output data-testid="count">{String(items.length)}</output>
              <button type="button" data-testid="add" onClick={add} />
            </>
          )}
        </Form.List>
        <ResetProbe />
        <Form.Submit>
          {({ submit }) => <button type="button" data-testid="submit" onClick={submit} />}
        </Form.Submit>
      </Form>
    );

    // (b) `min: 1` materialises one row, and it RENDERS — the row's order entry
    // must be an own property of `_repeatableOrder` for this to hold.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    const firstRow = screen.getByTestId(`${key}[k0].${key}`) as HTMLInputElement;
    expect(firstRow.value).toBe('row-seed');

    // The add control appends a real second row.
    await act(async () => {
      fireEvent.click(screen.getByTestId('add'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    fireEvent.change(firstRow, { target: { value: 'row-a' } });
    fireEvent.change(screen.getByTestId(`${key}[k1].${key}`), { target: { value: 'row-b' } });
    fireEvent.change(screen.getByTestId('control'), { target: { value: 'ctl' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    // (e) the repeatable submits as a structured array under its own key.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, key)).toBe(true);
    expect(payload).toEqual({
      control: 'ctl',
      [key]: [{ [key]: 'row-a' }, { [key]: 'row-b' }],
    });

    // (f) reset drops back to `min` rows carrying the row default again.
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect((screen.getByTestId(`${key}[k0].${key}`) as HTMLInputElement).value).toBe('row-seed');
  });

  it('navigates a compiled 2-step flow whose step id is the key and completes with the exact namespaced payload', async () => {
    const { workflowConfig, defaultValues } = compileFlow(flowSchema(key), createProofRil());
    const onComplete = vi.fn();

    // Compiled flow defaults are namespaced by step id — own entry, not grafted.
    expect(Object.prototype.hasOwnProperty.call(defaultValues ?? {}, key)).toBe(true);
    expect(defaultValues).toEqual({ [key]: { one: '1' }, normal: { two: '2' } });

    render(
      <Flow of={workflowConfig} defaults={defaultValues} onComplete={onComplete}>
        <Flow.Body />
        <MetadataProbe id={key} />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );

    expect(((await screen.findByTestId('one')) as HTMLInputElement).value).toBe('1');
    // Step 1 DECLARES the key in its metadata — it reads back verbatim.
    expect(screen.getByTestId('meta').textContent).toBe('true|meta-value');

    fireEvent.change(screen.getByTestId('one'), { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(((await screen.findByTestId('two')) as HTMLInputElement).value).toBe('2');
    // Step 2 has metadata but does NOT declare the key: the hook must report it
    // absent and hand back the caller's default — never an Object.prototype member.
    expect(screen.getByTestId('meta').textContent).toBe('false|fallback');
    fireEvent.change(screen.getByTestId('two'), { target: { value: 'second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const data = onComplete.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(data, key)).toBe(true);
    expect(data).toEqual({ [key]: { one: 'first' }, normal: { two: 'second' } });
  });
});
