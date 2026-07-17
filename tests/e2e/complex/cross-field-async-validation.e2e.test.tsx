import { combine, custom, minLength, required, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { FormBody, FormProvider, useForm } from '@rilaykit/forms/react';
import { useFormStoreApi, useFormValid } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldErrorDisplay,
  SetValueButton,
  SubmitButton,
  ValidationTrigger,
} from '../_setup/test-helpers';
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
 * A Standard Schema async validator whose resolution is driven MANUALLY by the
 * test. Every `validate(value)` call parks a `{ value, resolve }` entry so a
 * test can resolve calls out of order and prove the stale verdict loses.
 */
type PendingCall = {
  value: unknown;
  resolve: (issues?: { message: string }[]) => void;
};
function makeControllableAsync() {
  const calls: PendingCall[] = [];
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: (value: unknown) =>
        new Promise<{ issues?: { message: string }[]; value?: unknown }>((res) => {
          calls.push({
            value,
            resolve: (issues) => res(issues ? { issues } : { value }),
          });
        }),
    },
  };
  return { schema, calls };
}

/**
 * A Standard Schema async validator that auto-resolves after a real delay.
 * `taken` values are rejected; everything else passes.
 */
function makeDelayedUniqueness(takenValues: string[], delayMs = 20) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: async (value: unknown) => {
        await new Promise((r) => setTimeout(r, delayMs));
        return takenValues.includes(String(value))
          ? { issues: [{ message: 'This value is already taken' }] }
          : { value };
      },
    },
  };
}

/** Reactive isValid + a captured store ref for point-in-time store assertions. */
let storeRef: ReturnType<typeof useFormStoreApi> | null = null;
function Probe() {
  const store = useFormStoreApi();
  const ref = useRef(store);
  ref.current = store;
  storeRef = store;
  const isValid = useFormValid();
  return <output data-testid="probe-is-valid">{String(isValid)}</output>;
}

function SubmitResult({ onResult }: { onResult: (ok: boolean) => void }) {
  const { submit } = useForm();
  return (
    <button
      type="button"
      data-testid="submit-capture"
      onClick={async () => {
        const ok = await submit();
        onResult(ok);
      }}
    >
      SubmitCapture
    </button>
  );
}

// ============================================================================
// PASSWORD + CONFIRM-PASSWORD MATCH (form-level)
// ============================================================================

describe('Cross-field: password / confirm-password match', () => {
  function buildPasswordForm() {
    return form
      .create(rilConfig, 'pw-form')
      .add({
        id: 'password',
        type: 'text',
        props: { label: 'Password' },
        validation: { validate: combine(required(), minLength(8)) },
      })
      .add({
        id: 'confirmPassword',
        type: 'text',
        props: { label: 'Confirm' },
        validation: { validate: required() },
      })
      .setValidation({
        validate: custom<Record<string, unknown>>(
          (data) => data.password === data.confirmPassword,
          'Passwords must match'
        ),
      })
      .build();
  }

  it('blocks submit when passwords mismatch and surfaces a form-level error', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildPasswordForm()} onSubmit={onSubmit}>
        <FormBody />
        <ValidationTrigger />
        <SubmitButton />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), {
      target: { value: 'password999' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // The form-level verdict surfaces through validateForm()'s returned errors.
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      expect(screen.getByTestId('validation-errors')).toHaveTextContent('Passwords must match');
    });
  });

  it('unblocks submit once the passwords are made to match', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildPasswordForm()} onSubmit={onSubmit}>
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), {
      target: { value: 'password123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'password123', confirmPassword: 'password123' })
      );
    });
  });

  it('gates on the FIELD rule (minLength) before the form-level rule matters', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildPasswordForm()} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="password" />
        <SubmitButton />
      </FormProvider>
    );

    // Matching but too-short passwords: field rule must block even though the
    // form-level match rule is satisfied.
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'short' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('errors-password')).toBeInTheDocument();
      expect(screen.getByTestId('error-password-0')).toHaveTextContent(
        'Must be at least 8 characters long'
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ============================================================================
// DATE ORDERING (start < end) — form-level
// ============================================================================

describe('Cross-field: date ordering (start < end)', () => {
  function buildDateForm() {
    return form
      .create(rilConfig, 'date-form')
      .add({ id: 'startDate', type: 'text', props: { label: 'Start' } })
      .add({ id: 'endDate', type: 'text', props: { label: 'End' } })
      .setValidation({
        validate: custom<Record<string, unknown>>((data) => {
          const start = data.startDate;
          const end = data.endDate;
          if (typeof start === 'string' && typeof end === 'string' && start && end) {
            return start < end;
          }
          return true;
        }, 'End date must be after start date'),
      })
      .build();
  }

  it('blocks submit when start is after end and unblocks when reordered', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildDateForm()} onSubmit={onSubmit}>
        <FormBody />
        <ValidationTrigger />
        <SubmitButton />
      </FormProvider>
    );

    // ISO strings compare lexicographically like real dates.
    fireEvent.change(screen.getByTestId('input-startDate'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByTestId('input-endDate'), { target: { value: '2026-01-01' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('validation-errors')).toHaveTextContent(
        'End date must be after start date'
      );
    });

    // Reorder: end now after start.
    fireEvent.change(screen.getByTestId('input-endDate'), { target: { value: '2026-12-31' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: '2026-12-01', endDate: '2026-12-31' })
      );
    });
  });
});

