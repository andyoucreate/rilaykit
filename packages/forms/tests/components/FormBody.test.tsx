import { ril, when } from '@rilaykit/core';
import { Form, FormBody, type VisibleRow, form, useFormRows } from '@rilaykit/forms';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const r = ril.create().component('text', {
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

// One row containing two fields, where only 'b' is conditionally hidden:
// partial filtering must keep the row and drop only the hidden field.
const partialRowDefinition = form.create(r, 'partial').add(
  { id: 'a', type: 'text', props: {} },
  {
    id: 'b',
    type: 'text',
    props: {},
    conditions: { visible: when('a').equals('x') },
  }
);

describe('<Form.Body>', () => {
  it('renders bare rows and fields by default', () => {
    render(
      <Form of={definition}>
        <FormBody className="body-cls" />
      </Form>
    );
    const body = document.querySelector('[data-form-body]');
    expect(body).not.toBeNull();
    expect(body!.className).toBe('body-cls');
    expect(screen.getByTestId('name')).toBeInTheDocument();
    const formRows = document.querySelectorAll('[data-form-row]');
    expect(formRows.length).toBe(1); // hidden row dropped
    expect(formRows[0]!.getAttribute('data-form-row')).toBe('row-1');
    expect(formRows[0].parentElement).toBe(body);
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
    // Render prop replaces the default markup entirely.
    expect(document.querySelector('[data-form-body]')).toBeNull();
    expect(document.querySelector('[data-form-row]')).toBeNull();
  });

  it('wraps all visible fields of a multi-field row in a single row div', () => {
    render(
      <Form of={partialRowDefinition} defaults={{ a: 'x' }}>
        <FormBody />
      </Form>
    );
    const formRows = document.querySelectorAll('[data-form-row]');
    expect(formRows.length).toBe(1);
    expect(screen.getByTestId('a').closest('[data-form-row]')).toBe(formRows[0]);
    expect(screen.getByTestId('b').closest('[data-form-row]')).toBe(formRows[0]);
  });

  it('keeps a row with a hidden field and filters only that field', () => {
    render(
      <Form of={partialRowDefinition}>
        <FormBody />
      </Form>
    );
    expect(document.querySelectorAll('[data-form-row]').length).toBe(1);
    expect(document.querySelector('[data-form-row]')!.getAttribute('data-form-row')).toBe('row-1');
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.queryByTestId('b')).toBeNull();
  });

  it('exposes partially filtered rows through the render prop', () => {
    let captured: VisibleRow[] = [];
    render(
      <Form of={partialRowDefinition}>
        <FormBody>
          {({ rows }) => {
            captured = rows;
            return null;
          }}
        </FormBody>
      </Form>
    );
    expect(captured.length).toBe(1);
    const row = captured[0];
    expect(row.kind).toBe('fields');
    if (row.kind !== 'fields') {
      throw new Error('expected a fields row');
    }
    expect(row.fields.map((field) => field.id)).toEqual(['a']);
    expect(row.maxColumns).toBe(2); // row layout metadata survives filtering
  });
});

describe('useFormRows', () => {
  function RowsProbe() {
    const rows: VisibleRow[] = useFormRows();
    return (
      <output data-testid="row-ids">{rows.map((row) => `${row.kind}:${row.id}`).join(',')}</output>
    );
  }

  it('is exported from @rilaykit/forms and returns visible row ids and kinds', () => {
    render(
      <Form of={definition} defaults={{ name: 'business' }}>
        <RowsProbe />
      </Form>
    );
    expect(screen.getByTestId('row-ids').textContent).toBe('fields:row-1,fields:row-2');
  });

  it('drops rows whose only field is hidden', () => {
    render(
      <Form of={definition}>
        <RowsProbe />
      </Form>
    );
    expect(screen.getByTestId('row-ids').textContent).toBe('fields:row-1');
  });
});
