// @ts-nocheck — generic constraints bypass for e2e flexibility
import { custom, required } from '@rilaykit/core';
import { FormBody, FormProvider, fromSchema } from '@rilaykit/forms';
import type { FormSchema, SchemaRegistry } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldErrorDisplay,
  FormStateDisplay,
  FormValuesDisplay,
  RepeatableControls,
  SetValueButton,
  SubmitButton,
  ValidationTrigger,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// =================================================================
// SHARED SETUP
// =================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

beforeEach(() => {
  rilConfig = createTestRilConfig();
});

// Helper: render a schema-driven form
function renderSchema(
  schema: FormSchema,
  options: {
    registry?: SchemaRegistry;
    onSubmit?: (data: any) => void | Promise<void>;
    extraChildren?: React.ReactNode;
  } = {}
) {
  const { formConfig, defaultValues } = fromSchema(schema, rilConfig, options.registry);

  return render(
    <FormProvider formConfig={formConfig} defaultValues={defaultValues} onSubmit={options.onSubmit}>
      <FormBody />
      {options.extraChildren}
    </FormProvider>
  );
}

// =================================================================
// BASIC RENDERING
// =================================================================

describe('fromSchema e2e — rendering', () => {
  it('renders a flat fields schema with correct inputs', () => {
    renderSchema({
      id: 'basic',
      fields: [
        { id: 'name', type: 'text', props: { label: 'Name', placeholder: 'Enter name' } },
        { id: 'email', type: 'text', props: { label: 'Email' } },
      ],
    });

    expect(screen.getByTestId('input-name')).toBeInTheDocument();
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
    expect(screen.getByTestId('input-name')).toHaveAttribute('placeholder', 'Enter name');
  });

  it('renders a rows-format schema with multi-field rows', () => {
    renderSchema({
      id: 'rows-form',
      rows: [
        {
          kind: 'fields',
          fields: [
            { id: 'first', type: 'text', props: { label: 'First' } },
            { id: 'last', type: 'text', props: { label: 'Last' } },
          ],
        },
        {
          kind: 'fields',
          fields: [{ id: 'email', type: 'text', props: { label: 'Email' } }],
        },
      ],
    });

    expect(screen.getByTestId('input-first')).toBeInTheDocument();
    expect(screen.getByTestId('input-last')).toBeInTheDocument();
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
  });

  it('populates fields with defaultValues from schema', () => {
    renderSchema({
      id: 'defaults',
      fields: [
        { id: 'name', type: 'text' },
        { id: 'city', type: 'text' },
      ],
      defaultValues: { name: 'Karl', city: 'Paris' },
    });

    expect(screen.getByTestId('input-name')).toHaveValue('Karl');
    expect(screen.getByTestId('input-city')).toHaveValue('Paris');
  });

  it('merges schema props with component defaultProps', () => {
    renderSchema({
      id: 'merge-props',
      fields: [{ id: 'name', type: 'text', props: { label: 'Custom Label' } }],
    });

    // Component has defaultProps { label: '', placeholder: '' }
    // Schema overrides label but keeps placeholder default
    expect(screen.getByText('Custom Label')).toBeInTheDocument();
  });

  it('renders >3 fields in a single row without splitting', () => {
    renderSchema({
      id: 'wide-row',
      rows: [
        {
          fields: [
            { id: 'a', type: 'text' },
            { id: 'b', type: 'text' },
            { id: 'c', type: 'text' },
            { id: 'd', type: 'text' },
            { id: 'e', type: 'text' },
          ],
        },
      ],
    });

    expect(screen.getByTestId('input-a')).toBeInTheDocument();
    expect(screen.getByTestId('input-b')).toBeInTheDocument();
    expect(screen.getByTestId('input-c')).toBeInTheDocument();
    expect(screen.getByTestId('input-d')).toBeInTheDocument();
    expect(screen.getByTestId('input-e')).toBeInTheDocument();
  });
});

// =================================================================
// VALIDATION
// =================================================================

