/**
 * =============================================================================
 * FLAGSHIP E2E — one builder-authored form exercising every feature at once:
 * variadic multi-column rows, a select, a conditionally-visible field gated by
 * `when(...).equals(...)`, an async field validator, and a repeatable group —
 * with both submit payloads pinned exactly.
 * =============================================================================
 */
import { async as asyncValidator, required, when } from '@rilaykit/core';
import { Form, useRepeatableField } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ril } from 'rilaykit';
import { describe, expect, it, vi } from 'vitest';
import { MockSelectInput, MockTextInput } from '../_setup/test-helpers';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } })
    .component('select', {
      name: 'Select',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    });
}

function buildAllFeaturesForm() {
  const catalog = createCatalog();
  return catalog
    .form('all-features')
    .add(
      { id: 'firstName', type: 'text', props: { label: 'First name' } },
      { id: 'lastName', type: 'text', props: { label: 'Last name' } },
      { id: 'middleName', type: 'text', props: { label: 'Middle name' } }
    )
    .add({
      id: 'accountType',
      type: 'select',
      props: {
        label: 'Account type',
        options: [
          { value: 'basic', label: 'Basic' },
          { value: 'business', label: 'Business' },
        ],
      },
    })
    .add({
      id: 'vatNumber',
      type: 'text',
      props: { label: 'VAT number' },
      conditions: { visible: when('accountType').equals('business') },
      validation: {
        validate: asyncValidator<string>(async (v) => {
          await delay(40);
          return /^[A-Z]{2}\d+/.test(String(v ?? ''));
        }, 'Invalid VAT number'),
      },
    })
    .addRepeatable('contacts', (r) =>
      r
        .add({
          id: 'email',
          type: 'text',
          props: { label: 'Email' },
          validation: { validate: required('Email is required') },
        })
        .defaultValue({ email: '' })
    );
}

describe('Flagship — all-features builder form', () => {
  it('lays out a variadic multi-column row (maxColumns === 3) with all three inputs in one row container', () => {
    const built = buildAllFeaturesForm().build();

    // Structural contract: the first row is a 3-column field row.
    const firstRow = built.rows[0];
    expect(firstRow.kind).toBe('fields');
    if (firstRow.kind !== 'fields') throw new Error('expected a fields row');
    expect(firstRow.maxColumns).toBe(3);
    expect(firstRow.fields.map((f) => f.id)).toEqual(['firstName', 'lastName', 'middleName']);

    // Rendered: the three inputs share the SAME row container.
    const { container } = render(
      <Form of={built} defaults={{ accountType: 'basic' }}>
        <Form.Body />
      </Form>
    );

    const rowEl = container.querySelector(`[data-form-row="${firstRow.id}"]`);
    expect(rowEl).not.toBeNull();
    const row = within(rowEl as HTMLElement);
    expect(row.getByTestId('input-firstName')).toBeInTheDocument();
    expect(row.getByTestId('input-lastName')).toBeInTheDocument();
    expect(row.getByTestId('input-middleName')).toBeInTheDocument();
  });

  it('basic account: vatNumber stays hidden and is excluded from the submit payload', async () => {
    const onSubmit = vi.fn();

    render(
      <Form of={buildAllFeaturesForm()} defaults={{ accountType: 'basic' }} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>
          {({ submit }) => (
            <button type="button" data-testid="submit" onClick={submit}>
              Submit
            </button>
          )}
        </Form.Submit>
      </Form>
    );

    fireEvent.change(screen.getByTestId('input-firstName'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByTestId('input-lastName'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByTestId('input-middleName'), { target: { value: 'Byron' } });

    // vatNumber is condition-hidden (accountType === 'basic').
    expect(screen.queryByTestId('input-vatNumber')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    // Exact payload: no vatNumber; contacts is an empty structured array.
    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      middleName: 'Byron',
      accountType: 'basic',
      contacts: [],
    });
  });

  it('business account: vatNumber becomes visible, async-validates, and the full payload includes it plus the contacts array', async () => {
    const onSubmit = vi.fn();

    render(
      <Form of={buildAllFeaturesForm()} defaults={{ accountType: 'basic' }} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>
          {({ submit, submitting }) => (
            <button type="button" data-testid="submit" onClick={submit} disabled={submitting}>
              Submit
            </button>
          )}
        </Form.Submit>
        <RepeatableContactControls />
      </Form>
    );

    fireEvent.change(screen.getByTestId('input-firstName'), { target: { value: 'Grace' } });
    fireEvent.change(screen.getByTestId('input-lastName'), { target: { value: 'Hopper' } });
    fireEvent.change(screen.getByTestId('input-middleName'), { target: { value: 'Brewster' } });

    // Switch to business → vatNumber appears.
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'business' } });
    await waitFor(() => {
      expect(screen.getByTestId('input-vatNumber')).toBeInTheDocument();
    });

    // Add a contact and fill its email.
    fireEvent.click(screen.getByTestId('add-contact'));
    await waitFor(() => {
      expect(screen.getByTestId('input-contacts[k0].email')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-contacts[k0].email'), {
      target: { value: 'grace@navy.mil' },
    });

    // Invalid VAT → async validator rejects → submit blocked.
    fireEvent.change(screen.getByTestId('input-vatNumber'), { target: { value: 'bad' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('submit')).not.toBeDisabled();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Valid VAT → async validator passes → submit succeeds with exact payload.
    fireEvent.change(screen.getByTestId('input-vatNumber'), { target: { value: 'FR123' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Grace',
      lastName: 'Hopper',
      middleName: 'Brewster',
      accountType: 'business',
      vatNumber: 'FR123',
      contacts: [{ email: 'grace@navy.mil' }],
    });
  });
});

// Repeatable controls bound to the form's 'contacts' group.
function RepeatableContactControls() {
  const { append, canAdd } = useRepeatableField('contacts');
  return (
    <button type="button" data-testid="add-contact" onClick={() => append()} disabled={!canAdd}>
      Add contact
    </button>
  );
}
