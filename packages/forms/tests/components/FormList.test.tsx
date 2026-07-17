import { NotFoundError, ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Form, FormBody, FormField, FormList } from '@rilaykit/forms/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

const withStatic = form
  .create(r, 'order')
  .add({ id: 'title', type: 'text', props: {} })
  .addRepeatable('items', (rb) => rb.add({ id: 'name', type: 'text', props: {} }));

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

  it('removes an item and reflects canRemove through the render prop', () => {
    render(
      <Form of={def} defaults={{ phones: [{ number: 'first' }, { number: 'second' }] }}>
        <FormList id="phones">
          {({ items, remove, canRemove }) => (
            <div>
              <output data-testid="can-remove">{String(canRemove)}</output>
              {items.map((item) => (
                <div key={item.key}>
                  {item.allFields.map((field) => (
                    <FormField key={field.id} id={field.id} config={field} />
                  ))}
                  <button
                    type="button"
                    data-testid={`remove-${item.key}`}
                    onClick={() => remove(item.key)}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormList>
      </Form>
    );
    expect(screen.getAllByRole('textbox').length).toBe(2);
    expect(screen.getByTestId('can-remove').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('remove-k0'));
    const remaining = screen.getAllByRole('textbox');
    expect(remaining.length).toBe(1);
    expect((remaining[0] as HTMLInputElement).value).toBe('second');
    expect(screen.getByTestId('can-remove').textContent).toBe('false');
  });

  it('reorders items through the render prop move', () => {
    render(
      <Form of={def} defaults={{ phones: [{ number: 'first' }, { number: 'second' }] }}>
        <FormList id="phones">
          {({ items, move }) => (
            <div>
              <button type="button" data-testid="move-down" onClick={() => move(0, 1)}>
                v
              </button>
              {items.map((item) => (
                <div key={item.key}>
                  {item.allFields.map((field) => (
                    <FormField key={field.id} id={field.id} config={field} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </FormList>
      </Form>
    );
    const readValues = () =>
      screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value);
    expect(readValues()).toEqual(['first', 'second']);
    fireEvent.click(screen.getByTestId('move-down'));
    expect(readValues()).toEqual(['second', 'first']);
  });

  it('renders an empty min-0 list with only the add button, which appends the first item', () => {
    render(
      <Form of={withStatic}>
        <FormList id="items" />
      </Form>
    );
    expect(screen.queryAllByRole('textbox').length).toBe(0);
    const addButton = document.querySelector('[data-form-list-add="items"]');
    expect(addButton).not.toBe(null);
    fireEvent.click(addButton as HTMLElement);
    expect(screen.getAllByRole('textbox').length).toBe(1);
  });

  it('drops the row wrapper when every field in a row is condition-hidden', async () => {
    const withCondition = form.create(r, 'shipments').addRepeatable('parcels', (rb) =>
      rb.add({ id: 'kind', type: 'text', props: {} }).add({
        id: 'weight',
        type: 'text',
        props: {},
        conditions: { visible: when('kind').equals('physical') },
      })
    );
    const { container } = render(
      <Form
        of={withCondition}
        defaults={{
          parcels: [
            { kind: 'digital', weight: '' },
            { kind: 'physical', weight: '2kg' },
          ],
        }}
      >
        <FormList id="parcels" />
      </Form>
    );
    const itemRows = (key: string) =>
      (container.querySelector(`[data-form-list-item="${key}"]`) as HTMLElement).querySelectorAll(
        '[data-form-row]'
      );
    // k0 (digital): the weight row's only field is hidden — its wrapper must be dropped
    await waitFor(() => {
      expect(itemRows('k0').length).toBe(1);
    });
    // k1 (physical): both rows stay
    expect(itemRows('k1').length).toBe(2);
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