describe('fromSchema e2e — validation', () => {
  it('validates required fields via string shortcut', async () => {
    renderSchema(
      {
        id: 'val-required',
        fields: [{ id: 'name', type: 'text', validation: { rules: 'required' } }],
      },
      {
        extraChildren: (
          <>
            <ValidationTrigger />
            <FieldErrorDisplay id="name" />
          </>
        ),
      }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      expect(screen.getByTestId('errors-name')).toBeInTheDocument();
    });
  });

  it('validates email via string shortcut', async () => {
    renderSchema(
      {
        id: 'val-email',
        fields: [{ id: 'email', type: 'text', validation: { rules: ['required', 'email'] } }],
        defaultValues: { email: 'not-an-email' },
      },
      {
        extraChildren: (
          <>
            <ValidationTrigger />
            <FieldErrorDisplay id="email" />
          </>
        ),
      }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      expect(screen.getByTestId('errors-email')).toBeInTheDocument();
    });
  });

  it('validates with parameterized minLength', async () => {
    renderSchema(
      {
        id: 'val-minlength',
        fields: [
          {
            id: 'username',
            type: 'text',
            validation: { rules: { type: 'minLength', params: { min: 3 } } },
          },
        ],
        defaultValues: { username: 'ab' },
      },
      {
        extraChildren: (
          <>
            <ValidationTrigger />
            <FieldErrorDisplay id="username" />
          </>
        ),
      }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
    });

    // Fix the value and re-validate
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });
  });

  it('validates with pattern descriptor', async () => {
    renderSchema(
      {
        id: 'val-pattern',
        fields: [
          {
            id: 'zip',
            type: 'text',
            validation: {
              rules: {
                type: 'pattern',
                params: { pattern: '^\\d{5}$' },
                message: 'Must be 5 digits',
              },
            },
          },
        ],
        defaultValues: { zip: 'abc' },
      },
      {
        extraChildren: (
          <>
            <ValidationTrigger />
            <FieldErrorDisplay id="zip" />
          </>
        ),
      }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      expect(screen.getByTestId('error-zip-0')).toHaveTextContent('Must be 5 digits');
    });

    // Fix the value
    fireEvent.change(screen.getByTestId('input-zip'), { target: { value: '75001' } });
    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });
  });

  it('validates with registry custom validator', async () => {
    const passwordStrength = (_params, message) =>
      custom(
        (v: string) => !!v && v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v),
        message || 'Password must be 8+ chars with uppercase and number'
      );

    const registry: SchemaRegistry = { validators: { passwordStrength } };

    renderSchema(
      {
        id: 'val-registry',
        fields: [
          {
            id: 'password',
            type: 'text',
            validation: {
              rules: ['required', { type: 'passwordStrength', message: 'Weak password' }],
            },
          },
        ],
        defaultValues: { password: 'weak' },
      },
      {
        registry,
        extraChildren: (
          <>
            <ValidationTrigger />
            <FieldErrorDisplay id="password" />
          </>
        ),
      }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('errors-password')).toBeInTheDocument();
      expect(screen.getByTestId('error-password-0')).toHaveTextContent('Weak password');
    });

    // Fix the value
    fireEvent.change(screen.getByTestId('input-password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });
  });

  it('validates on blur when validateOnBlur is set', async () => {
    renderSchema(
      {
        id: 'val-blur',
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { rules: 'required', validateOnBlur: true },
          },
        ],
      },
      {
        extraChildren: <FieldErrorDisplay id="name" />,
      }
    );

    const input = screen.getByTestId('input-name');
    expect(screen.queryByTestId('errors-name')).not.toBeInTheDocument();

    fireEvent.focus(input);
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('errors-name')).toBeInTheDocument();
    });
  });

  it('passes validation when all required fields are filled', async () => {
    renderSchema(
      {
        id: 'val-pass',
        fields: [
          { id: 'name', type: 'text', validation: { rules: 'required' } },
          { id: 'email', type: 'text', validation: { rules: ['required', 'email'] } },
        ],
        defaultValues: { name: 'Karl', email: 'karl@example.com' },
      },
      { extraChildren: <ValidationTrigger /> }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });
  });
});