// ============================================================================
// AT LEAST ONE OF X / Y / Z — form-level
// ============================================================================

describe('Cross-field: at least one of X/Y/Z filled', () => {
  function buildAtLeastOneForm() {
    return form
      .create(rilConfig, 'atleastone-form')
      .add({ id: 'email', type: 'text', props: { label: 'Email' } })
      .add({ id: 'phone', type: 'text', props: { label: 'Phone' } })
      .add({ id: 'fax', type: 'text', props: { label: 'Fax' } })
      .setValidation({
        validate: custom<Record<string, unknown>>(
          (data) => Boolean(data.email || data.phone || data.fax),
          'At least one contact method is required'
        ),
      })
      .build();
  }

  it('blocks when all three are empty and unblocks when any single one is filled', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildAtLeastOneForm()} onSubmit={onSubmit}>
        <FormBody />
        <ValidationTrigger />
        <SubmitButton />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('validation-errors')).toHaveTextContent(
        'At least one contact method is required'
      );
    });

    // Fill only the fax; the rule should now pass.
    fireEvent.change(screen.getByTestId('input-fax'), { target: { value: '555-0000' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fax: '555-0000' }));
    });
  });
});

// ============================================================================
// ASYNC VALIDATOR RACING USER INPUT (stale verdict must lose)
// ============================================================================

describe('Async field validator racing user input', () => {
  it('drops a stale verdict resolving AFTER a newer one; latest value wins', async () => {
    const { schema, calls } = makeControllableAsync();
    const formConfig = form
      .create(rilConfig, 'async-race-form')
      .add({
        id: 'username',
        type: 'text',
        props: { label: 'Username' },
        validation: { validate: schema },
      })
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
        <FieldErrorDisplay id="username" />
        <Probe />
      </FormProvider>
    );

    const input = screen.getByTestId('input-username');

    // Two keystrokes: 'stale' then 'fresh'. Each fires an async run.
    fireEvent.change(input, { target: { value: 'stale' } });
    fireEvent.change(input, { target: { value: 'fresh' } });

    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0].value).toBe('stale');
    expect(calls[1].value).toBe('fresh');

    // Resolve the NEWER run first as VALID, then the OLDER run as INVALID.
    // The older ('stale') verdict must not overwrite the newer valid one.
    await act(async () => {
      calls[1].resolve(); // fresh -> valid
      await Promise.resolve();
    });
    await act(async () => {
      calls[0].resolve([{ message: 'This value is already taken' }]); // stale -> invalid, late
      await Promise.resolve();
    });

    // No error shown, form valid, and the store carries no ghost error.
    await waitFor(() => {
      expect(screen.queryByTestId('errors-username')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
    expect(storeRef?.getState().errors.username ?? []).toEqual([]);
    expect(storeRef?.getState().validationStates.username).toBe('valid');
  });

  it('keeps the newer INVALID verdict even when a stale VALID resolves afterwards', async () => {
    const { schema, calls } = makeControllableAsync();
    const formConfig = form
      .create(rilConfig, 'async-race-form-2')
      .add({
        id: 'username',
        type: 'text',
        props: { label: 'Username' },
        validation: { validate: schema },
      })
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
        <FieldErrorDisplay id="username" />
        <Probe />
      </FormProvider>
    );

    const input = screen.getByTestId('input-username');
    fireEvent.change(input, { target: { value: 'ok' } });
    fireEvent.change(input, { target: { value: 'taken' } });
    await waitFor(() => expect(calls.length).toBe(2));

    // Newer ('taken') resolves invalid; older ('ok') resolves valid afterwards.
    await act(async () => {
      calls[1].resolve([{ message: 'This value is already taken' }]);
      await Promise.resolve();
    });
    await act(async () => {
      calls[0].resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('errors-username')).toBeInTheDocument();
      expect(screen.getByTestId('error-username-0')).toHaveTextContent(
        'This value is already taken'
      );
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');
    });
  });

  it('reaches a consistent, non-validating final state after rapid typing', async () => {
    const formConfig = form
      .create(rilConfig, 'rapid-form')
      .add({
        id: 'handle',
        type: 'text',
        props: { label: 'Handle' },
        validation: { validate: makeDelayedUniqueness(['taken'], 10) },
      })
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
        <FieldErrorDisplay id="handle" />
        <Probe />
      </FormProvider>
    );

    const input = screen.getByTestId('input-handle');

    // Fire many keystrokes in quick succession; the final value is valid.
    await act(async () => {
      for (const v of ['a', 'ab', 'abc', 'taken', 'available']) {
        fireEvent.change(input, { target: { value: v } });
      }
      await new Promise((r) => setTimeout(r, 60));
    });

    await waitFor(() => {
      // No stuck 'validating' state, no stale error wedging the form.
      expect(storeRef?.getState().validationStates.handle).toBe('valid');
      expect(screen.queryByTestId('errors-handle')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
    expect(storeRef?.getState().values.handle).toBe('available');
  });
});

