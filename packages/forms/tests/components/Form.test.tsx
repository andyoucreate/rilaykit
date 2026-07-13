import { ril } from '@rilaykit/core';
import { Form, FormField, form, useFieldValue } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const r = ril.create().addComponent('text', {
  name: 'Text',
  renderer: ({
    id,
    value,
    onChange,
  }: { id: string; value?: string; onChange?: (v: unknown) => void }) => (
    <input data-testid={id} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
});

function Probe({ id }: { id: string }) {
  const value = useFieldValue<string>(id);
  return <span data-testid={`probe-${id}`}>{value}</span>;
}

describe('<Form of defaults>', () => {
  it('builds from a builder passed via of and seeds defaults', () => {
    const login = form.create(r, 'login').add({ id: 'email', type: 'text', props: {} });
    render(
      <Form of={login} defaults={{ email: 'karl@ayc.dev' }}>
        <Probe id="email" />
      </Form>
    );
    expect(screen.getByTestId('probe-email').textContent).toBe('karl@ayc.dev');
  });

  it('accepts a pre-built FormConfiguration passed via of and seeds defaults', () => {
    const built = form.create(r, 'login').add({ id: 'email', type: 'text', props: {} }).build();
    render(
      <Form of={built} defaults={{ email: 'karl@ayc.dev' }}>
        <Probe id="email" />
      </Form>
    );
    expect(screen.getByTestId('probe-email').textContent).toBe('karl@ayc.dev');
  });

  it('forwards onSubmit, onFieldChange and className to FormProvider', async () => {
    const onSubmit = vi.fn();
    const onFieldChange = vi.fn();
    const login = form.create(r, 'login').add({ id: 'email', type: 'text', props: {} });
    const { container } = render(
      <Form
        of={login}
        defaults={{ email: 'a@b.c' }}
        onSubmit={onSubmit}
        onFieldChange={onFieldChange}
        className="login-form"
      >
        <FormField fieldId="email" />
        <button type="submit">Sign In</button>
      </Form>
    );

    const formElement = container.querySelector('form');
    expect(formElement?.className).toBe('login-form');

    fireEvent.change(screen.getByTestId('email'), { target: { value: 'new@x.dev' } });
    expect(onFieldChange).toHaveBeenCalledWith(
      'email',
      'new@x.dev',
      expect.objectContaining({ email: 'new@x.dev' })
    );

    fireEvent.submit(formElement as HTMLFormElement);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ email: 'new@x.dev' });
    });
  });
});