// =================================================================
// CONDITIONS
// =================================================================

describe('fromSchema e2e — conditions', () => {
  it('shows/hides fields based on visible condition', async () => {
    renderSchema(
      {
        id: 'cond-visible',
        fields: [
          {
            id: 'type',
            type: 'select',
            props: {
              label: 'Type',
              options: [
                { value: '', label: 'Select...' },
                { value: 'company', label: 'Company' },
                { value: 'personal', label: 'Personal' },
              ],
            },
          },
          {
            id: 'companyName',
            type: 'text',
            props: { label: 'Company Name' },
            conditions: {
              visible: { field: 'type', operator: 'equals', value: 'company' },
            },
          },
        ],
      },
      {
        extraChildren: <FormValuesDisplay />,
      }
    );

    // Hidden initially
    expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();

    // Show when type = company
    fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'company' } });

    await waitFor(() => {
      expect(screen.getByTestId('field-companyName')).toBeInTheDocument();
    });

    // Hide again when type changes
    fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'personal' } });

    await waitFor(() => {
      expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();
    });
  });

  it('disables fields based on disabled condition', async () => {
    renderSchema(
      {
        id: 'cond-disabled',
        fields: [
          { id: 'locked', type: 'checkbox', props: { label: 'Lock' } },
          {
            id: 'lockedField',
            type: 'text',
            props: { label: 'Locked Field' },
            conditions: {
              disabled: { field: 'locked', operator: 'equals', value: true },
            },
          },
        ],
      },
      {
        extraChildren: <SetValueButton id="locked" value={true} />,
      }
    );

    expect(screen.getByTestId('input-lockedField')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('set-locked'));

    await waitFor(() => {
      expect(screen.getByTestId('input-lockedField')).toBeDisabled();
    });
  });

  it('handles composite AND conditions', async () => {
    renderSchema(
      {
        id: 'cond-composite',
        fields: [
          { id: 'role', type: 'text' },
          { id: 'level', type: 'number' },
          {
            id: 'adminPanel',
            type: 'text',
            props: { label: 'Admin Panel' },
            conditions: {
              visible: {
                field: '',
                operator: 'equals',
                conditions: [
                  { field: 'role', operator: 'equals', value: 'admin' },
                  { field: 'level', operator: 'greaterThan', value: 5 },
                ],
                logicalOperator: 'and',
              },
            },
          },
        ],
      },
      {
        extraChildren: (
          <>
            <SetValueButton id="role" value="admin" />
            <SetValueButton id="level" value={10} />
          </>
        ),
      }
    );

    // Hidden initially (both conditions not met)
    expect(screen.queryByTestId('field-adminPanel')).not.toBeInTheDocument();

    // Set role to admin — still hidden (level not > 5)
    fireEvent.click(screen.getByTestId('set-role'));
    await waitFor(() => {
      expect(screen.queryByTestId('field-adminPanel')).not.toBeInTheDocument();
    });

    // Set level to 10 — now both conditions met
    fireEvent.click(screen.getByTestId('set-level'));
    await waitFor(() => {
      expect(screen.getByTestId('field-adminPanel')).toBeInTheDocument();
    });
  });

  it('hidden required fields do not block validation', async () => {
    renderSchema(
      {
        id: 'cond-skip-validation',
        fields: [
          { id: 'showExtra', type: 'checkbox', props: { label: 'Show Extra' } },
          {
            id: 'extraField',
            type: 'text',
            validation: { rules: 'required' },
            conditions: {
              visible: { field: 'showExtra', operator: 'equals', value: true },
            },
          },
        ],
        defaultValues: { showExtra: false },
      },
      { extraChildren: <ValidationTrigger /> }
    );

    // extraField is hidden — should not block validation
    expect(screen.queryByTestId('field-extraField')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });
  });
});

// =================================================================
// EFFECTS
// =================================================================

