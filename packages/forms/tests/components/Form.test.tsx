import { ril } from '@rilaykit/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Form, form, useFieldValue } from '@rilaykit/forms';

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
});
