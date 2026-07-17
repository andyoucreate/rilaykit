import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Form, FormSubmit } from '@rilaykit/forms/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });

function createDeferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('<Form.Submit>', () => {
  it('renders a bare submit button by default', () => {
    render(
      <Form of={def}>
        <FormSubmit>Send</FormSubmit>
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(btn.getAttribute('type')).toBe('submit');
    expect(btn.disabled).toBe(false);
  });

  it('falls back to the "Submit" label and forwards className and data-form-submit', () => {
    render(
      <Form of={def}>
        <FormSubmit className="x" />
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;
    expect(btn.getAttribute('type')).toBe('submit');
    expect(btn.hasAttribute('data-form-submit')).toBe(true);
    expect(btn.className).toBe('x');
  });

  it('disables the default button while the form is submitting', async () => {
    const deferred = createDeferred();
    render(
      <Form of={def} onSubmit={() => deferred.promise}>
        <FormSubmit>Send</FormSubmit>
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));

    deferred.resolve();
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  it('submits the form through the render-prop submit callback', async () => {
    const onSubmit = vi.fn();
    render(
      <Form of={def} onSubmit={onSubmit}>
        <FormSubmit>
          {({ submit }) => (
            <button type="button" onClick={submit}>
              Go
            </button>
          )}
        </FormSubmit>
      </Form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('exposes the live submitting state through the render prop', async () => {
    const deferred = createDeferred();
    render(
      <Form of={def} onSubmit={() => deferred.promise}>
        <FormSubmit>
          {({ submitting, submit }) => (
            <button type="button" onClick={submit}>
              {submitting ? 'Sending…' : 'Go'}
            </button>
          )}
        </FormSubmit>
      </Form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeInTheDocument();

    deferred.resolve();
    expect(await screen.findByRole('button', { name: 'Go' })).toBeInTheDocument();
  });
});