describe('fromSchema e2e — effects', () => {
  it('effect handler with params sets field props dynamically', async () => {
    const loadOptions = vi.fn((_value, context, params) => {
      const options = {
        france: [
          { value: 'paris', label: 'Paris' },
          { value: 'lyon', label: 'Lyon' },
        ],
        spain: [{ value: 'madrid', label: 'Madrid' }],
      };
      context.setProps(params.target, { options: options[_value] ?? [] });
    });

    const registry: SchemaRegistry = { effects: { loadOptions } };

    renderSchema(
      {
        id: 'effects-setprops',
        fields: [
          {
            id: 'country',
            type: 'select',
            props: {
              label: 'Country',
              options: [
                { value: '', label: 'Select...' },
                { value: 'france', label: 'France' },
                { value: 'spain', label: 'Spain' },
              ],
            },
          },
          {
            id: 'city',
            type: 'select',
            props: { label: 'City', options: [] },
            effects: [
              {
                trigger: 'change',
                watch: 'country',
                handler: 'loadOptions',
                params: { target: 'city' },
              },
            ],
          },
        ],
      },
      { registry }
    );

    // City select starts empty
    expect(screen.getByTestId('input-city').querySelectorAll('option')).toHaveLength(0);

    // Select France
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'france' } });

    await waitFor(() => {
      const options = screen.getByTestId('input-city').querySelectorAll('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Paris');
      expect(options[1]).toHaveTextContent('Lyon');
    });

    // Switch to Spain
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'spain' } });

    await waitFor(() => {
      const options = screen.getByTestId('input-city').querySelectorAll('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Madrid');
    });
  });

  it('effect handler with setValue clears dependent field', async () => {
    const clearCity = vi.fn((_value, context) => {
      context.setValue('city', '');
    });

    const registry: SchemaRegistry = { effects: { clearCity } };

    renderSchema(
      {
        id: 'effects-setvalue',
        fields: [
          { id: 'country', type: 'text' },
          {
            id: 'city',
            type: 'text',
            effects: [
              {
                trigger: 'change',
                watch: 'country',
                handler: 'clearCity',
              },
            ],
          },
        ],
      },
      {
        registry,
        extraChildren: (
          <>
            <SetValueButton id="city" value="Paris" />
            <FormValuesDisplay />
          </>
        ),
      }
    );

    // Set city manually
    fireEvent.click(screen.getByTestId('set-city'));

    await waitFor(() => {
      expect(screen.getByTestId('input-city')).toHaveValue('Paris');
    });

    // Change country → clearCity effect fires → city should be cleared
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'Spain' } });

    await waitFor(() => {
      expect(screen.getByTestId('input-city')).toHaveValue('');
      expect(clearCity).toHaveBeenCalled();
    });
  });

  it('curries params correctly to the effect handler', async () => {
    const handler = vi.fn();
    const registry: SchemaRegistry = { effects: { handler } };

    renderSchema(
      {
        id: 'effects-params',
        fields: [
          { id: 'trigger', type: 'text' },
          {
            id: 'target',
            type: 'text',
            effects: [
              {
                trigger: 'change',
                watch: 'trigger',
                handler: 'handler',
                params: { endpoint: '/api/data', format: 'json' },
              },
            ],
          },
        ],
      },
      { registry }
    );

    fireEvent.change(screen.getByTestId('input-trigger'), { target: { value: 'hello' } });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith(
        'hello',
        expect.objectContaining({ setValue: expect.any(Function) }),
        { endpoint: '/api/data', format: 'json' }
      );
    });
  });
});

// =================================================================
// REPEATABLES
// =================================================================

