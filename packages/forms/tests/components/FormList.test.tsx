import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, ril } from '@rilaykit/core';
import { Form, FormBody, FormList, form } from '@rilaykit/forms';

const r = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

const def = form
  .create(r, 'contacts')
  .addRepeatable('phones', (rb) => rb.add({ id: 'number', type: 'text', props: {} }).min(1).max(2));

describe('<Form.List>', () => {
  it('renders one item per default entry with an add button (bare default)', () => {
    render(
      <Form of={def}>
        <FormList id="phones" />
      </Form>
    );
    expect(screen.getAllByRole('textbox').length).toBe(1);
    fireEvent.click(document.querySelector('[data-form-list-add="phones"]') as HTMLElement);
    expect(screen.getAllByRole('textbox').length).toBe(2);
  });

  it('exposes items/add/remove through the render prop', () => {
    render(
      <Form of={def}>
        <FormList id="phones">
          {({ items, add, canAdd }) => (
            <div>
              <output data-testid="count">{items.length}</output>
              <button type="button" disabled={!canAdd} onClick={add} data-testid="my-add">
                +
              </button>
            </div>
          )}
        </FormList>
      </Form>
    );
    expect(screen.getByTestId('count').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('my-add'));
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('throws NotFoundError for an unknown list id', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <Form of={def}>
          <FormList id="ghost" />
        </Form>
      )
    ).toThrowError(NotFoundError);
    consoleSpy.mockRestore();
  });

  it('hides the add button once max is reached', () => {
    render(
      <Form of={def}>
        <FormList id="phones" />
      </Form>
    );
    fireEvent.click(document.querySelector('[data-form-list-add="phones"]') as HTMLElement);
    expect(screen.getAllByRole('textbox').length).toBe(2);
    expect(document.querySelector('[data-form-list-add="phones"]')).toBe(null);
  });

  it('sets data-form-list on the container and data-form-list-item per item', () => {
    const { container } = render(
      <Form of={def}>
        <FormList id="phones" />
      </Form>
    );
    const list = container.querySelector('[data-form-list="phones"]') as HTMLElement;
    const items = list.querySelectorAll('[data-form-list-item]');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-form-list-item')).toBe('k0');
  });
});

describe('<FormBody> default path with repeatables', () => {
  const withStatic = form
    .create(r, 'order')
    .add({ id: 'title', type: 'text', props: {} })
    .addRepeatable('items', (rb) => rb.add({ id: 'name', type: 'text', props: {} }));

  it('renders FormList items from default values alongside static fields', () => {
    render(
      <Form
        of={withStatic}
        defaults={{ title: 'Order', items: [{ name: 'Widget' }, { name: 'Gadget' }] }}
      >
        <FormBody />
      </Form>
    );
    expect((screen.getByTestId('title') as HTMLInputElement).value).toBe('Order');
    expect((screen.getByTestId('items[k0].name') as HTMLInputElement).value).toBe('Widget');
    expect((screen.getByTestId('items[k1].name') as HTMLInputElement).value).toBe('Gadget');
  });

  it('adds an item through the bare default add button', () => {
    render(
      <Form of={withStatic} defaults={{ items: [{ name: 'First' }] }}>
        <FormBody />
      </Form>
    );
    fireEvent.click(document.querySelector('[data-form-list-add="items"]') as HTMLElement);
    expect((screen.getByTestId('items[k1].name') as HTMLInputElement).value).toBe('');
  });
});
