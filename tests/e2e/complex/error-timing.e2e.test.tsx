import type { ComponentRenderContext, FormValidationMode } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { combine, custom, minLength, required, ril, when } from 'rilaykit';
import { form } from 'rilaykit';
import { FormBody, FormProvider, useForm, useFormStoreApi, useFormValid } from 'rilaykit/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// =====================================================================
// COMPLEX E2E: error TIMING and VISIBILITY.
//
// Every assertion here is about what the USER SEES: each field is rendered
// by `ErrorAwareInput`, a renderer that paints `field.error` (the
// FieldBinding array, sourced from `fieldState.errors`), `field.touched`
// and `field.isValidating` into the DOM. Store reads only ever corroborate
// a DOM assertion — they never stand in for one.
//
// The contract this file pins, expressed against the RHF-style two-phase timing
// model (form-level `mode` + `reValidateMode`, resolved by shouldValidateOnEvent):
//   * FormField.handleBlur
//       - always marks touched
//       - validates per shouldValidateOnEvent('blur', …): under the default
//         `mode: 'onTouched'`, blur is what FIRST validates a field
//   * FormField.handleChange
//       - validates per shouldValidateOnEvent('change', …): gated on the
//         `touched` flag under `onTouched`, immediate under `onChange` / `all`
//       - `debounceMs` defers ONLY the change path
//   * validateField (useFormValidationWithStore.ts:154)
//       - writes 'validating' before awaiting, then the verdict
//       - drops stale / hidden / nonexistent verdicts
//   * validateForm (useFormValidationWithStore.ts:337)
//       - validates every visible field, clears invisible ones
//   * submit (useFormSubmissionWithStore.ts:126)
//       - validates, blocks onSubmit when invalid, never marks touched
// =====================================================================