describe('fromSchema e2e — repeatables', () => {
  it('renders repeatable fields from schema', () => {
    renderSchema(
      {
        id: 'rep-basic',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'name', type: 'text', props: { label: 'Item Name' } }] }],
              defaultValue: { name: '' },
            },
          },
        ],
        defaultValues: {
          items: [{ name: 'Widget' }, { name: 'Gadget' }],
        },
      },
      {
        extraChildren: <RepeatableControls repeatableId="items" />,
      }
    );

    expect(screen.getByTestId('input-items[k0].name')).toHaveValue('Widget');
    expect(screen.getByTestId('input-items[k1].name')).toHaveValue('Gadget');
    expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('2');
  });

  it('appends and removes repeatable items', async () => {
    renderSchema(
      {
        id: 'rep-crud',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'name', type: 'text' }] }],
              defaultValue: { name: '' },
            },
          },
        ],
        defaultValues: { items: [{ name: 'First' }] },
      },
      {
        extraChildren: <RepeatableControls repeatableId="items" />,
      }
    );

    expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('1');

    // Append
    fireEvent.click(screen.getByTestId('repeatable-append-items'));

    await waitFor(() => {
      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('2');
      expect(screen.getByTestId('input-items[k1].name')).toHaveValue('');
    });

    // Remove first item
    fireEvent.click(screen.getByTestId('repeatable-remove-items-k0'));

    await waitFor(() => {
      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('1');
    });
  });

  it('enforces min/max constraints on repeatables', async () => {
    renderSchema(
      {
        id: 'rep-minmax',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'name', type: 'text' }] }],
              min: 1,
              max: 2,
              defaultValue: { name: '' },
            },
          },
        ],
        defaultValues: { items: [{ name: 'One' }] },
      },
      {
        extraChildren: <RepeatableControls repeatableId="items" />,
      }
    );

    // At min — can't remove
    expect(screen.getByTestId('repeatable-can-remove-items')).toHaveTextContent('false');

    // Can still add (1 < max 2)
    expect(screen.getByTestId('repeatable-can-add-items')).toHaveTextContent('true');

    // Add one item to reach max
    fireEvent.click(screen.getByTestId('repeatable-append-items'));

    await waitFor(() => {
      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('2');
      expect(screen.getByTestId('repeatable-can-add-items')).toHaveTextContent('false');
      expect(screen.getByTestId('repeatable-can-remove-items')).toHaveTextContent('true');
    });
  });

  it('validates fields inside repeatable items', async () => {
    renderSchema(
      {
        id: 'rep-validation',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [
                {
                  fields: [
                    {
                      id: 'name',
                      type: 'text',
                      validation: { rules: 'required' },
                    },
                  ],
                },
              ],
              defaultValue: { name: '' },
            },
          },
        ],
        defaultValues: { items: [{ name: '' }] },
      },
      { extraChildren: <ValidationTrigger /> }
    );

    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      const errors = JSON.parse(screen.getByTestId('validation-errors').textContent!);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e: any) => e.message === 'This field is required')).toBe(true);
    });
  });

  it('renders repeatable with multiple template rows', () => {
    renderSchema({
      id: 'rep-multi-rows',
      rows: [
        {
          kind: 'repeatable',
          repeatable: {
            id: 'addresses',
            rows: [
              { fields: [{ id: 'street', type: 'text', props: { label: 'Street' } }] },
              {
                fields: [
                  { id: 'city', type: 'text', props: { label: 'City' } },
                  { id: 'zip', type: 'text', props: { label: 'ZIP' } },
                ],
              },
            ],
            defaultValue: { street: '', city: '', zip: '' },
          },
        },
      ],
      defaultValues: {
        addresses: [{ street: '123 Main St', city: 'Paris', zip: '75001' }],
      },
    });

    expect(screen.getByTestId('input-addresses[k0].street')).toHaveValue('123 Main St');
    expect(screen.getByTestId('input-addresses[k0].city')).toHaveValue('Paris');
    expect(screen.getByTestId('input-addresses[k0].zip')).toHaveValue('75001');
  });
});

// =================================================================
// SUBMISSION
// =================================================================

