/**
 * =============================================================================
 * FAR-REACHING E2E — a COMPLETE KYC (Know Your Customer) onboarding workflow.
 *
 * A production-grade fintech flow, 7 steps, with conditional STEP visibility,
 * conditional FIELD visibility, a repeatable with per-row conditionals, a
 * cross-field form-level rule, and persistence:
 *
 *   0. identity        (always)      legalName + dob + nationality (all required)
 *   1. address         (always)      country-driven conditional fields:
 *                                      US    -> ssn + usState (visible + required)
 *                                      DE    -> vatId          (visible + required)
 *                                      other -> passportNo     (visible + required)
 *   2. entity          (always)      entityType ('individual' | 'company')
 *   3. ownership       (company)     REPEATABLE beneficial owners (min 1), each:
 *                                      ownerName (required), ownershipPct,
 *                                      isPEP toggle, pepReason (visible+required
 *                                      only when THAT row's isPEP is on).
 *                                      FORM-LEVEL rule: ownershipPct must sum 100.
 *   4. companyDocs     (company)     incorporationNo + taxId (required)
 *   5. individualDocs  (individual)  idType + idNumber (required)
 *   6. review          (always,last) consent checkbox — must be checked.
 *
 * Every field is painted by an error-aware renderer, so assertions are about
 * what the USER SEES (field.error / field.touched), never a store read standing
 * in for a DOM assertion. The completion payload is asserted as the pure
 * projection of visible answers; hidden steps/fields are absent.
 *
 * Contracts verified in source before asserting:
 *  - Form-level cross-field validation runs over the currently-VISIBLE flat
 *    values incl. repeatable composite keys `owners[k0].ownershipPct`
 *    (useFormValidationWithStore.ts:369 evaluateFormLevel). A repeatable
 *    composite key can never equal a static field id, so a cross-field issue
 *    over the repeatable routes to `__form__` (collectKnownFieldIds comment,
 *    :48) — read via useFormErrors().
 *  - A field's conditional visibility/required scope to its repeatable row
 *    (resolveFieldConditionalBehavior), so per-row PEP never leaks across rows.
 *  - Hidden fields are dropped from the submit/completion payload; the hidden
 *    step's whole slice is absent (submit-visibility projection).
 *  - Step visibility evaluates against LIVE merged cross-step data, so toggling
 *    entityType adds/removes the company/individual steps and the visible count.
 *  - goPrevious runs NO validation (useWorkflowNavigation goPrevious); goNext is
 *    reached through the form submit, so validation gates it.
 *  - onWorkflowComplete(data, meta) — meta carries ordered
 *    { visitedSteps, skippedSteps, passedSteps }.
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LocalStorageAdapter, custom, flow, form, required, ril, when } from 'rilaykit';
import { Flow, FlowBody, useFlow, useFlowData, useFlowSteps, useFormErrors } from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton } from '../_setup/nav-buttons';
import { RepeatableControls } from '../_setup/test-helpers';

// ============================================================================
// ERROR-AWARE RENDERERS — the whole point: assert what the user SEES.
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

function ErrorAwareSelect({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
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
  const errors = field?.error ?? [];
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

/** A form-level error banner rendered as an (input-less) field of the form,
 *  so useFormErrors() reads the mounted step form's `__form__` bucket. */
function FormErrorBanner() {
  const errors = useFormErrors();
  if (errors.length === 0) return null;
  return (
    <div data-testid="form-errors">
      {errors.map((err, i) => (
        <span key={err.message} data-testid={`form-error-${i}`}>
          {err.message}
        </span>
      ))}
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
  })
  .component('banner', { name: 'Banner', renderer: FormErrorBanner, defaultProps: {} });

// ============================================================================
// CROSS-FIELD RULE — beneficial-owner percentages must total exactly 100.
// Emits a PATH-LESS issue -> routes to `__form__` -> useFormErrors() banner.
// ============================================================================

const ownershipSumSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'kyc',
    validate: (value: unknown) => {
      const data = value as Record<string, unknown>;
      const pcts = Object.entries(data)
        .filter(([key]) => /^owners\[[^\]]+\]\.ownershipPct$/.test(key))
        .map(([, v]) => (typeof v === 'number' ? v : Number(v) || 0));
      if (pcts.length === 0) return { value };
      const total = pcts.reduce((a, b) => a + b, 0);
      if (total !== 100) {
        return { issues: [{ message: `Ownership must total 100% (currently ${total}%)` }] };
      }
      return { value };
    },
  },
};