// ---------------------------------------------------------------------
// A renderer that SHOWS errors — the whole point of this file.
// ---------------------------------------------------------------------
function ErrorAwareInput({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
      <input
        id={id}
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      <span data-testid={`touched-${id}`}>{field?.touched ? 'touched' : 'pristine'}</span>
      <span data-testid={`validating-${id}`}>{field?.isValidating ? 'validating' : 'settled'}</span>
      <span data-testid={`error-count-${id}`}>{errors.length}</span>
      {errors.length > 0 ? (
        <ul data-testid={`ui-errors-${id}`}>
          {errors.map((err, i) => (
            <li key={`${err.code ?? ''}-${i}`} data-testid={`ui-error-${id}-${i}`}>
              {err.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErrorAwareCheckbox({ id, props, field }: ComponentRenderContext) {
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
      <input
        id={id}
        data-testid={`input-${id}`}
        type="checkbox"
        checked={!!field?.value}
        onChange={(e) => field?.onChange(e.target.checked)}
      />
    </div>
  );
}

/**
 * The OTHER conventional renderer: one that gates error display on `touched`,
 * the idiom `FieldBinding.touched` (catalog.ts:20) exists to support — "don't
 * yell at the user about a field they haven't reached yet".
 */
function TouchedGatedInput({ id, field }: ComponentRenderContext) {
  const errors = field?.touched ? (field?.error ?? []) : [];
  return (
    <div data-testid={`field-${id}`}>
      <input
        id={id}
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      <span data-testid={`error-count-${id}`}>{errors.length}</span>
      {errors.length > 0 ? (
        <ul data-testid={`ui-errors-${id}`}>
          {errors.map((err, i) => (
            <li key={`${err.code ?? ''}-${i}`} data-testid={`ui-error-${id}-${i}`}>
              {err.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function createErrorAwareRil() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: ErrorAwareInput, defaultProps: { label: '' } })
    .component('checkbox', { name: 'Check', renderer: ErrorAwareCheckbox, defaultProps: {} })
    .component('gated', { name: 'Gated', renderer: TouchedGatedInput, defaultProps: {} });
}

let rilConfig: ReturnType<typeof createErrorAwareRil>;
let storeRef: ReturnType<typeof useFormStoreApi> | null = null;

function Probe() {
  storeRef = useFormStoreApi();
  const isValid = useFormValid();
  return <output data-testid="probe-is-valid">{String(isValid)}</output>;
}

function SubmitCapture({ onResult }: { onResult?: (ok: boolean) => void }) {
  const { submit } = useForm();
  return (
    <button
      type="button"
      data-testid="submit-btn"
      onClick={async () => {
        const ok = await submit();
        onResult?.(ok);
      }}
    >
      Submit
    </button>
  );
}

function RepeatableAdder({ repeatableId }: { repeatableId: string }) {
  const store = useFormStoreApi();
  return (
    <button
      type="button"
      data-testid={`append-${repeatableId}`}
      onClick={() => store.getState()._appendRepeatableItem(repeatableId)}
    >
      Add
    </button>
  );
}

function RepeatableRemover({ repeatableId, itemKey }: { repeatableId: string; itemKey: string }) {
  const store = useFormStoreApi();
  return (
    <button
      type="button"
      data-testid={`remove-${repeatableId}-${itemKey}`}
      onClick={() => store.getState()._removeRepeatableItem(repeatableId, itemKey)}
    >
      Remove
    </button>
  );
}

function Toggle({ id, value }: { id: string; value: unknown }) {
  const store = useFormStoreApi();
  return (
    <button
      type="button"
      data-testid={`set-${id}`}
      onClick={() => store.getState()._setValue(id, value)}
    >
      set
    </button>
  );
}

/** Async Standard Schema resolved manually by the test. */
function makeControllableAsync() {
  const calls: { value: unknown; resolve: (issues?: { message: string }[]) => void }[] = [];
  return {
    calls,
    schema: {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) =>
          new Promise<{ issues?: { message: string }[]; value?: unknown }>((res) => {
            calls.push({ value, resolve: (issues) => res(issues ? { issues } : { value }) });
          }),
      },
    },
  };
}

const noErrors = (id: string) => expect(screen.queryByTestId(`ui-errors-${id}`)).toBeNull();
const errorTextsOf = (id: string) =>
  Array.from(screen.getByTestId(`ui-errors-${id}`).querySelectorAll('li')).map(
    (li) => li.textContent
  );

beforeEach(() => {
  vi.clearAllMocks();
  rilConfig = createErrorAwareRil();
  storeRef = null;
});

// =====================================================================
// 1. NOT TOO EARLY — mounting must not spray errors
// =====================================================================
describe('Error timing: nothing shows before the user does anything', () => {
  function buildPristineForm() {
    return (
      form
        .create(rilConfig, 'pristine')
        .add({
          id: 'email',
          type: 'text',
          props: { label: 'Email' },
          validation: { validate: required('Email is required') },
        })
        .add({
          id: 'name',
          type: 'text',
          props: { label: 'Name' },
          validation: { validate: combine(required(), minLength(3)) },
        })
        // Validate from the first keystroke — the sibling test types without ever
        // blurring and still expects a live verdict.
        .setValidation({ mode: 'onChange' })
        .build()
    );
  }

  it('shows NO error on a pristine required field at mount', async () => {
    render(
      <FormProvider formConfig={buildPristineForm()} defaultValues={{ email: '', name: '' }}>
        <FormBody />
        <Probe />
      </FormProvider>
    );

    // Even under mode: 'onChange', fields stay silent: nothing has changed yet.
    noErrors('email');
    noErrors('name');
    expect(screen.getByTestId('touched-email')).toHaveTextContent('pristine');
    expect(screen.getByTestId('validating-email')).toHaveTextContent('settled');

    // And it STAYS silent across a settle window — no effect sprays errors late.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    noErrors('email');
    noErrors('name');
    expect(storeRef?.getState().errors.email ?? []).toEqual([]);
  });

  it('leaves an untouched sibling silent when ANOTHER field is validated on change', async () => {
    render(
      <FormProvider formConfig={buildPristineForm()} defaultValues={{ email: '', name: '' }}>
        <FormBody />
      </FormProvider>
    );

    // Type into email, then clear it -> email errors, name must not.
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: '' } });

    await waitFor(() => expect(screen.getByTestId('ui-errors-email')).toBeInTheDocument());
    noErrors('name');
  });
});

// =====================================================================
// 2. mode: onTouched / onSubmit (blur timing)
// =====================================================================
describe('Error timing: blur', () => {
  function buildBlurForm(mode?: FormValidationMode) {
    const builder = form.create(rilConfig, `blur-${String(mode)}`).add({
      id: 'code',
      type: 'text',
      props: { label: 'Code' },
      validation: { validate: minLength(4, 'Too short') },
    });
    return (mode ? builder.setValidation({ mode }) : builder).build();
  }

  it('mode onTouched — no error while typing, error appears on blur', async () => {
    render(
      <FormProvider formConfig={buildBlurForm('onTouched')} defaultValues={{ code: '' }}>
        <FormBody />
      </FormProvider>
    );
    const input = screen.getByTestId('input-code');

    // Typing an invalid value: untouched under onTouched -> silence.
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    noErrors('code');
    expect(screen.getByTestId('touched-code')).toHaveTextContent('pristine');

    // Blur: NOW the error appears, and the field is marked touched.
    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => {
      expect(screen.getByTestId('ui-error-code-0')).toHaveTextContent('Too short');
      expect(screen.getByTestId('touched-code')).toHaveTextContent('touched');
    });
  });

  it('onTouched is the DEFAULT — blur validates without configuring any mode', async () => {
    render(
      <FormProvider formConfig={buildBlurForm(undefined)} defaultValues={{ code: '' }}>
        <FormBody />
      </FormProvider>
    );
    const input = screen.getByTestId('input-code');
    fireEvent.change(input, { target: { value: 'ab' } });
    noErrors('code');

    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-code-0')).toHaveTextContent('Too short')
    );
  });

  it('mode onSubmit — blur marks touched but paints NO error', async () => {
    render(
      <FormProvider formConfig={buildBlurForm('onSubmit')} defaultValues={{ code: '' }}>
        <FormBody />
      </FormProvider>
    );
    const input = screen.getByTestId('input-code');
    fireEvent.change(input, { target: { value: 'ab' } });

    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => expect(screen.getByTestId('touched-code')).toHaveTextContent('touched'));
    noErrors('code');
  });

  it('once touched, subsequent keystrokes DO validate live (onTouched: blur then live)', async () => {
    render(
      <FormProvider formConfig={buildBlurForm('onTouched')} defaultValues={{ code: '' }}>
        <FormBody />
      </FormProvider>
    );
    const input = screen.getByTestId('input-code');

    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-code')).toBeInTheDocument());

    // Typing a VALID value now clears without another blur — contract: once the
    // field has errored, `reValidateMode: 'onChange'` (default) governs live.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'abcd' } });
    });
    await waitFor(() => noErrors('code'));

    // ...and typing an invalid one re-paints, still without a blur.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ab' } });
    });
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-code-0')).toHaveTextContent('Too short')
    );
  });
});

