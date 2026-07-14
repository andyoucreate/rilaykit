import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '@rilaykit/core';
import { Form, FormSubmit, form } from '@rilaykit/forms';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const def = form.create(r, 'f').add({ id: 'a', type: 'text', props: {} });

describe('<Form.Submit>', () => {
  it('renders a bare submit button by default', () => {
    render(
      <Form of={def}>
        <FormSubmit>Send</FormSubmit>
      </Form>
    );
    const btn = screen.getByRole('button', { name: 'Send' });
    expect(btn.getAttribute('type')).toBe('submit');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('exposes submitting/submit through the render prop', () => {
    render(
      <Form of={def}>
        <FormSubmit>
          {({ submitting }) => <button type="submit">{submitting ? 'Sending…' : 'Go'}</button>}
        </FormSubmit>
      </Form>
    );
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });
});