describe('fromSchema e2e — submission', () => {
  it('submits form data from a schema-driven form', async () => {
    const onSubmit = vi.fn();

    renderSchema(
      {
        id: 'submit-basic',
        fields: [
          { id: 'name', type: 'text' },
          { id: 'email', type: 'text' },
        ],
        defaultValues: { name: 'Karl', email: 'karl@example.com' },
      },
      { onSubmit, extraChildren: <SubmitButton /> }
    );

    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const data = onSubmit.mock.calls[0][0];
      expect(data.name).toBe('Karl');
      expect(data.email).toBe('karl@example.com');
    });
  });

  it('blocks submission when validation fails', async () => {
    const onSubmit = vi.fn();

    renderSchema(
      {
        id: 'submit-blocked',
        fields: [{ id: 'name', type: 'text', validation: { rules: 'required' } }],
      },
      {
        onSubmit,
        extraChildren: (
          <>
            <SubmitButton />
            <FieldErrorDisplay id="name" />
          </>
        ),
      }
    );

    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByTestId('errors-name')).toBeInTheDocument();
    });
  });

  it('submits with force option even when validation fails', async () => {
    const onSubmit = vi.fn();

    renderSchema(
      {
        id: 'submit-force',
        fields: [{ id: 'name', type: 'text', validation: { rules: 'required' } }],
        submitOptions: { force: true },
      },
      { onSubmit, extraChildren: <SubmitButton /> }
    );

    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it('submits modified field values correctly', async () => {
    const onSubmit = vi.fn();

    renderSchema(
      {
        id: 'submit-modified',
        fields: [{ id: 'name', type: 'text' }],
        defaultValues: { name: 'Original' },
      },
      { onSubmit, extraChildren: <SubmitButton /> }
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Modified' } });
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Modified' }));
    });
  });

  it('submits repeatable fields as structured arrays', async () => {
    const onSubmit = vi.fn();

    renderSchema(
      {
        id: 'submit-repeatable',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [
                {
                  fields: [
                    { id: 'name', type: 'text' },
                    { id: 'qty', type: 'number' },
                  ],
                },
              ],
              defaultValue: { name: '', qty: 0 },
            },
          },
        ],
        defaultValues: {
          items: [
            { name: 'Widget', qty: 3 },
            { name: 'Gadget', qty: 7 },
          ],
        },
      },
      { onSubmit, extraChildren: <SubmitButton /> }
    );

    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const data = onSubmit.mock.calls[0][0];
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({ name: 'Widget', qty: 3 });
      expect(data.items[1]).toEqual({ name: 'Gadget', qty: 7 });
    });
  });
});

// =================================================================
// FULL INTEGRATION — REAL-WORLD SIGNUP FORM
// =================================================================