// =====================================================================
// 3. mode: onChange (live)
// =====================================================================
describe('Error timing: change', () => {
  function buildChangeForm() {
    return form
      .create(rilConfig, 'change-form')
      .add({
        id: 'nickname',
        type: 'text',
        props: { label: 'Nickname' },
        validation: { validate: minLength(3, 'At least 3 chars') },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('paints as you type and CLEARS the instant the value becomes valid', async () => {
    render(
      <FormProvider formConfig={buildChangeForm()} defaultValues={{ nickname: '' }}>
        <FormBody />
        <Probe />
      </FormProvider>
    );
    const input = screen.getByTestId('input-nickname');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
    });
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-nickname-0')).toHaveTextContent('At least 3 chars')
    );

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ab' } });
    });
    // Still invalid — the error must persist, not flicker off.
    expect(screen.getByTestId('ui-errors-nickname')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'abc' } });
    });
    await waitFor(() => {
      noErrors('nickname');
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });

    // No stale error left behind in the store either.
    expect(storeRef?.getState().errors.nickname ?? []).toEqual([]);
  });

  it('re-paints when a valid value is made invalid again (no sticky "valid")', async () => {
    render(
      <FormProvider formConfig={buildChangeForm()} defaultValues={{ nickname: 'abcd' }}>
        <FormBody />
      </FormProvider>
    );
    const input = screen.getByTestId('input-nickname');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ab' } });
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-nickname')).toBeInTheDocument());
  });
});

// =====================================================================
// 4. debounceMs
// =====================================================================
describe('Error timing: debounceMs', () => {
  const DEBOUNCE = 60;

  function buildDebouncedForm(spy?: (v: unknown) => void) {
    return (
      form
        .create(rilConfig, 'debounced')
        .add({
          id: 'slug',
          type: 'text',
          props: { label: 'Slug' },
          validation: {
            validate: custom<string>((v) => {
              spy?.(v);
              return typeof v === 'string' && v.length >= 4;
            }, 'Slug too short'),
            debounceMs: DEBOUNCE,
          },
        })
        // `all`: change validates (deferred by debounceMs) AND blur validates
        // immediately — the blur path is what the third test pins as un-debounced.
        .setValidation({ mode: 'all' })
        .build()
    );
  }

  it('does NOT paint immediately on keystroke, and DOES once the debounce settles', async () => {
    render(
      <FormProvider formConfig={buildDebouncedForm()} defaultValues={{ slug: '' }}>
        <FormBody />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-slug'), { target: { value: 'ab' } });
    });
    // Immediately after the keystroke: nothing painted yet.
    noErrors('slug');
    expect(screen.getByTestId('validating-slug')).toHaveTextContent('settled');

    await waitFor(
      () => expect(screen.getByTestId('ui-error-slug-0')).toHaveTextContent('Slug too short'),
      { timeout: 1000 }
    );
  });

  it('collapses rapid keystrokes: only the FINAL value is ever judged', async () => {
    const seen: unknown[] = [];
    render(
      <FormProvider
        formConfig={buildDebouncedForm((v) => seen.push(v))}
        defaultValues={{ slug: '' }}
      >
        <FormBody />
      </FormProvider>
    );
    const input = screen.getByTestId('input-slug');

    await act(async () => {
      for (const v of ['a', 'ab', 'abc', 'abcd']) {
        fireEvent.change(input, { target: { value: v } });
      }
    });
    // Mid-flight: the intermediate invalid values must never surface.
    noErrors('slug');

    await act(async () => {
      await new Promise((r) => setTimeout(r, DEBOUNCE * 3));
    });

    // Exactly one judged value, and it is the final (valid) one -> no error.
    expect(seen).toEqual(['abcd']);
    noErrors('slug');
  });

  it('debounce does not defer the BLUR path — blur paints immediately', async () => {
    render(
      <FormProvider formConfig={buildDebouncedForm()} defaultValues={{ slug: 'ab' }}>
        <FormBody />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.blur(screen.getByTestId('input-slug'));
    });
    // No waiting on the debounce window: the blur verdict is synchronous-ish.
    await waitFor(() => expect(screen.getByTestId('ui-errors-slug')).toBeInTheDocument());
  });
});