// ============================================================================
// ASYNC VALIDATOR IN-FLIGHT AT SUBMIT TIME
// ============================================================================

describe('Async validator gating at submit time', () => {
  it('waits for the async verdict and blocks submit of an invalid latest value', async () => {
    const onSubmit = vi.fn();
    const results: boolean[] = [];
    const formConfig = form
      .create(rilConfig, 'async-submit-invalid')
      .add({
        id: 'code',
        type: 'text',
        props: { label: 'Code' },
        validation: { validate: makeDelayedUniqueness(['taken'], 25) },
      })
      .build();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="code" />
        <SubmitResult onResult={(ok) => results.push(ok)} />
      </FormProvider>
    );

    // Type an invalid value and submit while validation may still be running.
    fireEvent.change(screen.getByTestId('input-code'), { target: { value: 'taken' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-capture'));
      await new Promise((r) => setTimeout(r, 60));
    });

    // Submit resolved to false (did not hang), onSubmit never fired, error shown.
    await waitFor(() => {
      expect(results).toContain(false);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByTestId('errors-code')).toBeInTheDocument();
    });
  });

  it('waits for the async verdict and submits a valid latest value', async () => {
    const onSubmit = vi.fn();
    const formConfig = form
      .create(rilConfig, 'async-submit-valid')
      .add({
        id: 'code',
        type: 'text',
        props: { label: 'Code' },
        validation: { validate: makeDelayedUniqueness(['taken'], 25) },
      })
      .build();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-code'), { target: { value: 'available' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
      await new Promise((r) => setTimeout(r, 60));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: 'available' }));
    });
  });
});

// ============================================================================
// CONDITIONAL-REQUIRED + FORMAT VALIDATION INTERPLAY
// ============================================================================

describe('Conditional-required combined with format validation', () => {
  function buildConditionalForm() {
    return form
      .create(rilConfig, 'cond-required-form')
      .add({ id: 'wantsInvoice', type: 'checkbox', props: { label: 'Wants invoice' } })
      .add({
        id: 'vat',
        type: 'text',
        props: { label: 'VAT' },
        // Format rule that ONLY applies when the field is filled: an empty value
        // passes (presence is governed solely by the conditional-required rule),
        // a short non-empty value fails. `minLength` itself rejects '' — wrong
        // model for an optional-but-formatted field — so we skip-empty explicitly.
        validation: {
          validate: custom<string>(
            (v) => !v || v.length >= 5,
            'Must be at least 5 characters long'
          ),
        },
        conditions: { required: when('wantsInvoice').equals(true) },
      })
      .build();
  }

  it('surfaces the required error when the controller is set and the field is empty', async () => {
    render(
      <FormProvider
        formConfig={buildConditionalForm()}
        defaultValues={{ wantsInvoice: false, vat: '' }}
      >
        <FormBody />
        <FieldErrorDisplay id="vat" />
        <SetValueButton id="wantsInvoice" value={true} />
        <ValidationTrigger />
        <Probe />
      </FormProvider>
    );

    // Not required yet.
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });

    // Turn on the controller -> vat becomes required while empty.
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-wantsInvoice'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('errors-vat')).toBeInTheDocument();
      expect(screen.getByTestId('error-vat-0')).toHaveTextContent('This field is required');
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
    });
  });

  it('surfaces the FORMAT error (not required) when the required field is filled but invalid', async () => {
    render(
      <FormProvider
        formConfig={buildConditionalForm()}
        defaultValues={{ wantsInvoice: true, vat: '' }}
      >
        <FormBody />
        <FieldErrorDisplay id="vat" />
        <ValidationTrigger />
      </FormProvider>
    );

    // Filled but too short: format rule fires, required does not (value present).
    fireEvent.change(screen.getByTestId('input-vat'), { target: { value: 'ab' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('errors-vat')).toBeInTheDocument();
    });
    const errorsBox = screen.getByTestId('errors-vat');
    expect(errorsBox).toHaveTextContent('Must be at least 5 characters long');
    expect(errorsBox).not.toHaveTextContent('This field is required');
  });

  it('drops the required error when the controller is cleared', async () => {
    render(
      <FormProvider
        formConfig={buildConditionalForm()}
        defaultValues={{ wantsInvoice: true, vat: '' }}
      >
        <FormBody />
        <FieldErrorDisplay id="vat" />
        <SetValueButton id="wantsInvoice" value={false} />
        <ValidationTrigger />
        <Probe />
      </FormProvider>
    );

    // Required + empty -> error.
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('errors-vat')).toBeInTheDocument();
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');
    });

    // Clear the controller -> no longer required -> error must drop and form usable.
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-wantsInvoice'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('errors-vat')).not.toBeInTheDocument();
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
  });
});