// ============================================================================
// FORM CONFIGS (rebuilt per flow so no state leaks across tests)
// ============================================================================

const WORKFLOW_ID = 'kyc-onboarding';
const STORAGE_KEY = `rilay_workflow_${WORKFLOW_ID}`;

function buildForms() {
  const identityForm = form
    .create(rilConfig, 'identity-form')
    .add({
      id: 'legalName',
      type: 'text',
      props: { label: 'Legal name' },
      validation: { validate: required('Legal name is required') },
    })
    .add({
      id: 'dob',
      type: 'text',
      props: { label: 'Date of birth' },
      validation: { validate: required('Date of birth is required') },
    })
    .add({
      id: 'nationality',
      type: 'select',
      props: {
        label: 'Nationality',
        options: [
          { value: '', label: 'Select...' },
          { value: 'US', label: 'United States' },
          { value: 'DE', label: 'Germany' },
          { value: 'FR', label: 'France' },
          { value: 'GB', label: 'United Kingdom' },
        ],
      },
      validation: { validate: required('Nationality is required') },
    })
    .build();

  const addressForm = form
    .create(rilConfig, 'address-form')
    .add({
      id: 'country',
      type: 'select',
      props: {
        label: 'Country of residence',
        options: [
          { value: '', label: 'Select...' },
          { value: 'US', label: 'United States' },
          { value: 'DE', label: 'Germany' },
          { value: 'other', label: 'Other' },
        ],
      },
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
      id: 'usState',
      type: 'text',
      props: { label: 'State' },
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
    .add({
      id: 'passportNo',
      type: 'text',
      props: { label: 'Passport number' },
      conditions: {
        visible: when('country').equals('other'),
        required: when('country').equals('other'),
      },
    })
    .build();

  const entityForm = form
    .create(rilConfig, 'entity-form')
    .add({
      id: 'entityType',
      type: 'select',
      props: {
        label: 'Entity type',
        options: [
          { value: '', label: 'Select...' },
          { value: 'individual', label: 'Individual' },
          { value: 'company', label: 'Company' },
        ],
      },
      validation: { validate: required('Entity type is required') },
    })
    .build();

  const ownershipForm = form
    .create(rilConfig, 'ownership-form')
    .add({ id: 'summary', type: 'banner', props: {} })
    .addRepeatable('owners', (r) =>
      r
        .add({
          id: 'ownerName',
          type: 'text',
          props: { label: 'Owner name' },
          validation: { validate: required('Owner name is required') },
        })
        .add({ id: 'ownershipPct', type: 'number', props: { label: 'Ownership %' } })
        .add({ id: 'isPEP', type: 'checkbox', props: { label: 'Politically exposed person?' } })
        .add({
          id: 'pepReason',
          type: 'text',
          props: { label: 'PEP explanation' },
          conditions: {
            visible: when('isPEP').equals(true),
            required: when('isPEP').equals(true),
          },
        })
        .min(1)
        .defaultValue({ ownerName: '', ownershipPct: 0, isPEP: false, pepReason: '' })
    )
    // onChange so the cross-field sum rule re-runs live as the user edits a %.
    .setValidation({ mode: 'onChange', validate: ownershipSumSchema })
    .build();

  const companyDocsForm = form
    .create(rilConfig, 'company-docs-form')
    .add({
      id: 'incorporationNo',
      type: 'text',
      props: { label: 'Certificate of incorporation no.' },
      validation: { validate: required('Incorporation number is required') },
    })
    .add({
      id: 'taxId',
      type: 'text',
      props: { label: 'Company tax ID' },
      validation: { validate: required('Tax ID is required') },
    })
    .build();

  const individualDocsForm = form
    .create(rilConfig, 'individual-docs-form')
    .add({
      id: 'idType',
      type: 'select',
      props: {
        label: 'ID document type',
        options: [
          { value: '', label: 'Select...' },
          { value: 'passport', label: 'Passport' },
          { value: 'national_id', label: 'National ID' },
        ],
      },
      validation: { validate: required('ID type is required') },
    })
    .add({
      id: 'idNumber',
      type: 'text',
      props: { label: 'ID number' },
      validation: { validate: required('ID number is required') },
    })
    .build();

  const reviewForm = form
    .create(rilConfig, 'review-form')
    .add({
      id: 'consent',
      type: 'checkbox',
      props: { label: 'I certify this information is accurate' },
      validation: { validate: custom<boolean>((v) => v === true, 'You must certify to continue') },
    })
    .build();

  return {
    identityForm,
    addressForm,
    entityForm,
    ownershipForm,
    companyDocsForm,
    individualDocsForm,
    reviewForm,
  };
}

function buildFlow({ persist }: { persist?: LocalStorageAdapter } = {}) {
  const {
    identityForm,
    addressForm,
    entityForm,
    ownershipForm,
    companyDocsForm,
    individualDocsForm,
    reviewForm,
  } = buildForms();

  const builder = flow
    .create(rilConfig, WORKFLOW_ID, 'KYC Onboarding', 'Full customer due-diligence flow')
    .addStep({ id: 'identity', title: 'Identity', formConfig: identityForm })
    .addStep({ id: 'address', title: 'Address', formConfig: addressForm })
    .addStep({ id: 'entity', title: 'Entity type', formConfig: entityForm })
    .addStep({
      id: 'ownership',
      title: 'Beneficial owners',
      formConfig: ownershipForm,
      conditions: { visible: when('entityType').equals('company').build() },
    })
    .addStep({
      id: 'companyDocs',
      title: 'Company documents',
      formConfig: companyDocsForm,
      conditions: { visible: when('entityType').equals('company').build() },
    })
    .addStep({
      id: 'individualDocs',
      title: 'Identity documents',
      formConfig: individualDocsForm,
      conditions: { visible: when('entityType').equals('individual').build() },
    })
    .addStep({ id: 'review', title: 'Review & consent', formConfig: reviewForm });

  if (persist) {
    return builder
      .configure({
        persistence: { adapter: persist, options: { autoPersist: true, debounceMs: 0 } },
      })
      .build();
  }
  return builder.build();
}

// ============================================================================
// PROBES / HELPERS
// ============================================================================

type CompletionMeta = {
  visitedSteps: string[];
  skippedSteps: string[];
  passedSteps: string[];
};

function NavProbe() {
  const { workflowState, currentStep, context } = useFlow();
  const { steps, currentIndex } = useFlowSteps();
  const allData = useFlowData();
  return (
    <div>
      <span data-testid="cur-id">{currentStep?.id}</span>
      <span data-testid="cur-idx">{workflowState.currentStepIndex}</span>
      <span data-testid="visible-count">{steps.length}</span>
      <span data-testid="visible-idx">{currentIndex}</span>
      <span data-testid="visible-ids">{steps.map((s) => s.id).join(',')}</span>
      <span data-testid="is-last">{context.isLastStep ? 'true' : 'false'}</span>
      <pre data-testid="all-data">{JSON.stringify(allData)}</pre>
    </div>
  );
}

function renderFlow(
  workflowConfig: ReturnType<typeof buildFlow>,
  onComplete?: (data: Record<string, unknown>, meta: CompletionMeta) => void
) {
  return render(
    <Flow of={workflowConfig} onComplete={onComplete}>
      <FlowBody />
      <NextButton />
      <PrevButton />
      <RepeatableControls repeatableId="owners" />
      <NavProbe />
    </Flow>
  );
}

async function clickNext() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('next-btn'));
  });
}
async function clickPrev() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('prev-btn'));
  });
}
async function addOwner() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('repeatable-append-owners'));
  });
}
function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
function setCheckbox(id: string, checked: boolean) {
  const el = screen.getByTestId(`input-${id}`) as HTMLInputElement;
  if (el.checked !== checked) fireEvent.click(el);
}
async function expectStep(id: string) {
  await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent(id));
}
function allData(): Record<string, any> {
  return JSON.parse(screen.getByTestId('all-data').textContent || '{}');
}
function hasUiError(id: string) {
  return screen.queryByTestId(`ui-errors-${id}`) !== null;
}
function readPersisted(): Record<string, any> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).data : null;
}