// =====================================================================
// 5. ON SUBMIT — all invalid fields at once
// =====================================================================
describe('Error timing: submit', () => {
  function buildSubmitForm() {
    return form
      .create(rilConfig, 'submit-form')
      .add({
        id: 'first',
        type: 'text',
        props: { label: 'First' },
        validation: { validate: required('First is required') },
      })
      .add({
        id: 'last',
        type: 'text',
        props: { label: 'Last' },
        validation: { validate: required('Last is required') },
      })
      .add({
        id: 'age',
        type: 'text',
        props: { label: 'Age' },
        validation: { validate: minLength(2, 'Age too short') },
      })
      .add({ id: 'optional', type: 'text', props: { label: 'Optional' } })
      .build();
  }

  it('surfaces errors on ALL invalid fields at once and blocks onSubmit', async () => {
    const onSubmit = vi.fn();
    const results: boolean[] = [];
    render(
      <FormProvider
        formConfig={buildSubmitForm()}
        defaultValues={{ first: '', last: '', age: '', optional: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitCapture onResult={(ok) => results.push(ok)} />
      </FormProvider>
    );

    // Pristine: nothing painted.
    noErrors('first');
    noErrors('last');

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('ui-error-first-0')).toHaveTextContent('First is required');
      expect(screen.getByTestId('ui-error-last-0')).toHaveTextContent('Last is required');
      expect(screen.getByTestId('ui-error-age-0')).toHaveTextContent('Age too short');
    });
    // A field with no validation never gains an error.
    noErrors('optional');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(results).toEqual([false]);
  });

  it('submit marks exactly the fields it errored as touched', async () => {
    render(
      <FormProvider
        formConfig={buildSubmitForm()}
        defaultValues={{ first: '', last: '', age: '', optional: '' }}
      >
        <FormBody />
        <SubmitCapture />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-first')).toBeInTheDocument());

    // A submit is the moment an error is meant to appear, and it paints one on
    // every invalid field at once — so it marks exactly those fields touched.
    // `touched` is both what a `field.touched`-gated renderer displays on and
    // what makes a field re-validate live while the user types the fix.
    expect(screen.getByTestId('touched-first')).toHaveTextContent('touched');
    expect(screen.getByTestId('touched-last')).toHaveTextContent('touched');
    expect(screen.getByTestId('touched-age')).toHaveTextContent('touched');
    // A field with no validation never errored, so the submit leaves it alone.
    expect(screen.getByTestId('touched-optional')).toHaveTextContent('pristine');
  });
});

