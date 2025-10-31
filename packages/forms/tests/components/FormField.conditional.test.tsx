import { ril, when } from '@rilaykit/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';

let config: ril<Record<string, any>>;

describe('FormField - Conditional Visibility', () => {
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
      });
  });

  it('should show/hide field based on switch condition', async () => {
    const user = userEvent.setup();

    // Create form with conditional fields similar to the user's case
    const formConfig = form
      .create(config)
      .add({
        id: 'isRepresentativeSelf',
        type: 'switch',
        props: {
          label: 'Je suis le représentant légal',
        },
      })
      .add({
        id: 'representativeFirstName',
        type: 'text',
        conditions: {
          visible: when('isRepresentativeSelf').equals(false),
        },
        props: {
          label: 'Prénom du représentant',
          placeholder: 'John',
        },
      })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{
          isRepresentativeSelf: true,
        }}
      >
        <FormField fieldId="isRepresentativeSelf" />
        <FormField fieldId="representativeFirstName" />
      </FormProvider>
    );

    // Initially, switch is checked (true), so conditional field should be hidden
    expect(screen.getByTestId('isRepresentativeSelf')).toBeChecked();
    expect(screen.queryByTestId('representativeFirstName')).not.toBeInTheDocument();

    // Uncheck the switch
    await user.click(screen.getByTestId('isRepresentativeSelf'));

    // Wait for field to appear
    await waitFor(() => {
      expect(screen.getByTestId('representativeFirstName')).toBeInTheDocument();
    });

    // Verify field is visible
    expect(screen.getByTestId('representativeFirstName')).toBeVisible();
    expect(screen.getByLabelText('Prénom du représentant')).toBeInTheDocument();
  });

  it('should show multiple fields when switch condition changes', async () => {
    const user = userEvent.setup();

    // Create form with multiple conditional fields
    const formConfig = form
      .create(config)
      .add({
        id: 'isRepresentativeSelf',
        type: 'switch',
        props: {
          label: 'Je suis le représentant légal',
        },
      })
      .add({
        id: 'representativeFirstName',
        type: 'text',
        conditions: {
          visible: when('isRepresentativeSelf').equals(false),
        },
        props: {
          label: 'Prénom du représentant',
          placeholder: 'John',
        },
      })
      .add({
        id: 'representativeLastName',
        type: 'text',
        conditions: {
          visible: when('isRepresentativeSelf').equals(false),
        },
        props: {
          label: 'Nom du représentant',
          placeholder: 'Doe',
        },
      })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{
          isRepresentativeSelf: true,
        }}
      >
        <FormField fieldId="isRepresentativeSelf" />
        <FormField fieldId="representativeFirstName" />
        <FormField fieldId="representativeLastName" />
      </FormProvider>
    );

    // Initially hidden
    expect(screen.queryByTestId('representativeFirstName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('representativeLastName')).not.toBeInTheDocument();

    // Uncheck the switch
    await user.click(screen.getByTestId('isRepresentativeSelf'));

    // Both fields should appear
    await waitFor(() => {
      expect(screen.getByTestId('representativeFirstName')).toBeInTheDocument();
      expect(screen.getByTestId('representativeLastName')).toBeInTheDocument();
    });
  });

  it('should hide fields again when switch is toggled back', async () => {
    const user = userEvent.setup();

    const formConfig = form
      .create(config)
      .add({
        id: 'isRepresentativeSelf',
        type: 'switch',
        props: {
          label: 'Je suis le représentant légal',
        },
      })
      .add({
        id: 'representativeFirstName',
        type: 'text',
        conditions: {
          visible: when('isRepresentativeSelf').equals(false),
        },
        props: {
          label: 'Prénom du représentant',
        },
      })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{
          isRepresentativeSelf: true,
        }}
      >
        <FormField fieldId="isRepresentativeSelf" />
        <FormField fieldId="representativeFirstName" />
      </FormProvider>
    );

    // Toggle off
    await user.click(screen.getByTestId('isRepresentativeSelf'));
    await waitFor(() => {
      expect(screen.getByTestId('representativeFirstName')).toBeInTheDocument();
    });

    // Toggle back on
    await user.click(screen.getByTestId('isRepresentativeSelf'));
    await waitFor(() => {
      expect(screen.queryByTestId('representativeFirstName')).not.toBeInTheDocument();
    });
  });

  it('should evaluate conditions when field value changes', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();

    const formConfig = form
      .create(config)
      .add({
        id: 'isRepresentativeSelf',
        type: 'switch',
        props: {
          label: 'Toggle',
        },
      })
      .add({
        id: 'conditionalField',
        type: 'text',
        conditions: {
          visible: when('isRepresentativeSelf').equals(false),
        },
        props: {
          label: 'Conditional Field',
        },
      })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ isRepresentativeSelf: true }}
        onFieldChange={onFieldChange}
      >
        <FormField fieldId="isRepresentativeSelf" />
        <FormField fieldId="conditionalField" />
      </FormProvider>
    );

    // Change the switch value
    await user.click(screen.getByTestId('isRepresentativeSelf'));

    // Verify onChange was called
    expect(onFieldChange).toHaveBeenCalledWith('isRepresentativeSelf', false, expect.any(Object));

    // Verify field appears
    await waitFor(() => {
      expect(screen.getByTestId('conditionalField')).toBeInTheDocument();
    });
  });
});
