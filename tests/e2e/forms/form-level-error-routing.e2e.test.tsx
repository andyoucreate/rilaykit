import { minLength } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { FormBody, FormProvider } from '@rilaykit/forms/react';
import { useFormErrors } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldErrorDisplay, FormStateDisplay, SubmitButton } from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// SETUP
// ============================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

beforeEach(() => {
  vi.clearAllMocks();
  rilConfig = createTestRilConfig();
});

/**
 * Renders the reserved `__form__` bucket (whole-form / unmatched cross-field
 * messages) via the new `useFormErrors()` hook — the form-level banner.
 */
function FormErrorsBanner() {
  const errors = useFormErrors();
  if (errors.length === 0) return null;
  return (
    <div data-testid="form-errors">
      {errors.map((err, index) => (
        <span key={err.message} data-testid={`form-error-${index}`}>
          {err.message}
        </span>
      ))}
    </div>
  );
}

/**
 * A cross-field password schema that emits BOTH a field-targeted issue
 * (`path: ['confirmPassword']`) and a whole-form issue (no path) when the two
 * passwords disagree. Lets us assert path-routing (→ field) and the reserved
 * bucket (→ `__form__`) in one run.
 */
const passwordSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => {
      const data = value as Record<string, unknown>;
      if (data.password !== data.confirmPassword) {
        return {
          issues: [
            { message: 'Passwords do not match', path: ['confirmPassword'] },
            { message: 'Please fix the errors below' },
          ],
        };
      }
      return { value };
    },
  },
};

function buildPasswordForm() {
  return form
    .create(rilConfig, 'password-form')
    .add({ id: 'password', type: 'text', props: { label: 'Password' } })
    .add({ id: 'confirmPassword', type: 'text', props: { label: 'Confirm Password' } })
    .setValidation({ validate: passwordSchema })
    .build();
}

/**
 * Same cross-field schema, but `confirmPassword` ALSO carries its OWN field-level
 * rule (min length 8). Lets us prove a routed cross-field error and the field's
 * own error COEXIST on one field, and that clearing the cross-field one leaves
 * the field-level one intact.
 */
function buildPasswordFormWithFieldRule() {
  return form
    .create(rilConfig, 'password-form-field-rule')
    .add({ id: 'password', type: 'text', props: { label: 'Password' } })
    .add({
      id: 'confirmPassword',
      type: 'text',
      props: { label: 'Confirm Password' },
      validation: { validate: minLength(8) },
    })
    .setValidation({ validate: passwordSchema })
    .build();
}

/** A form-level validator that THROWS — the error path routed to `__form__`. */
const throwingSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: () => {
      throw new Error('Validator exploded');
    },
  },
};

function buildThrowingForm() {
  return form
    .create(rilConfig, 'throwing-form')
    .add({ id: 'field', type: 'text', props: { label: 'Field' } })
    .setValidation({ validate: throwingSchema })
    .build();
}

// ============================================================================
// TESTS
// ============================================================================

describe('Form-level error routing (path-keyed error map)', () => {
  // --------------------------------------------------------------------------
  // Increment 1 — submit path writes routed form-level errors to the store
  // --------------------------------------------------------------------------
  it('routes a submit-time password mismatch onto confirmPassword and __form__, flipping isValid', async () => {
    const formConfig = buildPasswordForm();
    const onSubmit = vi.fn();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="confirmPassword" />
        <FormErrorsBanner />
        <FormStateDisplay />
        <SubmitButton />
      </FormProvider>
    );

    // Arrange: two disagreeing passwords.
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'xyz789' } });

    // Act: real submit.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    // Assert: the path-targeted issue landed ON confirmPassword.
    await waitFor(() => {
      expect(screen.getByTestId('errors-confirmPassword')).toBeInTheDocument();
      expect(screen.getByTestId('error-confirmPassword-0')).toHaveTextContent(
        'Passwords do not match'
      );
    });

    // Assert: the whole-form (no-path) issue landed in the __form__ bucket.
    expect(screen.getByTestId('form-error-0')).toHaveTextContent('Please fix the errors below');

    // Assert: the stored isValid the submit blocks on is now false, and submit
    // did not fire.
    expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Increment 2 — the live path clears a routed form-level error as the user
  // fixes it, WITHOUT a resubmit.
  // --------------------------------------------------------------------------
  it('clears the routed mismatch live as the user types the matching value (no resubmit)', async () => {
    const formConfig = buildPasswordForm();
    const onSubmit = vi.fn();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="confirmPassword" />
        <FormErrorsBanner />
        <FormStateDisplay />
        <SubmitButton />
      </FormProvider>
    );

    // Arrange: paint the mismatch via a real submit.
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'xyz789' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-confirmPassword-0')).toHaveTextContent(
        'Passwords do not match'
      );
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('Please fix the errors below');
      expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    });

    // Act: type the matching value into confirmPassword — no resubmit.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-confirmPassword'), {
        target: { value: 'abc123' },
      });
    });

    // Assert: the field-routed error AND the __form__ banner clear live, and
    // isValid flips back to true — proving the form-level schema re-ran on the
    // same change cadence as fields, not just on resubmit.
    await waitFor(() => {
      expect(screen.queryByTestId('errors-confirmPassword')).not.toBeInTheDocument();
      expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument();
      expect(screen.getByTestId('is-valid')).toHaveTextContent('true');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Error path — a form-level validator that THROWS lands in __form__.
  // --------------------------------------------------------------------------
  it('routes a thrown form-level validator error into __form__ and blocks submit', async () => {
    const onSubmit = vi.fn();

    render(
      <FormProvider formConfig={buildThrowingForm()} onSubmit={onSubmit}>
        <FormBody />
        <FormErrorsBanner />
        <FormStateDisplay />
        <SubmitButton />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-field'), { target: { value: 'anything' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('Validator exploded');
      expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Coexistence — a field's OWN error and a routed cross-field error live on the
  // same field; clearing the cross-field one leaves the field-level one intact.
  // --------------------------------------------------------------------------
  it("keeps confirmPassword's own field-level error when the routed cross-field error clears", async () => {
    const onSubmit = vi.fn();

    render(
      <FormProvider formConfig={buildPasswordFormWithFieldRule()} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="confirmPassword" />
        <FormErrorsBanner />
        <FormStateDisplay />
        <SubmitButton />
      </FormProvider>
    );

    // password is short ('ab', no field rule); confirmPassword is BOTH too short
    // (< 8) AND mismatched. Submit touches the errored confirmPassword so its
    // later change re-validates live.
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'xy' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    // Both errors show on confirmPassword: field-level first (index 0), routed
    // cross-field second (index 1 = the mismatch message).
    await waitFor(() => {
      expect(screen.getByTestId('error-confirmPassword-1')).toHaveTextContent(
        'Passwords do not match'
      );
    });
    const fieldLevelMessage = screen.getByTestId('error-confirmPassword-0').textContent;
    expect(fieldLevelMessage).not.toBe('Passwords do not match');

    // Resolve ONLY the mismatch: type 'ab' into confirmPassword so it MATCHES
    // password ('ab'), still failing minLength(8). The routed cross-field error
    // is stripped while confirmPassword's own field-level error survives.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'ab' } });
    });
    await waitFor(() => {
      // The routed cross-field error (index 1) is gone…
      expect(screen.queryByTestId('error-confirmPassword-1')).not.toBeInTheDocument();
      // …but the field's OWN error survives at index 0.
      expect(screen.getByTestId('error-confirmPassword-0')).toHaveTextContent(fieldLevelMessage!);
    });
    // The whole-form banner also cleared with the mismatch.
    expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument();
  });
});