// =====================================================================
// 5b. TOUCHED SEMANTICS vs. SUBMIT — the touched-gated renderer idiom
// =====================================================================
describe('Error timing: touched semantics', () => {
  function buildGatedForm() {
    return form
      .create(rilConfig, 'gated-form')
      .add({
        id: 'first',
        type: 'gated',
        validation: { validate: required('First is required') },
      })
      .add({
        id: 'last',
        type: 'gated',
        validation: { validate: required('Last is required') },
      })
      .build();
  }

  it('a plain change never marks touched — blur does', async () => {
    render(
      <FormProvider
        formConfig={form
          .create(rilConfig, 'touched-src')
          .add({
            id: 'city',
            type: 'text',
            props: { label: 'City' },
            validation: { validate: required('City is required') },
          })
          .build()}
        defaultValues={{ city: '' }}
      >
        <FormBody />
        <SubmitCapture />
      </FormProvider>
    );

    expect(screen.getByTestId('touched-city')).toHaveTextContent('pristine');

    // change -> still pristine (FormField.tsx:129 handleChange never sets touched)
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-city'), { target: { value: 'P' } });
    });
    expect(screen.getByTestId('touched-city')).toHaveTextContent('pristine');

    // blur -> touched (FormField.tsx:165). A submit that errors the field also
    // marks it touched — pinned separately by the submit-timing describe above.
    await act(async () => {
      fireEvent.blur(screen.getByTestId('input-city'));
    });
    await waitFor(() => expect(screen.getByTestId('touched-city')).toHaveTextContent('touched'));
  });

  it('a touched-gated renderer shows every error after a failed submit', async () => {
    // The `field.touched` idiom exists so a form does not yell at a field the
    // user has not reached yet. A submit means they reached all of them: it must
    // mark the fields it errors touched, or this renderer paints a blocked
    // submit with zero visible explanation and the user is stuck on a refused
    // form with nothing on screen to fix.
    const onSubmit = vi.fn();
    const results: boolean[] = [];
    render(
      <FormProvider
        formConfig={buildGatedForm()}
        defaultValues={{ first: '', last: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitCapture onResult={(ok) => results.push(ok)} />
        <Probe />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    // Submit was refused...
    await waitFor(() => expect(results).toEqual([false]));
    expect(onSubmit).not.toHaveBeenCalled();
    // ...the errors are in the store...
    expect(storeRef?.getState().errors.first?.[0]?.message).toBe('First is required');
    // ...and the user SEES every one of them, without having to blur anything.
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-first-0')).toHaveTextContent('First is required')
    );
    expect(screen.getByTestId('ui-error-last-0')).toHaveTextContent('Last is required');
  });
});

// =====================================================================
// 6. ERROR CLEARS ON FIX (after a failed submit)
// =====================================================================
describe('Error timing: clearing a submit-committed error', () => {
  function buildFixForm() {
    return form
      .create(rilConfig, 'fix-form')
      .add({
        id: 'city',
        type: 'text',
        props: { label: 'City' },
        validation: { validate: required('City is required') },
      })
      .build();
  }

  it('a submit-errored field clears the error live as the user types the fix (reValidateMode onChange)', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildFixForm()} defaultValues={{ city: '' }} onSubmit={onSubmit}>
        <FormBody />
        <SubmitCapture />
        <Probe />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-city')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-city'), { target: { value: 'Paris' } });
    });
    await waitFor(() => {
      noErrors('city');
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
  });

  it('a submit-errored field under the DEFAULT mode clears its error as the user types the fix', async () => {
    // Once a field's error has been shown it must track the fix live: the submit
    // committed the error, and from there `reValidateMode: 'onChange'` (the
    // default) re-validates on every keystroke. Without that the field stays
    // FROZEN at its submit verdict — the user types a perfectly valid value and
    // the error sits there until they blur or submit again.
    render(
      <FormProvider formConfig={buildFixForm()} defaultValues={{ city: '' }}>
        <FormBody />
        <SubmitCapture />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-city')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-city'), { target: { value: 'Paris' } });
    });

    // No blur, no second submit: the error clears on the keystroke that fixes it.
    await waitFor(() => noErrors('city'));
    expect(screen.getByTestId('input-city')).toHaveValue('Paris');
  });
});

