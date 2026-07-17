import { required, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Form } from '@rilaykit/forms/react';
/**
 * PROOF — form chrome hardening.
 * User-level scenarios the migrated e2e/unit suites do not pin down with the
 * new chrome: blur-error + blocked submit through `Form.Submit`, double-submit
 * lock, `Form.List` min/max bounds via the render prop, and the all-hidden
 * form contract (empty body, exact submitted payload).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createProofRil } from '../_setup/proof-fixtures';

const r = createProofRil();

describe('PROOF form chrome hardening', () => {
  it('submit is blocked while invalid and the exact message renders on blur', async () => {
    const onSubmit = vi.fn();
    const def = form.create(r, 'f').add({
      id: 'email',
      type: 'text',
      props: {},
      validation: {
        validate: [required('Email is required'), z.string().email('Invalid email')],
      },
    });
    render(
      <Form of={def} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>Send</Form.Submit>
      </Form>
    );
    fireEvent.blur(screen.getByTestId('email'));
    // Both validators report on blur: the required rule and the zod type check.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Email is required',
      'Invalid input: expected string, received undefined',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('double-clicking submit fires onSubmit exactly once', async () => {
    let release: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((res) => {
          release = res;
        })
    );
    const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });
    render(
      <Form of={def} onSubmit={onSubmit}>
        <Form.Submit>Go</Form.Submit>
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(btn);
    fireEvent.click(btn); // second click while submitting
    release();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('Form.List enforces min/max: remove disabled at min, add disabled at max', () => {
    const def = form
      .create(r, 'f')
      .addRepeatable('phones', (rb) => rb.add({ id: 'n', type: 'text', props: {} }).min(1).max(2));
    render(
      <Form of={def}>
        <Form.List id="phones">
          {({ items, add, remove, canAdd, canRemove }) => (
            <div>
              <output data-testid="state">{`${items.length}|${canAdd}|${canRemove}`}</output>
              <button type="button" onClick={add} data-testid="add" />
              <button
                type="button"
                onClick={() => items[0] && remove(items[0].key)}
                data-testid="rm"
              />
            </div>
          )}
        </Form.List>
      </Form>
    );
    expect(screen.getByTestId('state').textContent).toBe('1|true|false');
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('state').textContent).toBe('2|false|true');
  });

  it('Form.Field resolves a repeatable composite id without an explicit config', () => {
    const def = form
      .create(r, 'f')
      .addRepeatable('phones', (rb) => rb.add({ id: 'n', type: 'text', props: {} }));
    render(
      <Form of={def} defaults={{ phones: [{ n: 'first' }] }}>
        <Form.Field id="phones[k0].n" />
      </Form>
    );
    expect((screen.getByTestId('phones[k0].n') as HTMLInputElement).value).toBe('first');
  });

  it('a form whose every field is hidden renders an empty body and still submits {}', async () => {
    const onSubmit = vi.fn();
    const def = form.create(r, 'f').add({
      id: 'ghost',
      type: 'text',
      props: {},
      conditions: { visible: when('never').equals('yes') },
    });
    render(
      <Form of={def} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>Send</Form.Submit>
      </Form>
    );
    expect(document.querySelectorAll('[data-form-row]').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});
