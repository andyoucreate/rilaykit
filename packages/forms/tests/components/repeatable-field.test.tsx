import type { FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';

// =================================================================
// MOCK COMPONENTS
// =================================================================

const MockTextInput = ({ id, value, onChange, props }: any) => (
  <div data-testid={`field-${id}`}>
    <label>{props?.label}</label>
    <input
      data-testid={`input-${id}`}
      value={value || ''}
      onChange={(e: any) => onChange?.(e.target.value)}
    />
  </div>
);

const MockNumberInput = ({ id, value, onChange, props }: any) => (
  <div data-testid={`field-${id}`}>
    <label>{props?.label}</label>
    <input
      type="number"
      data-testid={`input-${id}`}
      value={value ?? ''}
      onChange={(e: any) => onChange?.(Number(e.target.value))}
    />
  </div>
);

// =================================================================
// HELPERS
// =================================================================

let rilConfig: any;

const TestBodyRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const TestRowRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

function buildFormConfig(opts?: {
  min?: number;
  max?: number;
  repeatableRenderer?: any;
  repeatableItemRenderer?: any;
}): FormConfiguration {
  const cfg = rilConfig.configure({
    bodyRenderer: TestBodyRenderer,
    rowRenderer: TestRowRenderer,
    ...(opts?.repeatableRenderer ? { repeatableRenderer: opts.repeatableRenderer } : {}),
    ...(opts?.repeatableItemRenderer
      ? { repeatableItemRenderer: opts.repeatableItemRenderer }
      : {}),
  });

  return form
    .create(cfg, 'test-form')
    .add({ id: 'title', type: 'text', props: { label: 'Title' } })
    .addRepeatable('items', (r) => {
      let b = r.add(
        { id: 'name', type: 'text', props: { label: 'Item Name' } },
        { id: 'qty', type: 'number', props: { label: 'Qty' } }
      );
      if (opts?.min !== undefined) b = b.min(opts.min);
      if (opts?.max !== undefined) b = b.max(opts.max);
      return b.defaultValue({ name: '', qty: 1 });
    })
    .build();
}

function renderForm(config: FormConfiguration, defaultValues?: Record<string, unknown>) {
  return render(
    <FormProvider formConfig={config} defaultValues={defaultValues}>
      <FormBody />
    </FormProvider>
  );
}

// =================================================================
// TESTS
// =================================================================

describe('RepeatableField + RepeatableItem Components', () => {
  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text',
        renderer: MockTextInput,
        defaultProps: { label: '' },
      })
      .addComponent('number', {
        name: 'Number',
        renderer: MockNumberInput,
        defaultProps: { label: '', min: 0 },
      });
  });

  describe('rendering', () => {
    it('should render empty repeatable with add button', () => {
      const config = buildFormConfig();
      renderForm(config);

      const addButton = screen.getByText('Add');
      expect(addButton).toBeInTheDocument();
      expect(addButton).toHaveAttribute('data-repeatable-add', 'items');
    });

    it('should render items from default values', () => {
      const config = buildFormConfig();
      renderForm(config, {
        title: 'Order',
        items: [{ name: 'Widget', qty: 2 }],
      });

      expect(screen.getByTestId('input-items[k0].name')).toHaveValue('Widget');
      expect(screen.getByTestId('input-items[k0].qty')).toHaveValue(2);
    });

    it('should render multiple items', () => {
      const config = buildFormConfig();
      renderForm(config, {
        items: [
          { name: 'A', qty: 1 },
          { name: 'B', qty: 2 },
        ],
      });

      expect(screen.getByTestId('input-items[k0].name')).toHaveValue('A');
      expect(screen.getByTestId('input-items[k1].name')).toHaveValue('B');
    });

    it('should render min items on mount', () => {
      const config = buildFormConfig({ min: 2 });
      renderForm(config);

      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
      expect(screen.getByTestId('input-items[k1].name')).toBeInTheDocument();
    });
  });

  describe('add / remove', () => {
    it('should add an item when clicking Add', () => {
      const config = buildFormConfig();
      renderForm(config);

      fireEvent.click(screen.getByText('Add'));

      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
      expect(screen.getByTestId('input-items[k0].qty')).toBeInTheDocument();
    });

    it('should add multiple items', () => {
      const config = buildFormConfig();
      renderForm(config);

      fireEvent.click(screen.getByText('Add'));
      fireEvent.click(screen.getByText('Add'));

      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
      expect(screen.getByTestId('input-items[k1].name')).toBeInTheDocument();
    });

    it('should hide Add button when max is reached', () => {
      const config = buildFormConfig({ max: 1 });
      renderForm(config);

      fireEvent.click(screen.getByText('Add'));

      expect(screen.queryByText('Add')).not.toBeInTheDocument();
    });
  });

  describe('static + repeatable fields coexist', () => {
    it('should render static fields alongside repeatable', () => {
      const config = buildFormConfig();
      renderForm(config, { title: 'My Order' });

      expect(screen.getByTestId('input-title')).toHaveValue('My Order');
    });
  });

  describe('data attributes', () => {
    it('should set data-repeatable-id on container', () => {
      const config = buildFormConfig();
      const { container } = renderForm(config);

      const repeatableDiv = container.querySelector('[data-repeatable-id="items"]');
      expect(repeatableDiv).toBeInTheDocument();
    });

    it('should set data-repeatable-item on each item', () => {
      const config = buildFormConfig();
      renderForm(config, { items: [{ name: 'A', qty: 1 }] });

      const itemDiv = screen.getByTestId('input-items[k0].name').closest('[data-repeatable-item]');
      expect(itemDiv).toHaveAttribute('data-repeatable-item', 'k0');
    });
  });

  describe('custom renderers', () => {
    it('should use custom repeatableRenderer', () => {
      const customRenderer = vi.fn(({ children, onAdd, canAdd, repeatableId }) => (
        <div data-testid="custom-repeatable">
          <span>Custom {repeatableId}</span>
          {children}
          {canAdd && (
            <button data-testid="custom-add" onClick={onAdd}>
              Custom Add
            </button>
          )}
        </div>
      ));

      const config = buildFormConfig({ repeatableRenderer: customRenderer });
      renderForm(config);

      expect(screen.getByTestId('custom-repeatable')).toBeInTheDocument();
      expect(screen.getByText('Custom items')).toBeInTheDocument();
      expect(customRenderer).toHaveBeenCalled();
    });

    it('should use custom repeatableItemRenderer', () => {
      const customItemRenderer = vi.fn(({ children, item, index, onRemove }) => (
        <div data-testid={`custom-item-${item.key}`}>
          <span>Item #{index + 1}</span>
          {children}
          <button onClick={onRemove} data-testid={`remove-${item.key}`}>
            Remove
          </button>
        </div>
      ));

      const config = buildFormConfig({ repeatableItemRenderer: customItemRenderer });
      renderForm(config, { items: [{ name: 'Test', qty: 1 }] });

      expect(screen.getByTestId('custom-item-k0')).toBeInTheDocument();
      expect(screen.getByText('Item #1')).toBeInTheDocument();
      expect(customItemRenderer).toHaveBeenCalled();
    });
  });
});
