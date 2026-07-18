/**
 * =============================================================================
 * FAR-REACHING E2E — the form/flow LIFECYCLE EDGES a product hits in anger:
 *
 *   • BULK PREFILL   — "load an existing KYC application to edit": seed 20+
 *                      fields at once (incl. Date / number / bool and repeatable
 *                      rows), assert every field paints, conditions re-derive
 *                      from the seeded data, and submit yields the exact payload.
 *   • RESET          — a "clear form" button: fill, mutate, add rows, spray
 *                      errors, then reset to defaults.
 *   • RECONFIG       — swap the mounted form for a DIFFERENT one (a schema the
 *                      backend re-emitted with a new shape) and assert no ghost
 *                      state bleeds; contrast with GROWTH (append), which keeps.
 *   • RE-SEED        — the runtime `defaultValues`-change contract, pinned.
 *
 * AFFORDANCES VERIFIED IN SOURCE BEFORE ASSERTING (never invented):
 *  - RESET EXISTS as a first-class action: `useFormActions().reset(values?)` →
 *    `formStore._reset` (formStore.ts:238). No args restores `_defaultValues`;
 *    it is built FROM `createInitialFormData()` so every data member is cleared
 *    unless explicitly carried (errors / touched / validationStates / isDirty /
 *    isSubmitting all reset; `_defaultValues` + `_repeatableConfigs` preserved).
 *    Repeatable rows are rebuilt from `_defaultValues` via
 *    `initializeRepeatableState`, so they return to the SEEDED (default) count.
 *  - BULK PREFILL is `defaultValues` (FormProvider) / `defaults` (Form / Flow).
 *    There is NO dedicated bulk-set store action — only per-field `_setValue`;
 *    `reset(values)` is the only "set many at once" affordance. Seeding runs
 *    through `initializeRepeatableState`, which flattens nested arrays into
 *    composite keys and pads to `min` (repeatable-data.ts:261).
 *  - CONFIG SWAP keys on a structural SIGNATURE (instanceId + formId + each
 *    field's id&componentId + repeatable shapes — FormProvider.tsx
 *    buildConfigSignature:251). A DROPPED / RETYPED field, or a different
 *    instanceId/formId, is a swap → full store reset + re-seed from the NEW
 *    defaults. A pure APPEND is GROWTH → the store is NOT reset (existing values
 *    survive; only newcomers seed). classifyShapeChange:363.
 *  - RUNTIME `defaultValues` change is NOT a full re-seed: it moves no signature
 *    (defaults are deliberately out of the shape). Only a late/changed default
 *    for an UNTOUCHED, UN-EDITED field whose live value is still the committed
 *    baseline is applied — the `isUpgradableDefault` guard (FormProvider.tsx:488).
 *    A touched or edited field keeps its value. Pinned in RESEED-1/2.
 *  - onTouched default: a conditional field seeded VISIBLE + required shows no
 *    premature error (touched is false until blur/submit); submit marks the
 *    errored fields touched so the error is visible (the c35df61 behaviour).
 *
 * Every field is painted by an error-aware renderer, so assertions are about
 * what the USER SEES; exact store state is read via a captured `useFormStoreApi`
 * ref (StoreInspector is non-reactive — memory) inside `waitFor`/after `act`.
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { custom, flow, form, required, ril, when } from 'rilaykit';
import {
  Flow,
  FlowBody,
  Form,
  FormBody,
  useFlowData,
  useFormActions,
  useFormStoreApi,
} from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormStore } from '../../../packages/forms/src/stores/formStore';
import { NextButton, PrevButton } from '../_setup/nav-buttons';
import { RepeatableControls } from '../_setup/test-helpers';

// ============================================================================
// ERROR-AWARE RENDERERS — assert what the user SEES (value + error + touched).
// ============================================================================

function ErrorAwareText({ id, props, field }: ComponentRenderContext) {
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

function ErrorAwareSelect({ id, props, field }: ComponentRenderContext) {
  const options = (props?.options as Array<{ value: string; label: string }> | undefined) ?? [];
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
      <select
        id={id}
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ErrorAwareNumber({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
      <input
        id={id}
        type="number"
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={() => field?.onBlur()}
      />
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
        type="checkbox"
        data-testid={`input-${id}`}
        checked={!!field?.value}
        onChange={(e) => field?.onChange(e.target.checked)}
        onBlur={() => field?.onBlur()}
      />
    </div>
  );
}

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: ErrorAwareText, defaultProps: { label: '' } })
  .component('select', {
    name: 'Select',
    renderer: ErrorAwareSelect,
    defaultProps: { label: '', options: [] },
  })
  .component('number', { name: 'Number', renderer: ErrorAwareNumber, defaultProps: { label: '' } })
  .component('checkbox', {
    name: 'Checkbox',
    renderer: ErrorAwareCheckbox,
    defaultProps: { label: '' },
  });

// ============================================================================
// STORE CAPTURE — StoreInspector is non-reactive; capture the ref and read
// getState() at assertion time inside waitFor / after act.
// ============================================================================

let capturedStore: FormStore | null = null;
function CaptureStore() {
  capturedStore = useFormStoreApi();
  return null;
}
function storeState() {
  if (!capturedStore) throw new Error('store not captured');
  return capturedStore.getState();
}

let capturedActions: ReturnType<typeof useFormActions> | null = null;
function CaptureActions() {
  capturedActions = useFormActions();
  return null;
}

// A button wired to the PUBLIC reset action (useFormActions), not the raw store.
function PublicResetButton() {
  const { reset } = useFormActions();
  return (
    <button type="button" data-testid="reset-btn" onClick={() => reset()}>
      Reset
    </button>
  );
}

function SubmitButton() {
  return (
    <button type="submit" data-testid="submit-btn">
      Submit
    </button>
  );
}

// ============================================================================
// THE "KYC APPLICATION" FORM — 20+ fields incl. conditionals + a repeatable.
// ============================================================================

const COUNTRY_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'US', label: 'United States' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
];

function buildKycForm() {
  return form
    .create(rilConfig, 'kyc-application')
    .add({
      id: 'firstName',
      type: 'text',
      props: { label: 'First name' },
      validation: { validate: required('First name is required') },
    })
    .add({
      id: 'lastName',
      type: 'text',
      props: { label: 'Last name' },
      validation: { validate: required('Last name is required') },
    })
    .add({
      id: 'email',
      type: 'text',
      props: { label: 'Email' },
      validation: {
        validate: custom<string>((v) => typeof v === 'string' && v.includes('@'), 'Invalid email'),
      },
    })
    .add({ id: 'age', type: 'number', props: { label: 'Age' } })
    .add({ id: 'dateOfBirth', type: 'text', props: { label: 'Date of birth' } })
    .add({
      id: 'country',
      type: 'select',
      props: { label: 'Country', options: COUNTRY_OPTIONS },
      validation: { validate: required('Country is required') },
    })
    .add({
      id: 'ssn',
      type: 'text',
      props: { label: 'SSN' },
      conditions: {
        visible: when('country').equals('US'),
        required: when('country').equals('US'),
      },
    })
    .add({
      id: 'vatId',
      type: 'text',
      props: { label: 'VAT ID' },
      conditions: {
        visible: when('country').equals('DE'),
        required: when('country').equals('DE'),
      },
    })
    .add({ id: 'isPEP', type: 'checkbox', props: { label: 'Politically exposed?' } })
    .add({
      id: 'pepReason',
      type: 'text',
      props: { label: 'PEP explanation' },
      conditions: {
        visible: when('isPEP').equals(true),
        required: when('isPEP').equals(true),
      },
    })
    .add({
      id: 'accountType',
      type: 'select',
      props: {
        label: 'Account type',
        options: [
          { value: '', label: 'Select...' },
          { value: 'personal', label: 'Personal' },
          { value: 'business', label: 'Business' },
        ],
      },
    })
    .add({
      id: 'companyName',
      type: 'text',
      props: { label: 'Company name' },
      conditions: { visible: when('accountType').equals('business') },
    })
    .add({ id: 'addressLine1', type: 'text', props: { label: 'Address line 1' } })
    .add({ id: 'addressLine2', type: 'text', props: { label: 'Address line 2' } })
    .add({ id: 'city', type: 'text', props: { label: 'City' } })
    .add({ id: 'postalCode', type: 'text', props: { label: 'Postal code' } })
    .add({ id: 'phone', type: 'text', props: { label: 'Phone' } })
    .add({ id: 'occupation', type: 'text', props: { label: 'Occupation' } })
    .add({ id: 'annualIncome', type: 'number', props: { label: 'Annual income' } })
    .add({ id: 'newsletter', type: 'checkbox', props: { label: 'Newsletter' } })
    .add({ id: 'referralCode', type: 'text', props: { label: 'Referral code' } })
    .addRepeatable('beneficiaries', (r) =>
      r
        .add({
          id: 'name',
          type: 'text',
          props: { label: 'Beneficiary name' },
          validation: { validate: required('Beneficiary name is required') },
        })
        .add({ id: 'share', type: 'number', props: { label: 'Share %' } })
        .add({ id: 'primary', type: 'checkbox', props: { label: 'Primary?' } })
        .min(1)
        .defaultValue({ name: '', share: 0, primary: false })
    )
    .build();
}

// A full "existing application" server payload — 22 static fields + 2 rows.
function serverPayload() {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@analytical.engine',
    age: 36,
    dateOfBirth: '1815-12-10',
    country: 'US',
    ssn: '123-45-6789',
    isPEP: true,
    pepReason: 'Former countess',
    accountType: 'business',
    companyName: 'Analytical Engines Ltd',
    addressLine1: '12 Ockham Road',
    addressLine2: 'Suite 1',
    city: 'London',
    postalCode: 'SW1',
    phone: '+44 20 7946 0000',
    occupation: 'Mathematician',
    annualIncome: 120000,
    newsletter: true,
    referralCode: 'BABBAGE',
    beneficiaries: [
      { name: 'Byron', share: 60, primary: true },
      { name: 'Anne', share: 40, primary: false },
    ],
  };
}

function renderKyc(
  defaults: Record<string, unknown>,
  onSubmit?: (data: Record<string, unknown>) => void
) {
  return render(
    <Form of={buildKycForm()} defaults={defaults} onSubmit={onSubmit}>
      <CaptureStore />
      <FormBody />
      <RepeatableControls repeatableId="beneficiaries" />
      <PublicResetButton />
      <SubmitButton />
    </Form>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
function hasUiError(id: string) {
  return screen.queryByTestId(`ui-errors-${id}`) !== null;
}
async function clickSubmit() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('submit-btn'));
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — reset / reconfiguration / bulk prefill lifecycle edges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedStore = null;
  });
  afterEach(() => {
    capturedStore = null;
  });

  // --------------------------------------------------------------------------
  // GROUP P — BULK PREFILL (load an existing application to edit)
  // --------------------------------------------------------------------------

  it('P1: seeds 22 fields + 2 repeatable rows at once; every field paints its value', async () => {
    renderKyc(serverPayload());

    // A representative spread across text / number / bool / select.
    await waitFor(() => expect(screen.getByTestId('input-firstName')).toHaveValue('Ada'));
    expect(screen.getByTestId('input-lastName')).toHaveValue('Lovelace');
    expect(screen.getByTestId('input-email')).toHaveValue('ada@analytical.engine');
    expect(screen.getByTestId('input-age')).toHaveValue(36);
    expect(screen.getByTestId('input-dateOfBirth')).toHaveValue('1815-12-10');
    expect(screen.getByTestId('input-country')).toHaveValue('US');
    expect(screen.getByTestId('input-isPEP')).toBeChecked();
    expect(screen.getByTestId('input-accountType')).toHaveValue('business');
    expect(screen.getByTestId('input-annualIncome')).toHaveValue(120000);
    expect(screen.getByTestId('input-newsletter')).toBeChecked();
    expect(screen.getByTestId('input-referralCode')).toHaveValue('BABBAGE');

    // Both repeatable rows materialised with their per-row values.
    expect(screen.getByTestId('repeatable-count-beneficiaries')).toHaveTextContent('2');
    expect(screen.getByTestId('input-beneficiaries[k0].name')).toHaveValue('Byron');
    expect(screen.getByTestId('input-beneficiaries[k0].share')).toHaveValue(60);
    expect(screen.getByTestId('input-beneficiaries[k0].primary')).toBeChecked();
    expect(screen.getByTestId('input-beneficiaries[k1].name')).toHaveValue('Anne');
    expect(screen.getByTestId('input-beneficiaries[k1].share')).toHaveValue(40);
    expect(screen.getByTestId('input-beneficiaries[k1].primary')).not.toBeChecked();
  });

  it('P2: seeded data re-derives conditions — US→ssn visible, isPEP→pepReason, business→companyName', async () => {
    renderKyc(serverPayload());

    // Conditions evaluate against the SEEDED values with no user interaction.
    await waitFor(() => {
      expect(screen.getByTestId('input-ssn')).toBeInTheDocument();
      expect(screen.getByTestId('input-pepReason')).toBeInTheDocument();
      expect(screen.getByTestId('input-companyName')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-ssn')).toHaveValue('123-45-6789');
    expect(screen.getByTestId('input-pepReason')).toHaveValue('Former countess');
    expect(screen.getByTestId('input-companyName')).toHaveValue('Analytical Engines Ltd');
    // The country-specific field for the OTHER branch never rendered.
    expect(screen.queryByTestId('input-vatId')).not.toBeInTheDocument();

    // A freshly prefilled form is pristine — no premature errors on the visible,
    // conditionally-required fields (onTouched default).
    expect(hasUiError('ssn')).toBe(false);
    expect(hasUiError('pepReason')).toBe(false);
    expect(screen.getByTestId('touched-firstName')).toHaveTextContent('pristine');
  });

  it('P3: submitting a prefilled form yields the exact structured payload (rows as an array)', async () => {
    const onSubmit = vi.fn();
    renderKyc(serverPayload(), onSubmit);

    await waitFor(() => expect(screen.getByTestId('input-firstName')).toHaveValue('Ada'));
    await clickSubmit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const data = onSubmit.mock.calls[0][0] as Record<string, unknown>;

    // Every seeded static field ships unchanged, with number/bool types intact.
    expect(data).toMatchObject({
      firstName: 'Ada',
      age: 36,
      country: 'US',
      ssn: '123-45-6789',
      isPEP: true,
      pepReason: 'Former countess',
      accountType: 'business',
      companyName: 'Analytical Engines Ltd',
      annualIncome: 120000,
      newsletter: true,
    });
    // The repeatable projects back to an ordered array of typed rows.
    expect(data.beneficiaries).toEqual([
      { name: 'Byron', share: 60, primary: true },
      { name: 'Anne', share: 40, primary: false },
    ]);
    // vatId never existed for a US applicant — it is absent from the payload.
    expect(data).not.toHaveProperty('vatId');
  });

  // --------------------------------------------------------------------------
  // GROUP C — PREFILL THAT FLIPS CONDITIONS AT MOUNT (no user interaction)
  // --------------------------------------------------------------------------

  it('C1: default data alone makes a conditional field visible + required, with no premature error', async () => {
    // Minimal seed: only the driver values, conditional targets left empty.
    renderKyc({ country: 'US', isPEP: true });

    await waitFor(() => {
      expect(screen.getByTestId('input-ssn')).toBeInTheDocument();
      expect(screen.getByTestId('input-pepReason')).toBeInTheDocument();
    });
    // Visible + required from seed, but untouched → NO error is shown yet.
    expect(screen.getByTestId('input-ssn')).toHaveValue('');
    expect(hasUiError('ssn')).toBe(false);
    expect(screen.getByTestId('touched-ssn')).toHaveTextContent('pristine');

    // The requirement is real: an empty seed-visible required field blocks submit
    // and the error becomes visible (submit marks it touched — c35df61).
    await clickSubmit();
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-ssn-0')).toHaveTextContent(/required/i)
    );
    expect(screen.getByTestId('touched-ssn')).toHaveTextContent('touched');
  });

  // --------------------------------------------------------------------------
  // GROUP R — RESET TO DEFAULTS (a "clear / revert" button)
  // --------------------------------------------------------------------------

  it('R1: reset() restores seeded values, default row count, and clears errors/touched/dirty', async () => {
    renderKyc(serverPayload());
    await waitFor(() => expect(screen.getByTestId('input-firstName')).toHaveValue('Ada'));

    // Mutate several fields, add a 3rd beneficiary row, and blur one.
    await act(async () => {
      setField('firstName', 'Grace');
      setField('email', 'not-an-email'); // will fail on submit
      setField('city', 'Baltimore');
      fireEvent.blur(screen.getByTestId('input-lastName'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-append-beneficiaries'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-beneficiaries')).toHaveTextContent('3')
    );

    // Spray errors: clear a required field then submit.
    await act(async () => setField('firstName', ''));
    await clickSubmit();
    await waitFor(() => expect(screen.getByTestId('ui-errors-firstName')).toBeInTheDocument());
    expect(storeState().isDirty).toBe(true);

    // RESET (public action, no args → back to the seeded defaults).
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-btn'));
    });

    // Values restored to the seed; the mutated fields reverted.
    await waitFor(() => expect(screen.getByTestId('input-firstName')).toHaveValue('Ada'));
    expect(screen.getByTestId('input-email')).toHaveValue('ada@analytical.engine');
    expect(screen.getByTestId('input-city')).toHaveValue('London');

    // Repeatable back to the SEEDED (default) count of 2, values restored.
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-beneficiaries')).toHaveTextContent('2')
    );
    expect(screen.getByTestId('input-beneficiaries[k0].name')).toHaveValue('Byron');
    expect(screen.getByTestId('input-beneficiaries[k1].name')).toHaveValue('Anne');

    // Errors / touched / validationStates / dirty all cleared.
    expect(hasUiError('firstName')).toBe(false);
    await waitFor(() => {
      const s = storeState();
      expect(s.errors).toEqual({});
      expect(s.touched).toEqual({});
      expect(s.validationStates).toEqual({});
      expect(s.isDirty).toBe(false);
      expect(s.isSubmitting).toBe(false);
      expect(s.isValid).toBe(true);
    });
  });

  it('R2: reset(explicitValues) bulk-sets a NEW dataset (the only "set many at once" path)', async () => {
    // There is no dedicated bulk-set store action; reset(values) is it.
    renderKyc(serverPayload());
    await waitFor(() => expect(screen.getByTestId('input-firstName')).toHaveValue('Ada'));

    await act(async () => {
      storeState()._reset({
        firstName: 'Charles',
        lastName: 'Babbage',
        country: 'DE',
        // A DE applicant: the vatId branch, not ssn.
        vatId: 'DE811',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-firstName')).toHaveValue('Charles');
      expect(screen.getByTestId('input-country')).toHaveValue('DE');
      expect(screen.getByTestId('input-vatId')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-vatId')).toHaveValue('DE811');
    // ssn's branch is gone; the old US-seeded ssn value did not survive the reset.
    expect(screen.queryByTestId('input-ssn')).not.toBeInTheDocument();
    // Fields absent from the explicit dataset read empty.
    expect(screen.getByTestId('input-email')).toHaveValue('');
  });

  it('R3: reset(values, repeatableOrder) via the PUBLIC action preserves the given row order', async () => {
    // The underlying _reset(values, repeatableOrder) re-sequences rows, but the
    // public useFormActions().reset wrapper used to drop the 2nd arg — so a host
    // resetting to a dataset that encodes a user reorder could only recover
    // insertion order. The wrapper now forwards it.
    const cfg = form
      .create(rilConfig, 'reorder-reset')
      .addRepeatable('items', (r) =>
        r.add({ id: 'label', type: 'text', props: { label: 'Label' } }).min(1)
      )
      .build();

    render(
      <Form of={cfg} defaults={{}}>
        <CaptureStore />
        <CaptureActions />
        <FormBody />
      </Form>
    );
    await waitFor(() => expect(capturedActions).not.toBeNull());

    // Reset to two rows whose value-key insertion order (a, b) is the REVERSE of
    // the requested display order (b, a).
    await act(async () => {
      capturedActions?.reset(
        { 'items[a].label': 'A', 'items[b].label': 'B' },
        { items: ['b', 'a'] }
      );
    });

    await waitFor(() => expect(storeState()._repeatableOrder.items).toEqual(['b', 'a']));
  });

  // --------------------------------------------------------------------------
  // GROUP S — CONFIG SWAP vs GROWTH (runtime reconfiguration)
  // --------------------------------------------------------------------------

  it('S1: swapping to a different form drops all ghost values/fields; no bleed', async () => {
    const onSubmit = vi.fn();

    const formA = form
      .create(rilConfig, 'form-a')
      .add({ id: 'alpha', type: 'text', props: { label: 'Alpha' } })
      .add({ id: 'beta', type: 'text', props: { label: 'Beta' } })
      .build();

    const formB = form
      .create(rilConfig, 'form-b')
      .add({ id: 'gamma', type: 'text', props: { label: 'Gamma' } })
      .add({ id: 'delta', type: 'text', props: { label: 'Delta' } })
      .build();

    function Host() {
      const [which, setWhich] = useState<'a' | 'b'>('a');
      return (
        <>
          <button type="button" data-testid="to-b" onClick={() => setWhich('b')}>
            swap
          </button>
          <Form
            of={which === 'a' ? formA : formB}
            defaults={which === 'a' ? { alpha: 'A', beta: 'B' } : { gamma: 'G' }}
            onSubmit={onSubmit}
          >
            <CaptureStore />
            <FormBody />
            <SubmitButton />
          </Form>
        </>
      );
    }
    render(<Host />);

    // Fill form A, then leave a committed error on it.
    await waitFor(() => expect(screen.getByTestId('input-alpha')).toHaveValue('A'));
    await act(async () => setField('alpha', 'edited-A'));

    // Swap to form B (entirely different field-id set → a genuine swap).
    await act(async () => {
      fireEvent.click(screen.getByTestId('to-b'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('input-alpha')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-beta')).not.toBeInTheDocument();
      expect(screen.getByTestId('input-gamma')).toBeInTheDocument();
    });

    // No ghost keys from form A survived into B's store.
    const s = storeState();
    expect(s.values).not.toHaveProperty('alpha');
    expect(s.values).not.toHaveProperty('beta');
    expect(screen.getByTestId('input-gamma')).toHaveValue('G');
    expect(screen.getByTestId('input-delta')).toHaveValue('');

    // Submit: only form B's fields ship; nothing from A leaks. `delta` had no
    // default seed and was never typed, so it never entered the values map — the
    // payload carries the seeded `gamma` alone (an untyped, undefaulted field is
    // absent, not `""`).
    await clickSubmit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ gamma: 'G' });
  });

  it('S2 (contrast): GROWTH — appending a field to the SAME form preserves typed values', async () => {
    const grown = form
      .create(rilConfig, 'grow')
      .add({ id: 'keepMe', type: 'text', props: { label: 'Keep me' } })
      .add({ id: 'later', type: 'text', props: { label: 'Later' } })
      .build();
    const small = form
      .create(rilConfig, 'grow')
      .add({ id: 'keepMe', type: 'text', props: { label: 'Keep me' } })
      .build();

    function Host() {
      const [big, setBig] = useState(false);
      return (
        <>
          <button type="button" data-testid="grow" onClick={() => setBig(true)}>
            grow
          </button>
          <Form of={big ? grown : small} defaults={{ keepMe: 'seed' }}>
            <CaptureStore />
            <FormBody />
          </Form>
        </>
      );
    }
    render(<Host />);

    await waitFor(() => expect(screen.getByTestId('input-keepMe')).toHaveValue('seed'));
    await act(async () => setField('keepMe', 'typed-by-user'));

    // Append `later` — same form id, same field kept: growth, NOT a swap.
    await act(async () => {
      fireEvent.click(screen.getByTestId('grow'));
    });
    await waitFor(() => expect(screen.getByTestId('input-later')).toBeInTheDocument());

    // The user's typed value survived the reconfiguration (the growth contract).
    expect(screen.getByTestId('input-keepMe')).toHaveValue('typed-by-user');
    expect(storeState().values.keepMe).toBe('typed-by-user');
  });

  // --------------------------------------------------------------------------
  // GROUP V — PREFILL + VALIDATION ON SUBMIT (some seeded values invalid)
  // --------------------------------------------------------------------------

  it('V1: a bulk-prefilled form with invalid seeds surfaces errors on EXACTLY the bad fields', async () => {
    const onSubmit = vi.fn();
    renderKyc(
      {
        ...serverPayload(),
        firstName: '', // required → invalid
        email: 'no-at-sign', // custom email rule → invalid
        ssn: '', // US applicant, conditionally required, empty → invalid
      },
      onSubmit
    );

    await waitFor(() => expect(screen.getByTestId('input-lastName')).toHaveValue('Lovelace'));
    await clickSubmit();

    // Errors surface on exactly the three invalid fields, touched (c35df61).
    await waitFor(() => {
      expect(screen.getByTestId('ui-errors-firstName')).toBeInTheDocument();
      expect(screen.getByTestId('ui-errors-email')).toBeInTheDocument();
      expect(screen.getByTestId('ui-errors-ssn')).toBeInTheDocument();
    });
    // Valid seeded fields stay clean.
    expect(hasUiError('lastName')).toBe(false);
    expect(hasUiError('country')).toBe(false);
    // Submit was blocked.
    expect(onSubmit).not.toHaveBeenCalled();

    // Fix the three and resubmit → passes.
    await act(async () => {
      setField('firstName', 'Ada');
      setField('email', 'ada@x.io');
      setField('ssn', '999-99-9999');
    });
    await clickSubmit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  // --------------------------------------------------------------------------
  // GROUP RESEED — runtime `defaultValues` change contract (pinned)
  // --------------------------------------------------------------------------

  it('RESEED-1: a runtime defaultValues change re-seeds UNTOUCHED fields but NOT edited ones', async () => {
    // Pins the isUpgradableDefault contract (FormProvider.tsx:488): a changed
    // default reaches an untouched, un-edited field whose value is still the
    // baseline; an edited field is immune.
    const built = buildKycForm();

    function Host() {
      const [defs, setDefs] = useState<Record<string, unknown>>({
        firstName: 'Original-First',
        lastName: 'Original-Last',
      });
      return (
        <>
          <button
            type="button"
            data-testid="reseed"
            onClick={() => setDefs({ firstName: 'Updated-First', lastName: 'Updated-Last' })}
          >
            reseed
          </button>
          <Form of={built} defaults={defs}>
            <CaptureStore />
            <FormBody />
          </Form>
        </>
      );
    }
    render(<Host />);

    await waitFor(() =>
      expect(screen.getByTestId('input-firstName')).toHaveValue('Original-First')
    );
    // The user edits lastName; leaves firstName untouched.
    await act(async () => setField('lastName', 'User-Typed'));

    // Host pushes a new defaultValues object at runtime.
    await act(async () => {
      fireEvent.click(screen.getByTestId('reseed'));
    });

    await waitFor(() => {
      // Untouched field is upgraded to the new default.
      expect(screen.getByTestId('input-firstName')).toHaveValue('Updated-First');
    });
    // The edited field is preserved — the new default does NOT clobber it.
    expect(screen.getByTestId('input-lastName')).toHaveValue('User-Typed');
  });

  it('RESEED-2: an unchanged runtime defaultValues object re-render is a no-op (no clobber)', async () => {
    const built = buildKycForm();
    const stableDefaults = { firstName: 'Stable' };

    function Host() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <div data-testid="tick">{tick}</div>
          <button type="button" data-testid="rerender" onClick={() => setTick((t) => t + 1)}>
            rerender
          </button>
          {/* Same object reference across renders. */}
          <Form of={built} defaults={stableDefaults}>
            <CaptureStore />
            <FormBody />
          </Form>
        </>
      );
    }
    render(<Host />);

    await waitFor(() => expect(screen.getByTestId('input-firstName')).toHaveValue('Stable'));
    await act(async () => setField('firstName', 'typed-over'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('rerender'));
    });
    await waitFor(() => expect(screen.getByTestId('tick')).toHaveTextContent('1'));

    // A pure re-render must not resurrect the default over the user's input.
    expect(screen.getByTestId('input-firstName')).toHaveValue('typed-over');
  });

  // --------------------------------------------------------------------------
  // GROUP CLR — clear a single field to empty (condition re-evaluation)
  // --------------------------------------------------------------------------

  it('CLR-1: clearing the condition driver back to empty hides the dependent field and drops its committed error', async () => {
    renderKyc({ country: 'US' });

    // US → ssn visible + required. Submit empty to commit an error on it.
    await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());
    await clickSubmit();
    await waitFor(() => expect(screen.getByTestId('ui-errors-ssn')).toBeInTheDocument());

    // Clear country back to '' → ssn's condition (visible when US) flips false.
    await act(async () => setField('country', ''));

    // The dependent field leaves the DOM entirely.
    await waitFor(() => expect(screen.queryByTestId('input-ssn')).not.toBeInTheDocument());

    // Its committed error is cleared from the store (a hidden field must not wedge
    // isValid) — FormProvider's visible→hidden clear.
    await waitFor(() => {
      const s = storeState();
      expect(s.errors.ssn ?? []).toEqual([]);
    });
  });

  it('CLR-2: clearing accountType hides companyName; re-selecting business re-shows it clean', async () => {
    renderKyc({ accountType: 'business', companyName: 'Acme' });

    await waitFor(() => expect(screen.getByTestId('input-companyName')).toHaveValue('Acme'));

    // Clear the driver → companyName hides.
    await act(async () => setField('accountType', ''));
    await waitFor(() => expect(screen.queryByTestId('input-companyName')).not.toBeInTheDocument());

    // Re-select business → the field comes back (its raw value is still held).
    await act(async () => setField('accountType', 'business'));
    await waitFor(() => expect(screen.getByTestId('input-companyName')).toBeInTheDocument());
    expect(hasUiError('companyName')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // GROUP WF — WORKFLOW PREFILL ACROSS STEPS (seed keyed by step id)
  // --------------------------------------------------------------------------

  it('WF-1: multi-step defaults keyed by step id prefill each step; completion projects them all', async () => {
    const onComplete = vi.fn();

    const step1Form = form
      .create(rilConfig, 'personal-form')
      .add({
        id: 'fullName',
        type: 'text',
        props: { label: 'Full name' },
        validation: { validate: required('Name required') },
      })
      .add({ id: 'age', type: 'number', props: { label: 'Age' } })
      .build();

    const step2Form = form
      .create(rilConfig, 'contact-form')
      .add({ id: 'city', type: 'text', props: { label: 'City' } })
      .add({ id: 'subscribed', type: 'checkbox', props: { label: 'Subscribed' } })
      .build();

    const wf = flow
      .create(rilConfig, 'prefill-flow', 'Prefill Flow')
      .addStep({ id: 'personal', title: 'Personal', formConfig: step1Form })
      .addStep({ id: 'contact', title: 'Contact', formConfig: step2Form })
      .build();

    function AllData() {
      const data = useFlowData();
      return <pre data-testid="all-data">{JSON.stringify(data)}</pre>;
    }

    render(
      <Flow
        of={wf}
        defaults={{
          personal: { fullName: 'Ada Lovelace', age: 36 },
          contact: { city: 'London', subscribed: true },
        }}
        onComplete={onComplete}
      >
        <FlowBody />
        <NextButton />
        <PrevButton />
        <AllData />
      </Flow>
    );

    // Step 1 is prefilled.
    await waitFor(() => expect(screen.getByTestId('input-fullName')).toHaveValue('Ada Lovelace'));
    expect(screen.getByTestId('input-age')).toHaveValue(36);

    // Advance — the prefilled required field passes the gate with no typing.
    await act(async () => fireEvent.click(screen.getByTestId('next-btn')));

    // Step 2 is prefilled too.
    await waitFor(() => expect(screen.getByTestId('input-city')).toHaveValue('London'));
    expect(screen.getByTestId('input-subscribed')).toBeChecked();

    // Complete — the projection carries every step's seeded data.
    await act(async () => fireEvent.click(screen.getByTestId('next-btn')));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [data] = onComplete.mock.calls[0] as [Record<string, Record<string, unknown>>];
    expect(data.personal).toEqual({ fullName: 'Ada Lovelace', age: 36 });
    expect(data.contact).toEqual({ city: 'London', subscribed: true });
  });
});