// =====================================================================
// 7. PER-ROW ERRORS IN A REPEATABLE
// =====================================================================
describe('Error timing: per-row isolation in a repeatable', () => {
  function buildRowsForm() {
    return form
      .create(rilConfig, 'rows-form')
      .addRepeatable('items', (r) =>
        r
          .add({
            id: 'sku',
            type: 'text',
            props: { label: 'SKU' },
            validation: { validate: required('SKU is required') },
          })
          .defaultValue({ sku: '' })
      )
      .setValidation({ mode: 'onChange' })
      .build();
  }

  const threeRows = { items: [{ sku: 'A' }, { sku: 'B' }, { sku: 'C' }] };

  function renderRows(onSubmit?: () => void) {
    return render(
      <FormProvider formConfig={buildRowsForm()} defaultValues={threeRows} onSubmit={onSubmit}>
        <FormBody />
        <RepeatableAdder repeatableId="items" />
        <SubmitCapture />
        <Probe />
      </FormProvider>
    );
  }

  it('an error on row 2 shows ONLY on row 2', async () => {
    renderRows();
    const [k0, k1, k2] = storeRef?.getState()._repeatableOrder.items ?? [];

    await act(async () => {
      fireEvent.change(screen.getByTestId(`input-items[${k1}].sku`), { target: { value: '' } });
    });

    await waitFor(() =>
      expect(screen.getByTestId(`ui-error-items[${k1}].sku-0`)).toHaveTextContent('SKU is required')
    );
    noErrors(`items[${k0}].sku`);
    noErrors(`items[${k2}].sku`);
  });

  it('removing the errored row removes its error and shifts none onto a sibling', async () => {
    const { rerender } = renderRows();
    const [k0, k1, k2] = storeRef?.getState()._repeatableOrder.items ?? [];

    await act(async () => {
      fireEvent.change(screen.getByTestId(`input-items[${k1}].sku`), { target: { value: '' } });
    });
    await waitFor(() =>
      expect(screen.getByTestId(`ui-errors-items[${k1}].sku`)).toBeInTheDocument()
    );
    expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');

    // Remove row 2 (the errored one).
    rerender(
      <FormProvider formConfig={buildRowsForm()} defaultValues={threeRows}>
        <FormBody />
        <RepeatableRemover repeatableId="items" itemKey={k1} />
        <Probe />
      </FormProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId(`remove-items-${k1}`));
    });

    await waitFor(() => {
      expect(screen.queryByTestId(`input-items[${k1}].sku`)).toBeNull();
      // The two survivors are clean...
      expect(screen.queryByTestId(`ui-errors-items[${k0}].sku`)).toBeNull();
      expect(screen.queryByTestId(`ui-errors-items[${k2}].sku`)).toBeNull();
      // ...and the removed row's error does not wedge the form.
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
    expect(storeRef?.getState().errors[`items[${k1}].sku`]).toBeUndefined();
  });

  it('a newly added row inherits NO error from an errored sibling', async () => {
    renderRows();
    const [, k1] = storeRef?.getState()._repeatableOrder.items ?? [];

    await act(async () => {
      fireEvent.change(screen.getByTestId(`input-items[${k1}].sku`), { target: { value: '' } });
    });
    await waitFor(() =>
      expect(screen.getByTestId(`ui-errors-items[${k1}].sku`)).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('append-items'));
    });

    const order = storeRef?.getState()._repeatableOrder.items ?? [];
    const newKey = order[order.length - 1];
    await waitFor(() =>
      expect(screen.getByTestId(`input-items[${newKey}].sku`)).toBeInTheDocument()
    );
    // The new row starts pristine and silent even though its sku default is ''
    // (which WOULD fail `required`) — mounting a row must not spray errors.
    noErrors(`items[${newKey}].sku`);
    expect(screen.getByTestId(`touched-items[${newKey}].sku`)).toHaveTextContent('pristine');
    // The pre-existing error is untouched.
    expect(screen.getByTestId(`ui-errors-items[${k1}].sku`)).toBeInTheDocument();
  });

  it('submit paints an error on EVERY empty row, each on its own row only', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider
        formConfig={buildRowsForm()}
        defaultValues={{ items: [{ sku: '' }, { sku: 'B' }, { sku: '' }] }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitCapture />
        <Probe />
      </FormProvider>
    );
    const [k0, k1, k2] = storeRef?.getState()._repeatableOrder.items ?? [];

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId(`ui-errors-items[${k0}].sku`)).toBeInTheDocument();
      expect(screen.getByTestId(`ui-errors-items[${k2}].sku`)).toBeInTheDocument();
    });
    noErrors(`items[${k1}].sku`);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// =====================================================================