async function fillIdentity(name = 'Acme Founder') {
  await waitFor(() => expect(screen.getByTestId('input-legalName')).toBeInTheDocument());
  await act(async () => {
    setField('legalName', name);
    setField('dob', '1980-01-01');
    setField('nationality', 'US');
  });
  await waitFor(() => expect(screen.getByTestId('input-legalName')).toHaveValue(name));
}

async function fillAddressUS() {
  await waitFor(() => expect(screen.getByTestId('input-country')).toBeInTheDocument());
  await act(async () => setField('country', 'US'));
  await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());
  await act(async () => {
    setField('ssn', '123-45-6789');
    setField('usState', 'CA');
  });
}

async function setEntity(type: 'individual' | 'company') {
  await waitFor(() => expect(screen.getByTestId('input-entityType')).toBeInTheDocument());
  await act(async () => setField('entityType', type));
  await waitFor(() => expect(screen.getByTestId('input-entityType')).toHaveValue(type));
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — KYC onboarding: full production workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // GROUP H — happy path (full projection, meta correctness)
  // --------------------------------------------------------------------------

  it('H1: company path completes with the exact projection (hidden steps/fields absent)', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await fillIdentity();
    await clickNext();
    await expectStep('address');

    await fillAddressUS();
    await clickNext();
    await expectStep('entity');

    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // Row 0 (the min=1 default row).
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '60');
    });
    // Add a second owner and split the remaining 40%.
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '40');
    });
    // Sum is exactly 100 -> the form-level banner must be clear.
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());

    await clickNext();
    await expectStep('companyDocs');
    await act(async () => {
      setField('incorporationNo', 'INC-123');
      setField('taxId', 'TAX-9');
    });
    await clickNext();
    await expectStep('review');

    await act(async () => setCheckbox('consent', true));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [data, meta] = onComplete.mock.calls[0] as [Record<string, any>, CompletionMeta];

    expect(data.identity).toEqual({
      legalName: 'Acme Founder',
      dob: '1980-01-01',
      nationality: 'US',
    });
    // Only the US conditional fields survive; vatId/passportNo never shipped.
    expect(data.address).toEqual({ country: 'US', ssn: '123-45-6789', usState: 'CA' });
    expect(data.entity).toEqual({ entityType: 'company' });
    // Repeatable projected as an array; hidden pepReason dropped per row.
    expect(data.ownership.owners).toEqual([
      { ownerName: 'Alice', ownershipPct: 60, isPEP: false },
      { ownerName: 'Bob', ownershipPct: 40, isPEP: false },
    ]);
    expect(data.companyDocs).toEqual({ incorporationNo: 'INC-123', taxId: 'TAX-9' });
    expect(data.review).toEqual({ consent: true });
    // The individual-only step is absent entirely.
    expect(data.individualDocs).toBeUndefined();

    // meta: nothing skipped; individualDocs never visited.
    expect(meta.skippedSteps).toEqual([]);
    expect(meta.visitedSteps).not.toContain('individualDocs');
    expect(meta.visitedSteps).toEqual(
      expect.arrayContaining(['address', 'entity', 'ownership', 'companyDocs', 'review'])
    );
  });

  it('H2: individual path completes; ownership + companyDocs absent, individualDocs present', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await fillIdentity('Jane Doe');
    await clickNext();
    await expectStep('address');

    // DE resident -> vatId is the only conditional field.
    await waitFor(() => expect(screen.getByTestId('input-country')).toBeInTheDocument());
    await act(async () => setField('country', 'DE'));
    await waitFor(() => expect(screen.getByTestId('input-vatId')).toBeInTheDocument());
    expect(screen.queryByTestId('input-ssn')).not.toBeInTheDocument();
    await act(async () => setField('vatId', 'DE811'));
    await clickNext();
    await expectStep('entity');

    await setEntity('individual');
    await clickNext();
    // ownership + companyDocs skipped -> straight to individualDocs.
    await expectStep('individualDocs');

    await act(async () => {
      setField('idType', 'passport');
      setField('idNumber', 'P-77');
    });
    await clickNext();
    await expectStep('review');
    await act(async () => setCheckbox('consent', true));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [data, meta] = onComplete.mock.calls[0] as [Record<string, any>, CompletionMeta];

    expect(data.address).toEqual({ country: 'DE', vatId: 'DE811' });
    expect(data.entity).toEqual({ entityType: 'individual' });
    expect(data.individualDocs).toEqual({ idType: 'passport', idNumber: 'P-77' });
    expect(data.ownership).toBeUndefined();
    expect(data.companyDocs).toBeUndefined();
    expect(meta.visitedSteps).toContain('individualDocs');
    expect(meta.visitedSteps).not.toContain('ownership');
  });

  // --------------------------------------------------------------------------
  // GROUP N — navigation: back / next / back again; data survival
  // --------------------------------------------------------------------------

  it('N1: values persist in the inputs across every back/next hop', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await expectStep('address');
    await fillAddressUS();

    // Back to identity: values re-seeded into the real inputs.
    await clickPrev();
    await expectStep('identity');
    await waitFor(() => {
      expect(screen.getByTestId('input-legalName')).toHaveValue('Acme Founder');
      expect(screen.getByTestId('input-nationality')).toHaveValue('US');
    });

    // Forward again: the address step's conditional values survived the trip.
    await clickNext();
    await expectStep('address');
    await waitFor(() => {
      expect(screen.getByTestId('input-country')).toHaveValue('US');
      expect(screen.getByTestId('input-ssn')).toHaveValue('123-45-6789');
      expect(screen.getByTestId('input-usState')).toHaveValue('CA');
    });
  });

  it('N2: back -> edit -> next: the downstream allData reflects the UPDATED value', async () => {
    renderFlow(buildFlow());

    await fillIdentity('Old Name');
    await clickNext();
    await expectStep('address');
    expect(allData().identity.legalName).toBe('Old Name');

    await clickPrev();
    await expectStep('identity');
    await act(async () => setField('legalName', 'New Name'));
    await waitFor(() => expect(screen.getByTestId('input-legalName')).toHaveValue('New Name'));

    await clickNext();
    await expectStep('address');
    expect(allData().identity.legalName).toBe('New Name');
  });

  it('N3: landing on a step via back does not spray errors on it', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await expectStep('address');
    // Leave the (required) conditional US fields untouched, go back.
    await act(async () => setField('country', 'US'));
    await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());

    await clickPrev();
    await expectStep('identity');
    // Neither the step we left nor the one we landed on shows an error.
    expect(hasUiError('legalName')).toBe(false);
    expect(hasUiError('nationality')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // GROUP E — error visibility across navigation
  // --------------------------------------------------------------------------

  it('E1: an empty required field blocks next with the error VISIBLE, still on the step', async () => {
    renderFlow(buildFlow());

    await waitFor(() => expect(screen.getByTestId('input-legalName')).toBeInTheDocument());
    // dob + nationality empty -> next blocked.
    await act(async () => setField('legalName', 'Only Name'));
    await clickNext();

    await waitFor(() => {
      expect(screen.getByTestId('ui-error-dob-0')).toHaveTextContent('Date of birth is required');
      expect(screen.getByTestId('ui-error-nationality-0')).toHaveTextContent(
        'Nationality is required'
      );
    });
    expect(screen.getByTestId('cur-id')).toHaveTextContent('identity');
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
  });

  it('E2: fixing the fields lets next through; going back does not resurrect the error', async () => {
    renderFlow(buildFlow());

    await waitFor(() => expect(screen.getByTestId('input-legalName')).toBeInTheDocument());
    await clickNext(); // all empty -> blocked
    await waitFor(() => expect(screen.getByTestId('ui-errors-legalName')).toBeInTheDocument());

    await fillIdentity();
    await clickNext();
    await expectStep('address');
    expect(hasUiError('legalName')).toBe(false);

    // Back onto the once-errored step: the committed error is not redisplayed.
    await clickPrev();
    await expectStep('identity');
    expect(hasUiError('legalName')).toBe(false);
    expect(hasUiError('dob')).toBe(false);
    expect(screen.getByTestId('input-legalName')).toHaveValue('Acme Founder');
  });

  it('E3: an error raised on a later step is gone after back-then-forward re-entry', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await expectStep('address');

    // Choose US (adds required ssn/usState) then submit with them empty.
    await act(async () => setField('country', 'US'));
    await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('ui-errors-ssn')).toBeInTheDocument());
    expect(screen.getByTestId('cur-id')).toHaveTextContent('address');

    // Back to identity, then forward again: the stale ssn error must not survive
    // the step remount.
    await clickPrev();
    await expectStep('identity');
    await clickNext();
    await expectStep('address');
    expect(hasUiError('ssn')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // GROUP F — fields disappear correctly (conditional FIELD visibility)
  // --------------------------------------------------------------------------

  it('F1: flipping country removes hidden fields from the DOM and drops them from the payload', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await fillIdentity();
    await clickNext();
    await expectStep('address');

    // US -> ssn + usState visible; DE/other fields hidden.
    await act(async () => setField('country', 'US'));
    await waitFor(() => {
      expect(screen.getByTestId('input-ssn')).toBeInTheDocument();
      expect(screen.getByTestId('input-usState')).toBeInTheDocument();
    });
    await act(async () => {
      setField('ssn', 'STALE-SSN');
      setField('usState', 'NY');
    });

    // Flip to DE: ssn/usState leave the DOM, vatId appears.
    await act(async () => setField('country', 'DE'));
    await waitFor(() => {
      expect(screen.queryByTestId('input-ssn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-usState')).not.toBeInTheDocument();
      expect(screen.getByTestId('input-vatId')).toBeInTheDocument();
    });
    await act(async () => setField('vatId', 'DE99'));

    // Note: the LIVE useFlowData() still holds the raw (now-hidden) US values —
    // visibility projection happens at the payload boundary, not live. So the
    // drop is asserted where the contract lives: the completion payload.
    await clickNext();
    await expectStep('entity');
    await setEntity('individual');
    await clickNext();
    await expectStep('individualDocs');
    await act(async () => {
      setField('idType', 'passport');
      setField('idNumber', 'P-1');
    });
    await clickNext();
    await expectStep('review');
    await act(async () => setCheckbox('consent', true));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Only the still-visible fields survive; the stale US values are dropped.
    expect(onComplete.mock.calls[0][0].address).toEqual({ country: 'DE', vatId: 'DE99' });
  });

  it('F2: a re-shown field re-appears with a clean slate (no resurrected stale error)', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await expectStep('address');

    // US, then submit empty -> ssn error painted.
    await act(async () => setField('country', 'US'));
    await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('ui-errors-ssn')).toBeInTheDocument());

    // Flip to DE -> ssn hidden, its error gone from the UI; and 'other' back.
    await act(async () => setField('country', 'DE'));
    await waitFor(() => expect(screen.queryByTestId('input-ssn')).not.toBeInTheDocument());

    // Re-show US: ssn returns with a CLEAN slate — no resurrected error.
    await act(async () => setField('country', 'US'));
    await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());
    expect(hasUiError('ssn')).toBe(false);
  });

  it('F3: per-row PEP explanation shows/hides ONLY within its own row', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await expectStep('address');
    await fillAddressUS();
    await clickNext();
    await expectStep('entity');
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // Two owners.
    await act(async () => setField('owners[k0].ownerName', 'Alice'));
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await act(async () => setField('owners[k1].ownerName', 'Bob'));

    // Neither row shows the PEP explanation yet.
    expect(screen.queryByTestId('field-owners[k0].pepReason')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-owners[k1].pepReason')).not.toBeInTheDocument();

    // Toggle isPEP on row 0 ONLY.
    await act(async () => setCheckbox('owners[k0].isPEP', true));
    await waitFor(() =>
      expect(screen.getByTestId('field-owners[k0].pepReason')).toBeInTheDocument()
    );
    // Row 1 stays clean — the per-row condition never leaks across rows.
    expect(screen.queryByTestId('field-owners[k1].pepReason')).not.toBeInTheDocument();

    // Toggle back off -> row 0's explanation disappears again.
    await act(async () => setCheckbox('owners[k0].isPEP', false));
    await waitFor(() =>
      expect(screen.queryByTestId('field-owners[k0].pepReason')).not.toBeInTheDocument()
    );
  });

  it('F4: a per-row PEP explanation is required when its toggle is on, and ships in the payload', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // One owner, PEP on, explanation left empty, 100% -> next blocked on pepReason.
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '100');
      setCheckbox('owners[k0].isPEP', true);
    });
    await waitFor(() =>
      expect(screen.getByTestId('field-owners[k0].pepReason')).toBeInTheDocument()
    );
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('ui-errors-owners[k0].pepReason')).toBeInTheDocument()
    );
    expect(screen.getByTestId('cur-id')).toHaveTextContent('ownership');

    // Fill the explanation -> next proceeds, and it ships.
    await act(async () => setField('owners[k0].pepReason', 'Former minister'));
    await clickNext();
    await expectStep('companyDocs');
    await act(async () => {
      setField('incorporationNo', 'INC-1');
      setField('taxId', 'TAX-1');
    });
    await clickNext();
    await expectStep('review');
    await act(async () => setCheckbox('consent', true));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const data = onComplete.mock.calls[0][0] as Record<string, any>;
    expect(data.ownership.owners).toEqual([
      { ownerName: 'Alice', ownershipPct: 100, isPEP: true, pepReason: 'Former minister' },
    ]);
  });

  // --------------------------------------------------------------------------
  // GROUP S — conditional STEP traversal (individual <-> company)
  // --------------------------------------------------------------------------

  it('S1: toggling entityType adds/removes the company/individual steps and the visible count', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await expectStep('entity');

    // Before choosing: none of the conditional steps are visible.
    await waitFor(() => {
      expect(screen.getByTestId('visible-count')).toHaveTextContent('4');
      expect(screen.getByTestId('visible-ids')).toHaveTextContent('identity,address,entity,review');
    });

    // Company -> ownership + companyDocs appear.
    await setEntity('company');
    await waitFor(() => {
      expect(screen.getByTestId('visible-count')).toHaveTextContent('6');
      expect(screen.getByTestId('visible-ids')).toHaveTextContent(
        'identity,address,entity,ownership,companyDocs,review'
      );
    });

    // Individual -> those two go, individualDocs appears instead.
    await setEntity('individual');
    await waitFor(() => {
      expect(screen.getByTestId('visible-count')).toHaveTextContent('5');
      expect(screen.getByTestId('visible-ids')).toHaveTextContent(
        'identity,address,entity,individualDocs,review'
      );
    });
  });

  it('S2: next/back traverse only VISIBLE steps for each entity type', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('individual');

    // Forward skips the hidden company steps.
    await clickNext();
    await expectStep('individualDocs');
    await act(async () => {
      setField('idType', 'national_id');
      setField('idNumber', 'ID-5');
    });
    await clickNext();
    await expectStep('review');

    // Back returns to individualDocs (not companyDocs), value intact.
    await clickPrev();
    await expectStep('individualDocs');
    await waitFor(() => expect(screen.getByTestId('input-idNumber')).toHaveValue('ID-5'));

    // Back again lands on entity, skipping the hidden company steps.
    await clickPrev();
    await expectStep('entity');
  });

  // --------------------------------------------------------------------------
  // GROUP C — cross-field form-level rule (ownership must sum to 100)
  // --------------------------------------------------------------------------

  it('C1: a bad ownership sum blocks next with the banner visible, and clears LIVE on correction', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // Two owners summing to 90 -> the form-level banner appears (mode onChange).
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '50');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '40');
    });
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('Ownership must total 100%')
    );

    // Next is blocked while the sum is wrong.
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('currently 90%')
    );
    expect(screen.getByTestId('cur-id')).toHaveTextContent('ownership');

    // Correct Bob to 50 -> sum 100 -> the banner clears live, without a resubmit.
    await act(async () => setField('owners[k1].ownershipPct', '50'));
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());

    // And now next proceeds.
    await clickNext();
    await expectStep('companyDocs');
  });

  it('C2: removing a repeatable row re-runs the cross-field sum rule live (banner clears on removal)', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // Alice 100, then add Bob 60 -> sum 160 -> banner.
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '100');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '60');
    });
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('currently 160%')
    );

    // Remove Bob's row -> the surviving sum is exactly 100. The structural edit
    // re-runs the cross-field rule, so the banner clears LIVE with no further
    // field event (a KYC user who fixes the total by DELETING an owner must not
    // be left staring at a stale error).
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-remove-owners-k1'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('1')
    );
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());

    // And the single 100% owner passes the gate.
    await clickNext();
    await expectStep('companyDocs');
  });

  // --------------------------------------------------------------------------
  // GROUP R — repeatable beneficial owners (isolation, no error shifting)
  // --------------------------------------------------------------------------

  it('R1: a per-row required error shows only on its row and does not leak to siblings', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // Three owners; fill names on k0 + k2, leave k1's name empty.
    await act(async () => setField('owners[k0].ownerName', 'Alice'));
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('3')
    );
    await act(async () => {
      setField('owners[k2].ownerName', 'Carol');
      // Make the sum valid so the block is unambiguously the missing name.
      setField('owners[k0].ownershipPct', '50');
      setField('owners[k2].ownershipPct', '50');
    });

    await clickNext();
    // Only row k1 shows the required error.
    await waitFor(() =>
      expect(screen.getByTestId('ui-errors-owners[k1].ownerName')).toBeInTheDocument()
    );
    expect(hasUiError('owners[k0].ownerName')).toBe(false);
    expect(hasUiError('owners[k2].ownerName')).toBe(false);
    expect(screen.getByTestId('cur-id')).toHaveTextContent('ownership');
  });

  it('R2: removing an errored row does not shift its error onto a sibling', async () => {
    renderFlow(buildFlow());

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    // k0 valid, k1 empty-name -> submit paints the error on k1.
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '100');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('ui-errors-owners[k1].ownerName')).toBeInTheDocument()
    );

    // Remove the errored row k1 -> survivor k0 stays clean, no error shifted.
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-remove-owners-k1'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('1');
      expect(screen.queryByTestId('input-owners[k1].ownerName')).not.toBeInTheDocument();
    });
    expect(hasUiError('owners[k0].ownerName')).toBe(false);

    // The form is now passable (single 100% owner with a name).
    await clickNext();
    await expectStep('companyDocs');
  });

  // --------------------------------------------------------------------------
  // GROUP P — persistence mid-KYC (unmount / remount = reload)
  // --------------------------------------------------------------------------

  it('P1: unmount/remount resumes at the right step with all data, repeatable rows and order', async () => {
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '30');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '70');
    });

    // Wait for the autosave to capture the ownership step (index 3).
    await waitFor(() => {
      const p = readPersisted();
      expect(p?.currentStepIndex).toBe(3);
      expect(p?.allData?.ownership?.['owners[k1].ownerName']).toBe('Bob');
    });

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    // Restored onto the ownership step.
    await waitFor(() => {
      expect(screen.getByTestId('cur-id')).toHaveTextContent('ownership');
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('3');
    });
    // Both rows, values and order restored.
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    await waitFor(() => {
      expect(screen.getByTestId('input-owners[k0].ownerName')).toHaveValue('Alice');
      expect(screen.getByTestId('input-owners[k0].ownershipPct')).toHaveValue(30);
      expect(screen.getByTestId('input-owners[k1].ownerName')).toHaveValue('Bob');
      expect(screen.getByTestId('input-owners[k1].ownershipPct')).toHaveValue(70);
    });

    // Cross-step slices restored too.
    const data = allData();
    expect(data.identity).toEqual(
      expect.objectContaining({ legalName: 'Acme Founder', nationality: 'US' })
    );
    expect(data.address).toEqual(expect.objectContaining({ country: 'US', ssn: '123-45-6789' }));
    expect(data.entity).toEqual({ entityType: 'company' });
  });

  it('P2: special values (number %, boolean isPEP, per-row PEP text) survive a reload', async () => {
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();
    await expectStep('ownership');

    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '100');
      setCheckbox('owners[k0].isPEP', true);
    });
    await waitFor(() =>
      expect(screen.getByTestId('field-owners[k0].pepReason')).toBeInTheDocument()
    );
    await act(async () => setField('owners[k0].pepReason', 'Senator'));

    await waitFor(() => {
      const p = readPersisted();
      expect(p?.allData?.ownership?.['owners[k0].isPEP']).toBe(true);
      expect(p?.allData?.ownership?.['owners[k0].ownershipPct']).toBe(100);
      expect(p?.allData?.ownership?.['owners[k0].pepReason']).toBe('Senator');
    });

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('ownership'));
    await waitFor(() => {
      // Boolean restored -> the conditional PEP field is shown again.
      expect(screen.getByTestId('input-owners[k0].isPEP')).toBeChecked();
      expect(screen.getByTestId('input-owners[k0].ownershipPct')).toHaveValue(100);
      expect(screen.getByTestId('input-owners[k0].pepReason')).toHaveValue('Senator');
    });
  });

  it('P3: completing a persisted KYC clears storage; a fresh mount starts empty', async () => {
    const onComplete = vi.fn();
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }), onComplete);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('individual');
    await clickNext();
    await expectStep('individualDocs');
    await act(async () => {
      setField('idType', 'passport');
      setField('idNumber', 'P-1');
    });
    await waitFor(() => expect(readPersisted()).not.toBeNull());

    await clickNext();
    await expectStep('review');
    await act(async () => setCheckbox('consent', true));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Completion clears the persisted record.
    await waitFor(() => expect(readPersisted()).toBeNull());

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));
    await waitFor(() => {
      expect(screen.getByTestId('cur-id')).toHaveTextContent('identity');
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
    });
    expect(screen.getByTestId('input-legalName')).toHaveValue('');
  });

  // --------------------------------------------------------------------------
  // GROUP X — consent gate on the final step
  // --------------------------------------------------------------------------

  it('X1: the review step refuses to complete until consent is checked', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('individual');
    await clickNext();
    await expectStep('individualDocs');
    await act(async () => {
      setField('idType', 'passport');
      setField('idNumber', 'P-9');
    });
    await clickNext();
    await expectStep('review');

    // Unchecked consent -> completion blocked, error visible, still on review.
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-consent-0')).toHaveTextContent(
        'You must certify to continue'
      )
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('cur-id')).toHaveTextContent('review');

    // Check it -> completes.
    await act(async () => setCheckbox('consent', true));
    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