describe('fromSchema e2e — full integration', () => {
  it('renders, validates, applies conditions, triggers effects, and submits a complete signup form', async () => {
    const loadCities = vi.fn((_value, context, params) => {
      const cities = {
        france: [
          { value: 'paris', label: 'Paris' },
          { value: 'lyon', label: 'Lyon' },
        ],
        spain: [{ value: 'madrid', label: 'Madrid' }],
      };
      context.setValue(params.target, '');
      context.setProps(params.target, { options: cities[_value] ?? [] });
    });

    const registry: SchemaRegistry = { effects: { loadCities } };

    const onSubmit = vi.fn();

    const schema: FormSchema = {
      id: 'signup',
      defaultValues: { country: '' },
      rows: [
        {
          kind: 'fields',
          fields: [
            {
              id: 'firstName',
              type: 'text',
              props: { label: 'First Name' },
              validation: { rules: 'required' },
            },
            {
              id: 'lastName',
              type: 'text',
              props: { label: 'Last Name' },
              validation: { rules: 'required' },
            },
          ],
        },
        {
          kind: 'fields',
          fields: [
            {
              id: 'email',
              type: 'text',
              props: { label: 'Email' },
              validation: { rules: ['required', 'email'] },
            },
          ],
        },
        {
          kind: 'fields',
          fields: [
            {
              id: 'country',
              type: 'select',
              props: {
                label: 'Country',
                options: [
                  { value: '', label: 'Select...' },
                  { value: 'france', label: 'France' },
                  { value: 'spain', label: 'Spain' },
                ],
              },
            },
            {
              id: 'city',
              type: 'select',
              props: { label: 'City', options: [] },
              conditions: {
                visible: { field: 'country', operator: 'notEquals', value: '' },
              },
              effects: [
                {
                  trigger: 'change',
                  watch: 'country',
                  handler: 'loadCities',
                  params: { target: 'city' },
                },
              ],
            },
          ],
        },
        {
          kind: 'repeatable',
          repeatable: {
            id: 'addresses',
            rows: [
              {
                fields: [
                  {
                    id: 'street',
                    type: 'text',
                    props: { label: 'Street' },
                    validation: { rules: 'required' },
                  },
                ],
              },
              {
                fields: [
                  {
                    id: 'zip',
                    type: 'text',
                    props: { label: 'ZIP' },
                    validation: { rules: { type: 'pattern', params: { pattern: '^\\d{5}$' } } },
                  },
                  {
                    id: 'addrCity',
                    type: 'text',
                    props: { label: 'City' },
                    validation: { rules: 'required' },
                  },
                ],
              },
            ],
            min: 1,
            max: 3,
            defaultValue: { street: '', zip: '', addrCity: '' },
          },
        },
      ],
    };

    renderSchema(schema, {
      registry,
      onSubmit,
      extraChildren: (
        <>
          <SubmitButton />
          <ValidationTrigger />
          <FieldErrorDisplay id="firstName" />
          <FieldErrorDisplay id="email" />
          <RepeatableControls repeatableId="addresses" />
        </>
      ),
    });

    // --- Step 1: Form renders correctly ---
    expect(screen.getByTestId('input-firstName')).toBeInTheDocument();
    expect(screen.getByTestId('input-lastName')).toBeInTheDocument();
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
    expect(screen.getByTestId('input-country')).toBeInTheDocument();
    // City hidden (country is '' and condition is notEquals '')
    expect(screen.queryByTestId('field-city')).not.toBeInTheDocument();

    // --- Step 2: Validation fails on empty required fields ---
    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
    });

    // --- Step 3: Fill required fields ---
    fireEvent.change(screen.getByTestId('input-firstName'), { target: { value: 'Karl' } });
    fireEvent.change(screen.getByTestId('input-lastName'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'karl@example.com' } });

    // --- Step 4: Select country → triggers effect → city appears ---
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'france' } });

    await waitFor(() => {
      expect(screen.getByTestId('field-city')).toBeInTheDocument();
      const cityOptions = screen.getByTestId('input-city').querySelectorAll('option');
      expect(cityOptions).toHaveLength(2);
      expect(cityOptions[0]).toHaveTextContent('Paris');
    });

    expect(loadCities).toHaveBeenCalledWith('france', expect.any(Object), { target: 'city' });

    // Select a city
    fireEvent.change(screen.getByTestId('input-city'), { target: { value: 'paris' } });

    // --- Step 5: Fill repeatable address ---
    fireEvent.change(screen.getByTestId('input-addresses[k0].street'), {
      target: { value: '123 Rue de Rivoli' },
    });
    fireEvent.change(screen.getByTestId('input-addresses[k0].zip'), {
      target: { value: '75001' },
    });
    fireEvent.change(screen.getByTestId('input-addresses[k0].addrCity'), {
      target: { value: 'Paris' },
    });

    // --- Step 6: Verify min/max on repeatable ---
    expect(screen.getByTestId('repeatable-can-remove-addresses')).toHaveTextContent('false');

    // --- Step 7: Validate → should pass now ---
    fireEvent.click(screen.getByTestId('validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });

    // --- Step 8: Submit ---
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const data = onSubmit.mock.calls[0][0];
      expect(data.firstName).toBe('Karl');
      expect(data.lastName).toBe('Doe');
      expect(data.email).toBe('karl@example.com');
      expect(data.country).toBe('france');
      expect(data.city).toBe('paris');
      expect(data.addresses).toHaveLength(1);
      expect(data.addresses[0].street).toBe('123 Rue de Rivoli');
      expect(data.addresses[0].zip).toBe('75001');
      expect(data.addresses[0].addrCity).toBe('Paris');
    });
  });
});
