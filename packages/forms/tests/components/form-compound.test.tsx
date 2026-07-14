import { ril } from '@rilaykit/core';
import { Form, FormBody, FormField, FormList, FormSubmit, form } from '@rilaykit/forms';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });

describe('Form compound namespace', () => {
  it('exposes Body/Field/Submit/List on Form', () => {
    render(
      <Form of={def}>
        <Form.Body />
        <Form.Submit>Send</Form.Submit>
      </Form>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(Form.Body).toBe(FormBody);
    expect(Form.Field).toBe(FormField);
    expect(Form.Submit).toBe(FormSubmit);
    expect(Form.List).toBe(FormList);
  });

  it('renders Form.Field through the compound path', () => {
    render(
      <Form of={def}>
        <Form.Field id="a" />
      </Form>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
  });

  it('exports useForm and drops useFormConfigContext', async () => {
    const mod = await import('@rilaykit/forms');
    expect(typeof mod.useForm).toBe('function');
    expect('useFormConfigContext' in mod).toBe(false);
  });

  it('no longer exports FormRow', async () => {
    const mod = await import('@rilaykit/forms');
    expect('FormRow' in mod).toBe(false);
  });
});