// 8. HIDDEN FIELD ERRORS
// =====================================================================
describe('Error timing: a field that becomes hidden', () => {
  function buildHideForm() {
    return form
      .create(rilConfig, 'hide-form')
      .add({ id: 'show', type: 'checkbox', props: { label: 'Show' } })
      .add({
        id: 'reason',
        type: 'text',
        props: { label: 'Reason' },
        validation: { validate: minLength(5, 'Reason too short') },
        conditions: { visible: when('show').equals(true) },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('a committed error stops being displayed when the field hides, and does not wedge submit', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider
        formConfig={buildHideForm()}
        defaultValues={{ show: true, reason: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <Toggle id="show" value={false} />
        <SubmitCapture />
        <Probe />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-reason'), { target: { value: 'ab' } });
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-reason')).toBeInTheDocument());
    expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');

    // Hide it: the error must vanish from the UI...
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-show'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('field-reason')).toBeNull();
      expect(screen.queryByTestId('ui-errors-reason')).toBeNull();
    });

    // ...and must not block a submit of a form the user sees as complete.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('reason');
  });

  it('re-showing a previously errored field re-evaluates fresh (no resurrected error)', async () => {
    render(
      <FormProvider formConfig={buildHideForm()} defaultValues={{ show: true, reason: '' }}>
        <FormBody />
        <Toggle id="show" value={false} />
        <SubmitCapture />
        <Probe />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-reason'), { target: { value: 'ab' } });
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-reason')).toBeInTheDocument());

    // Hide: validateForm clears the error on the invisible field.
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-show'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));

    // Re-show: the field comes back with its old (still invalid) value but a
    // CLEAN slate — no resurrected error before the user touches it again.
    await act(async () => {
      storeRef?.getState()._setValue('show', true);
    });
    await waitFor(() => expect(screen.getByTestId('field-reason')).toBeInTheDocument());
    noErrors('reason');
    expect(screen.getByTestId('input-reason')).toHaveValue('ab');

    // A fresh submit re-evaluates it and paints the error again.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-reason-0')).toHaveTextContent('Reason too short')
    );
  });

  it('a late async verdict for a now-hidden field paints nothing', async () => {
    const { schema, calls } = makeControllableAsync();
    const formConfig = form
      .create(rilConfig, 'hide-async')
      .add({ id: 'show', type: 'checkbox', props: { label: 'Show' } })
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
        <Toggle id="show" value={false} />
        <Probe />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-detail'), { target: { value: 'bad' } });
    await waitFor(() => expect(calls.length).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId('set-show'));
    });
    await waitFor(() => expect(screen.queryByTestId('field-detail')).toBeNull());

    await act(async () => {
      calls[0].resolve([{ message: 'Invalid detail' }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));
    expect(storeRef?.getState().errors.detail ?? []).toEqual([]);

    // Re-showing must not paint the dropped verdict.
    await act(async () => {
      storeRef?.getState()._setValue('show', true);
    });
    await waitFor(() => expect(screen.getByTestId('field-detail')).toBeInTheDocument());
    noErrors('detail');
  });
});

// =====================================================================
// 9. ASYNC ERROR TIMING
// =====================================================================
describe('Error timing: async verdicts', () => {
  function buildAsyncForm(schema: unknown, id = 'async-form') {
    return form
      .create(rilConfig, id)
      .add({
        id: 'handle',
        type: 'text',
        props: { label: 'Handle' },
        validation: { validate: schema as never },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('shows "validating" in flight with NO premature error, then paints on the verdict', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider formConfig={buildAsyncForm(schema)} defaultValues={{ handle: '' }}>
        <FormBody />
        <Probe />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-handle'), { target: { value: 'taken' } });

    // In flight: the user sees a spinner state, not an error.
    await waitFor(() =>
      expect(screen.getByTestId('validating-handle')).toHaveTextContent('validating')
    );
    noErrors('handle');

    await act(async () => {
      calls[0].resolve([{ message: 'Handle is taken' }]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('validating-handle')).toHaveTextContent('settled');
      expect(screen.getByTestId('ui-error-handle-0')).toHaveTextContent('Handle is taken');
    });
  });

  it('a stale verdict never paints an error for a value the user already changed', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider
        formConfig={buildAsyncForm(schema, 'async-stale')}
        defaultValues={{ handle: '' }}
      >
        <FormBody />
        <Probe />
      </FormProvider>
    );
    const input = screen.getByTestId('input-handle');

    fireEvent.change(input, { target: { value: 'taken' } });
    fireEvent.change(input, { target: { value: 'free' } });
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0].value).toBe('taken');
    expect(calls[1].value).toBe('free');

    // The NEWER (valid) verdict lands first; the STALE (invalid) one lands after.
    await act(async () => {
      calls[1].resolve();
      await Promise.resolve();
    });
    await act(async () => {
      calls[0].resolve([{ message: 'Handle is taken' }]);
      await Promise.resolve();
    });

    // The user typed 'free'; nothing may accuse it of being taken.
    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));
    noErrors('handle');
    expect(screen.getByTestId('input-handle')).toHaveValue('free');
  });

  it('the newest INVALID verdict survives a stale VALID one landing afterwards', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider
        formConfig={buildAsyncForm(schema, 'async-stale-2')}
        defaultValues={{ handle: '' }}
      >
        <FormBody />
        <Probe />
      </FormProvider>
    );
    const input = screen.getByTestId('input-handle');

    fireEvent.change(input, { target: { value: 'free' } });
    fireEvent.change(input, { target: { value: 'taken' } });
    await waitFor(() => expect(calls.length).toBe(2));

    await act(async () => {
      calls[1].resolve([{ message: 'Handle is taken' }]);
      await Promise.resolve();
    });
    await act(async () => {
      calls[0].resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('ui-error-handle-0')).toHaveTextContent('Handle is taken')
    );
    expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');
  });

  it('a thrown async validator paints its message rather than leaving the field stuck validating', async () => {
    const throwing = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: async () => {
          throw new Error('Uniqueness service unavailable');
        },
      },
    };
    render(
      <FormProvider
        formConfig={buildAsyncForm(throwing, 'async-throw')}
        defaultValues={{ handle: '' }}
      >
        <FormBody />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-handle'), { target: { value: 'x' } });
      await new Promise((r) => setTimeout(r, 20));
    });

    await waitFor(() => {
      expect(screen.getByTestId('validating-handle')).toHaveTextContent('settled');
      expect(screen.getByTestId('ui-error-handle-0')).toHaveTextContent(
        'Uniqueness service unavailable'
      );
    });
  });
});