// ============================================================================
// ERROR ON A FIELD THAT IS THEN HIDDEN (must not wedge the form)
// ============================================================================

describe('Validation error on a field that becomes hidden', () => {
  it('drops a late async error that resolves after the field was hidden', async () => {
    const { schema, calls } = makeControllableAsync();
    const formConfig = form
      .create(rilConfig, 'hide-race-form')
      .add({ id: 'show', type: 'checkbox', props: { label: 'Show detail' } })
      .add({
        id: 'detail',
        type: 'text',
        props: { label: 'Detail' },
        validation: { validate: schema },
        conditions: { visible: when('show').equals(true) },
      })
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ show: true, detail: '' }}>
        <FormBody />
        <FieldErrorDisplay id="detail" />
        <SetValueButton id="show" value={false} />
        <Probe />
      </FormProvider>
    );

    // Kick off an async validation on the visible field.
    fireEvent.change(screen.getByTestId('input-detail'), { target: { value: 'bad' } });
    await waitFor(() => expect(calls.length).toBe(1));

    // Hide the field before the verdict lands.
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-show'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('input-detail')).not.toBeInTheDocument();
    });

    // The late invalid verdict arrives for a now-hidden field: it must be dropped.
    await act(async () => {
      calls[0].resolve([{ message: 'Invalid detail' }]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
    expect(storeRef?.getState().errors.detail ?? []).toEqual([]);
  });

  it('does not wedge the form when a committed error becomes hidden', async () => {
    const formConfig = form
      .create(rilConfig, 'hide-commit-form')
      .add({ id: 'show', type: 'checkbox', props: { label: 'Show' } })
      .add({
        id: 'secret',
        type: 'text',
        props: { label: 'Secret' },
        validation: { validate: combine(required(), minLength(6)) },
        conditions: { visible: when('show').equals(true) },
      })
      .build();

    const onSubmit = vi.fn();
    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ show: true, secret: 'ab' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <FieldErrorDisplay id="secret" />
        <SetValueButton id="show" value={false} />
        <ValidationTrigger />
        <SubmitButton />
        <Probe />
      </FormProvider>
    );

    // Commit an error on the visible field.
    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('errors-secret')).toBeInTheDocument();
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');
    });

    // Hide the field: its committed error must no longer wedge the form.
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-show'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('input-secret')).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('validate-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });

    // And submit succeeds (hidden field dropped from payload).
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('secret');
  });
});

// ============================================================================
// EVERYTHING AT ONCE: full registration flow
// ============================================================================

describe('Full registration flow: field + cross-field + async', () => {
  it('gates on every rule, then submits once all are satisfied', async () => {
    const onSubmit = vi.fn();
    const formConfig = form
      .create(rilConfig, 'registration-form')
      .add({
        id: 'password',
        type: 'text',
        props: { label: 'Password' },
        validation: { validate: combine(required(), minLength(8)) },
      })
      .add({
        id: 'confirmPassword',
        type: 'text',
        props: { label: 'Confirm' },
        validation: { validate: required() },
      })
      .add({
        id: 'username',
        type: 'text',
        props: { label: 'Username' },
        validation: { validate: makeDelayedUniqueness(['admin'], 15) },
      })
      .setValidation({
        validate: custom<Record<string, unknown>>(
          (data) => data.password === data.confirmPassword,
          'Passwords must match'
        ),
      })
      .build();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="password" />
        <FieldErrorDisplay id="username" />
        <SubmitButton />
      </FormProvider>
    );

    // All wrong: short password, mismatch, taken username.
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'nope' } });
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'admin' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Fix everything.
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByTestId('input-confirmPassword'), {
      target: { value: 'longenough1' },
    });
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'freshuser' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
      await new Promise((r) => setTimeout(r, 40));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'longenough1',
          confirmPassword: 'longenough1',
          username: 'freshuser',
        })
      );
    });
  });
});
