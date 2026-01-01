import { ril, when } from '@rilaykit/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';
import { FormRow } from '../../src/components/FormRow';

let config: ril<Record<string, any>>;

// Default row renderer for tests
const defaultRowRenderer = ({ children, className }: any) => (
  <div className={className} data-testid="default-row">
    {children}
  </div>
);

describe('FormRow - Conditional Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('switch', {
        name: 'Switch',
        renderer: ({ id, value, onChange, props }: any) => (
          <div>
            <label htmlFor={id}>{props.label}</label>
            <input
              id={id}
              type="checkbox"
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
              data-testid={id}
            />
          </div>
        ),
      })
      .addComponent('text', {
        name: 'Text Input',
        renderer: ({ id, value, onChange, props, error }: any) => (
          <div>
            <label htmlFor={id}>{props.label}</label>
            <input
              id={id}
              type="text"
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={props.placeholder}
              data-testid={id}
            />
            {error && error.length > 0 && (
              <span data-testid={`${id}-error`}>{error[0].message}</span>
            )}
          </div>
        ),
      })
      .configure({
        rowRenderer: defaultRowRenderer,
      });
  });

  it('should render FormRow with all visible fields', () => {
    const formConfig = form
      .create(config)
      .add(
        {
          id: 'firstName',
          type: 'text',
          props: { label: 'First Name' },
        },
        {
          id: 'lastName',
          type: 'text',
          props: { label: 'Last Name' },
        }
      )
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormRow row={formConfig.rows[0]} />
      </FormProvider>
    );

    // Both fields should be visible
    expect(screen.getByTestId('firstName')).toBeInTheDocument();
    expect(screen.getByTestId('lastName')).toBeInTheDocument();
  });

  it('should hide entire row when all fields are hidden', async () => {
    const user = userEvent.setup();

    const formConfig = form
      .create(config)
      .add({
        id: 'toggle',
        type: 'switch',
        props: { label: 'Show Details' },
      })
      .add(
        {
          id: 'firstName',
          type: 'text',
          conditions: {
            visible: when('toggle').equals(true),
          },
          props: { label: 'First Name' },
        },
        {
          id: 'lastName',
          type: 'text',
          conditions: {
            visible: when('toggle').equals(true),
          },
          props: { label: 'Last Name' },
        }
      )
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ toggle: false }}>
        <FormRow row={formConfig.rows[0]} />
        <FormRow row={formConfig.rows[1]} />
      </FormProvider>
    );

    // Toggle should be visible
    expect(screen.getByTestId('toggle')).toBeInTheDocument();

    // All fields in conditional row should be hidden
    expect(screen.queryByTestId('firstName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lastName')).not.toBeInTheDocument();

    // Toggle the switch
    await user.click(screen.getByTestId('toggle'));

    // Wait for fields to appear
    await waitFor(() => {
      expect(screen.getByTestId('firstName')).toBeInTheDocument();
      expect(screen.getByTestId('lastName')).toBeInTheDocument();
    });
  });

  it('should show row with only visible fields', async () => {
    const user = userEvent.setup();

    const formConfig = form
      .create(config)
      .add({
        id: 'showSecondField',
        type: 'switch',
        props: { label: 'Show Last Name' },
      })
      .add(
        {
          id: 'firstName',
          type: 'text',
          props: { label: 'First Name' },
        },
        {
          id: 'lastName',
          type: 'text',
          conditions: {
            visible: when('showSecondField').equals(true),
          },
          props: { label: 'Last Name' },
        }
      )
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ showSecondField: false }}>
        <FormRow row={formConfig.rows[0]} />
        <FormRow row={formConfig.rows[1]} />
      </FormProvider>
    );

    // First field should always be visible
    expect(screen.getByTestId('firstName')).toBeInTheDocument();
    // Second field should be hidden
    expect(screen.queryByTestId('lastName')).not.toBeInTheDocument();

    // Toggle to show second field
    await user.click(screen.getByTestId('showSecondField'));

    // Wait for second field to appear
    await waitFor(() => {
      expect(screen.getByTestId('lastName')).toBeInTheDocument();
    });

    // Both fields should now be visible
    expect(screen.getByTestId('firstName')).toBeInTheDocument();
    expect(screen.getByTestId('lastName')).toBeInTheDocument();
  });

  it('should return null when all fields in row are hidden', () => {
    const formConfig = form
      .create(config)
      .add(
        {
          id: 'field1',
          type: 'text',
          conditions: {
            visible: when('neverTrue').equals(true),
          },
          props: { label: 'Field 1' },
        },
        {
          id: 'field2',
          type: 'text',
          conditions: {
            visible: when('neverTrue').equals(true),
          },
          props: { label: 'Field 2' },
        }
      )
      .build();

    const TestWrapper = () => {
      const rowElement = <FormRow row={formConfig.rows[0]} />;
      return (
        <div data-testid="test-container">
          {rowElement}
          <span data-testid="marker">After Row</span>
        </div>
      );
    };

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ neverTrue: false }}>
        <TestWrapper />
      </FormProvider>
    );

    // No fields should be rendered
    expect(screen.queryByTestId('field1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field2')).not.toBeInTheDocument();

    // FormRow returns null, so no row wrapper should be rendered
    expect(screen.queryByTestId('default-row')).not.toBeInTheDocument();

    // But the marker should still be there
    expect(screen.getByTestId('marker')).toBeInTheDocument();
  });

  it('should handle dynamic visibility changes correctly', async () => {
    const user = userEvent.setup();

    const formConfig = form
      .create(config)
      .add({
        id: 'toggle1',
        type: 'switch',
        props: { label: 'Toggle 1' },
      })
      .add({
        id: 'toggle2',
        type: 'switch',
        props: { label: 'Toggle 2' },
      })
      .add(
        {
          id: 'field1',
          type: 'text',
          conditions: {
            visible: when('toggle1').equals(true),
          },
          props: { label: 'Field 1' },
        },
        {
          id: 'field2',
          type: 'text',
          conditions: {
            visible: when('toggle2').equals(true),
          },
          props: { label: 'Field 2' },
        }
      )
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ toggle1: false, toggle2: false }}>
        <FormRow row={formConfig.rows[0]} />
        <FormRow row={formConfig.rows[1]} />
        <FormRow row={formConfig.rows[2]} />
      </FormProvider>
    );

    // Initially, no fields visible in conditional row
    expect(screen.queryByTestId('field1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field2')).not.toBeInTheDocument();

    // Show first field - row should now render
    await user.click(screen.getByTestId('toggle1'));
    await waitFor(() => {
      expect(screen.getByTestId('field1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('field2')).not.toBeInTheDocument();

    // Show second field too
    await user.click(screen.getByTestId('toggle2'));
    await waitFor(() => {
      expect(screen.getByTestId('field2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field1')).toBeInTheDocument();

    // Hide first field - row still visible with field2
    await user.click(screen.getByTestId('toggle1'));
    await waitFor(() => {
      expect(screen.queryByTestId('field1')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('field2')).toBeInTheDocument();

    // Hide second field - row should return null again
    await user.click(screen.getByTestId('toggle2'));
    await waitFor(() => {
      expect(screen.queryByTestId('field2')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('field1')).not.toBeInTheDocument();
  });

  it('should work with custom rowRenderer', () => {
    const customRowRenderer = vi.fn(({ children }: any) => (
      <div data-testid="custom-row" className="custom-row-class">
        {children}
      </div>
    ));

    const configWithRenderer = config.configure({
      rowRenderer: customRowRenderer,
    });

    const formConfig = form
      .create(configWithRenderer)
      .add(
        {
          id: 'field1',
          type: 'text',
          props: { label: 'Field 1' },
        },
        {
          id: 'field2',
          type: 'text',
          props: { label: 'Field 2' },
        }
      )
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormRow row={formConfig.rows[0]} />
      </FormProvider>
    );

    // Custom renderer should be used
    expect(customRowRenderer).toHaveBeenCalled();
    expect(screen.getByTestId('custom-row')).toBeInTheDocument();
    expect(screen.getByTestId('field1')).toBeInTheDocument();
    expect(screen.getByTestId('field2')).toBeInTheDocument();
  });

  it('should not call rowRenderer when all fields are hidden', () => {
    const customRowRenderer = vi.fn(({ children }: any) => (
      <div data-testid="custom-row">{children}</div>
    ));

    const configWithRenderer = config.configure({
      rowRenderer: customRowRenderer,
    });

    const formConfig = form
      .create(configWithRenderer)
      .add({
        id: 'field1',
        type: 'text',
        conditions: {
          visible: when('neverTrue').equals(true),
        },
        props: { label: 'Field 1' },
      })
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ neverTrue: false }}>
        <FormRow row={formConfig.rows[0]} />
      </FormProvider>
    );

    // Custom renderer should NOT be called since row returns null
    expect(customRowRenderer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('custom-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field1')).not.toBeInTheDocument();
  });
});
