import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril, when } from '@rilaykit/core';
import { Form, FormBody, form } from '@rilaykit/forms';

const r = ril.create().addComponent('text', {
  name: 'Text',
  renderer: ({ id }: { id: string }) => <input data-testid={id} />,
});

const definition = form
  .create(r, 'profile')
  .add({ id: 'name', type: 'text', props: {} })
  .add({
    id: 'siren',
    type: 'text',
    props: {},
    conditions: { visible: when('name').equals('business') },
  });

describe('<Form.Body>', () => {
  it('renders bare rows and fields by default', () => {
    render(
      <Form of={definition}>
        <FormBody />
      </Form>
    );
    expect(screen.getByTestId('name')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-form-row]').length).toBe(1); // hidden row dropped
    expect(screen.queryByTestId('siren')).toBeNull();
  });

  it('exposes visible rows through the render prop', () => {
    render(
      <Form of={definition} defaults={{ name: 'business' }}>
        <FormBody>
          {({ rows }) => (
            <output data-testid="rows">
              {rows.map((row) => (row.kind === 'fields' ? row.fields.length : 0)).join(',')}
            </output>
          )}
        </FormBody>
      </Form>
    );
    expect(screen.getByTestId('rows').textContent).toBe('1,1');
  });
});