// =====================================================================
// 10. MULTIPLE ERRORS ON ONE FIELD
// =====================================================================
describe('Error timing: several failing rules on one field', () => {
  it('shows ALL accumulated messages, in declaration order', async () => {
    const formConfig = form
      .create(rilConfig, 'multi-error')
      .add({
        id: 'password',
        type: 'text',
        props: { label: 'Password' },
        validation: {
          // `combine` accumulates every sub-schema's issues
          // (validation/utils.ts:61 runCombinedSchemas) — the contract is
          // ALL errors, not first-wins.
          validate: combine(
            minLength(8, 'Must be at least 8 characters'),
            custom<string>((v) => /[0-9]/.test(String(v)), 'Must contain a digit'),
            custom<string>((v) => /[A-Z]/.test(String(v)), 'Must contain an uppercase letter')
          ),
        },
      })
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ password: '' }}>
        <FormBody />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'abc' } });
    });

    await waitFor(() => expect(screen.getByTestId('error-count-password')).toHaveTextContent('3'));
    expect(errorTextsOf('password')).toEqual([
      'Must be at least 8 characters',
      'Must contain a digit',
      'Must contain an uppercase letter',
    ]);

    // Fixing ONE rule drops exactly that message and keeps the others.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'abcdefgh' } });
    });
    await waitFor(() => expect(screen.getByTestId('error-count-password')).toHaveTextContent('2'));
    expect(errorTextsOf('password')).toEqual([
      'Must contain a digit',
      'Must contain an uppercase letter',
    ]);

    // Fixing everything clears the whole list at once.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'Abcdefg1' } });
    });
    await waitFor(() => noErrors('password'));
  });

  it('an array `validate` accumulates across schemas the same way', async () => {
    const formConfig = form
      .create(rilConfig, 'multi-error-array')
      .add({
        id: 'code',
        type: 'text',
        props: { label: 'Code' },
        validation: {
          validate: [required('Code is required'), minLength(3, 'Code too short')],
        },
      })
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ code: 'x' }}>
        <FormBody />
        <SubmitCapture />
      </FormProvider>
    );

    // Emptying it fails BOTH rules; both must be shown.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-code'), { target: { value: '' } });
    });
    await waitFor(() => expect(screen.getByTestId('error-count-code')).toHaveTextContent('2'));
    expect(errorTextsOf('code')).toEqual(['Code is required', 'Code too short']);
  });
});

// =====================================================================
// 11. CONDITIONAL-REQUIRED ERROR LIFECYCLE (display-level)
// =====================================================================
describe('Error timing: conditional-required', () => {
  function buildCondForm() {
    return form
      .create(rilConfig, 'cond-form')
      .add({ id: 'wantsInvoice', type: 'checkbox', props: { label: 'Invoice?' } })
      .add({
        id: 'vat',
        type: 'text',
        props: { label: 'VAT' },
        conditions: { required: when('wantsInvoice').equals(true) },
      })
      .build();
  }

  it('paints the required error only once the controller flips, and drops it when it flips back', async () => {
    render(
      <FormProvider formConfig={buildCondForm()} defaultValues={{ wantsInvoice: false, vat: '' }}>
        <FormBody />
        <SubmitCapture />
        <Probe />
      </FormProvider>
    );

    // Not required yet -> submit passes, nothing painted.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => noErrors('vat'));

    // Flip the controller: still nothing painted until something validates —
    // becoming required is not, by itself, an error event.
    await act(async () => {
      fireEvent.click(screen.getByTestId('input-wantsInvoice'));
    });
    noErrors('vat');

    // Submit now paints it.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-vat-0')).toHaveTextContent('This field is required')
    );

    // Flip back + re-validate: the error must drop and stop wedging the form.
    await act(async () => {
      fireEvent.click(screen.getByTestId('input-wantsInvoice'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => {
      noErrors('vat');
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
  });
});
