/**
 * =============================================================================
 * FAR-REACHING E2E — WCAG 2.1 AA accessibility enablement for a KYC form.
 *
 * RilayKit is HEADLESS: it renders no markup of its own, it EXPOSES field/form
 * state and lets the host paint the accessible UI. A Silicon-Valley customer
 * has hard a11y requirements, so the question this suite answers is narrow and
 * concrete: **is the exposed surface sufficient for a host to build a genuinely
 * screen-reader-accessible KYC form?**
 *
 * The strategy is cartesian: build ONE real accessible renderer set on top of
 * ONLY the state RilayKit exposes to a component renderer, then assert — via
 * real ARIA queries a screen reader would consume (`getByRole`, `aria-invalid`,
 * `role="alert"`, accessible descriptions) — that every WCAG wiring works
 * end-to-end.
 *
 * EXPOSED SURFACE VERIFIED IN SOURCE BEFORE ASSERTING
 * (packages/forms/src/components/FormField.tsx:232-269 — the ComponentRenderContext):
 *   field.value        unknown
 *   field.onChange     (v) => Promise<void>
 *   field.onBlur       () => Promise<void>
 *   field.error        FieldError[]           ← drives aria-invalid / role=alert
 *   field.disabled     boolean
 *   field.isValidating boolean                ← from validationState === 'validating'
 *   field.touched      boolean                ← drives premature-error gating
 *   conditions.visible  boolean
 *   conditions.disabled boolean               ← drives aria-disabled
 *   conditions.required boolean               ← drives aria-required
 *   conditions.readonly boolean               ← drives aria-readonly
 *   id                 string (composite `owners[k0].ownerName` for rep. rows)
 *   meta               component meta
 * Form-level bucket: useFormErrors() → the reserved `__form__` errors
 *   (packages/forms/src/stores/formStoreContext.ts:57).
 * Submit verdict: useForm().submit() => Promise<boolean>
 *   (packages/forms/src/components/FormProvider.tsx:44).
 *
 * NOTE the granular `validationState` ('valid' | 'invalid' | 'idle') is NOT
 * forwarded to the renderer — only the derived `isValidating` boolean is
 * (FormField.tsx:242). aria-invalid therefore derives from `field.error.length`,
 * which is the correct WCAG signal anyway (an error message MUST accompany
 * aria-invalid="true"); this is noted, not a gap.
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { flow, form, required, ril, when } from 'rilaykit';
import {
  Flow,
  FlowBody,
  FormBody,
  FormProvider,
  useFlowSteps,
  useForm,
  useFormErrors,
  useRepeatableField,
} from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// THE ACCESSIBLE RENDERER — built ONLY from the exposed ComponentRenderContext.
// This is exactly what a host with WCAG requirements would author.
// ----------------------------------------------------------------------------
// Wiring:
//   aria-invalid    ← field.error.length > 0
//   aria-describedby← points at the error node's stable id, ONLY when errored
//   role="alert"    ← the error node, so SRs announce it the moment it appears
//   aria-required   ← conditions.required
//   aria-disabled   ← conditions.disabled     (+ native disabled)
//   aria-readonly   ← conditions.readonly      (+ native readOnly)
//   label htmlFor    ← id                       (accessible name)
// ============================================================================

/** Stable, per-field error-node id — derived purely from the exposed field id. */
function errorId(id: string): string {
  return `${id}-error`;
}

function AccessibleText({ id, props, field, conditions }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  const hasError = errors.length > 0;
  const label = props?.label ? String(props.label) : id;
  return (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
        aria-invalid={hasError}
        aria-required={Boolean(conditions?.required)}
        aria-disabled={Boolean(conditions?.disabled)}
        aria-readonly={Boolean(conditions?.readonly)}
        aria-describedby={hasError ? errorId(id) : undefined}
        aria-busy={field?.isValidating || undefined}
        disabled={Boolean(conditions?.disabled)}
        readOnly={Boolean(conditions?.readonly)}
      />
      {hasError ? (
        <div id={errorId(id)} role="alert">
          {errors[0].message}
        </div>
      ) : null}
    </div>
  );
}

function AccessibleSelect({ id, props, field, conditions }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  const hasError = errors.length > 0;
  const label = props?.label ? String(props.label) : id;
  const options = (props?.options as Array<{ value: string; label: string }> | undefined) ?? [];
  return (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
        aria-invalid={hasError}
        aria-required={Boolean(conditions?.required)}
        aria-describedby={hasError ? errorId(id) : undefined}
        disabled={Boolean(conditions?.disabled)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasError ? (
        <div id={errorId(id)} role="alert">
          {errors[0].message}
        </div>
      ) : null}
    </div>
  );
}

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: AccessibleText, defaultProps: { label: '' } })
  .component('select', {
    name: 'Select',
    renderer: AccessibleSelect,
    defaultProps: { label: '', options: [] },
  });

// ============================================================================
// CROSS-FIELD RULE (form-level) — emits a PATH-LESS issue -> `__form__` bucket
// -> announced by useFormErrors() through an aria-live banner.
// Rule: the legal name and the tax id must not be identical.
// ============================================================================
const distinctNameTaxSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'kyc-a11y',
    validate: (value: unknown) => {
      const data = value as Record<string, unknown>;
      const name = String(data.legalName ?? '').trim();
      const tax = String(data.taxId ?? '').trim();
      if (name && tax && name === tax) {
        return { issues: [{ message: 'Legal name and Tax ID must be different' }] };
      }
      return { value };
    },
  },
};

// ============================================================================
// HOST-BUILT A11Y AFFORDANCES (all on top of exposed state)
// ============================================================================

/** aria-live banner fed by the exposed `__form__` bucket (scenario 8). */
function LiveErrorBanner() {
  const errors = useFormErrors();
  return (
    <output aria-live="polite" data-testid="form-live-banner">
      {errors.map((e) => (
        <p key={e.message} role="alert">
          {e.message}
        </p>
      ))}
    </output>
  );
}

/**
 * Submit control that also performs the WCAG "focus the first error" pattern
 * (scenario 5) using ONLY the exposed surface: submit() returns false, and the
 * errored fields expose aria-invalid="true", so the host focuses the first one
 * in DOM order. Nothing library-internal is read.
 */
function AccessibleSubmit({ onResult }: { onResult?: (ok: boolean) => void }) {
  const { submit } = useForm();
  const handle = async () => {
    const ok = await submit();
    onResult?.(ok);
    if (!ok) {
      const firstInvalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      firstInvalid?.focus();
    }
  };
  return (
    <button type="button" data-testid="submit-btn" onClick={handle}>
      Submit
    </button>
  );
}

/** Host append button for the repeatable (scenario 7). */
function AddOwnerButton() {
  const { append } = useRepeatableField('owners');
  return (
    <button type="button" data-testid="add-owner" onClick={() => append()}>
      Add owner
    </button>
  );
}

// ============================================================================
// FORMS
// ============================================================================

/** Scenarios 1,2,4,5 — validation-gated required fields (default onTouched). */
function buildIdentityForm() {
  return form
    .create(rilConfig, 'identity')
    .add({
      id: 'legalName',
      type: 'text',
      props: { label: 'Legal name' },
      validation: { validate: required('Legal name is required') },
    })
    .add({
      id: 'taxId',
      type: 'text',
      props: { label: 'Tax ID' },
      validation: { validate: required('Tax ID is required') },
    })
    .build();
}

/** Scenario 8 — cross-field rule, onChange so it announces live. */
function buildCrossFieldForm() {
  return form
    .create(rilConfig, 'crossfield')
    .add({ id: 'legalName', type: 'text', props: { label: 'Legal name' } })
    .add({ id: 'taxId', type: 'text', props: { label: 'Tax ID' } })
    .setValidation({ mode: 'onChange', validate: distinctNameTaxSchema })
    .build();
}

/** Scenario 3 — conditions-driven required/disabled/readonly, always visible. */
function buildConditionsForm() {
  return (
    form
      .create(rilConfig, 'conditions')
      .add({
        id: 'trigger',
        type: 'select',
        props: {
          label: 'Are you a US person?',
          options: [
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ],
        },
      })
      // required ONLY when trigger === yes, no validation block -> pure conditions.required
      .add({
        id: 'ssn',
        type: 'text',
        props: { label: 'SSN' },
        conditions: { required: when('trigger').equals('yes') },
      })
      // disabled when trigger === yes
      .add({
        id: 'foreignId',
        type: 'text',
        props: { label: 'Foreign ID' },
        conditions: { disabled: when('trigger').equals('yes') },
      })
      // readonly when trigger === yes
      .add({
        id: 'refNo',
        type: 'text',
        props: { label: 'Reference no.' },
        conditions: { readonly: when('trigger').equals('yes') },
      })
      .build()
  );
}

/** Scenario 7 — repeatable beneficial owners, each ownerName required. */
function buildRepeatableForm() {
  return form
    .create(rilConfig, 'owners-form')
    .addRepeatable('owners', (r) =>
      r
        .add({
          id: 'ownerName',
          type: 'text',
          props: { label: 'Owner name' },
          validation: { validate: required('Owner name is required') },
        })
        .min(1)
        .defaultValue({ ownerName: '' })
    )
    .build();
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function renderForm(node: React.ReactElement) {
  return render(node);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// SCENARIO 1 + 4 — aria-invalid derives from exposed error state, and is GATED
// by touched (no premature invalid on a pristine field).
// ============================================================================
describe('aria-invalid derives from exposed error state (scenarios 1 & 4)', () => {
  it('a pristine required field is NOT aria-invalid; it flips to true after a failing blur and back to false when fixed', async () => {
    renderForm(
      <FormProvider formConfig={buildIdentityForm()} defaultValues={{}}>
        <FormBody />
      </FormProvider>
    );

    const legalName = screen.getByRole('textbox', { name: 'Legal name' });

    // Pristine: onTouched default means no validation yet -> aria-invalid="false".
    expect(legalName).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).toBeNull();

    // Blur an empty required field -> validates (onTouched) -> error -> invalid.
    await act(async () => {
      fireEvent.blur(legalName);
    });
    await waitFor(() => expect(legalName).toHaveAttribute('aria-invalid', 'true'));

    // Fix it -> reValidateMode onChange clears the error live -> invalid=false.
    await act(async () => {
      fireEvent.change(legalName, { target: { value: 'Ada Lovelace' } });
    });
    await waitFor(() => expect(legalName).toHaveAttribute('aria-invalid', 'false'));
  });
});

// ============================================================================
// SCENARIO 2 — aria-describedby + stable error id + role=alert announcement.
// ============================================================================
describe('error association + announcement (scenario 2)', () => {
  it('the error node has a stable id, role="alert", and the input points at it via aria-describedby ONLY when errored', async () => {
    renderForm(
      <FormProvider formConfig={buildIdentityForm()} defaultValues={{}}>
        <FormBody />
      </FormProvider>
    );

    const taxId = screen.getByRole('textbox', { name: 'Tax ID' });
    // Not errored yet: no association, no alert.
    expect(taxId).not.toHaveAttribute('aria-describedby');

    await act(async () => {
      fireEvent.blur(taxId);
    });

    // The alert appears with the message a screen reader would announce.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tax ID is required');
    expect(alert).toHaveAttribute('id', 'taxId-error');

    // The association is queryable as an accessible DESCRIPTION (what a SR reads).
    expect(taxId).toHaveAttribute('aria-describedby', 'taxId-error');
    expect(screen.getByRole('textbox', { name: 'Tax ID', description: 'Tax ID is required' })).toBe(
      taxId
    );
  });
});

// ============================================================================
// SCENARIO 3 — required / disabled / readonly from conditions -> ARIA.
// ============================================================================
describe('conditions drive aria-required / aria-disabled / aria-readonly (scenario 3)', () => {
  it('flips aria-required, aria-disabled and aria-readonly when the controller changes', async () => {
    renderForm(
      <FormProvider formConfig={buildConditionsForm()} defaultValues={{ trigger: 'no' }}>
        <FormBody />
      </FormProvider>
    );

    const ssn = screen.getByRole('textbox', { name: 'SSN' });
    const foreignId = screen.getByRole('textbox', { name: 'Foreign ID' });
    const refNo = screen.getByRole('textbox', { name: 'Reference no.' });

    // Baseline (trigger = no): none required/disabled/readonly.
    expect(ssn).toHaveAttribute('aria-required', 'false');
    expect(foreignId).toHaveAttribute('aria-disabled', 'false');
    expect(foreignId).toBeEnabled();
    expect(refNo).toHaveAttribute('aria-readonly', 'false');
    expect(refNo).not.toHaveAttribute('readonly');

    // Flip the controller.
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Are you a US person?' }), {
        target: { value: 'yes' },
      });
    });

    await waitFor(() => expect(ssn).toHaveAttribute('aria-required', 'true'));
    expect(foreignId).toHaveAttribute('aria-disabled', 'true');
    expect(foreignId).toBeDisabled();
    expect(refNo).toHaveAttribute('aria-readonly', 'true');
    expect(refNo).toHaveAttribute('readonly');
  });
});

// ============================================================================
// SCENARIO 5 — focus the first errored field on a failed submit, using only
// the exposed error state (submit() verdict + aria-invalid on errored fields).
// ============================================================================
describe('focus-first-error on failed submit (scenario 5)', () => {
  it('a failed submit lets the host focus the first errored field', async () => {
    let lastResult: boolean | null = null;
    renderForm(
      <FormProvider formConfig={buildIdentityForm()} defaultValues={{}}>
        <FormBody />
        <AccessibleSubmit
          onResult={(ok) => {
            lastResult = ok;
          }}
        />
      </FormProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    // Submit was rejected (both required fields empty).
    await waitFor(() => expect(lastResult).toBe(false));

    // Every errored field is announced-and-invalid, and focus landed on the FIRST.
    const legalName = screen.getByRole('textbox', { name: 'Legal name' });
    expect(legalName).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(legalName);
  });
});

// ============================================================================
// SCENARIO 7 — repeatable rows keep DISTINCT ids / error associations so
// aria-describedby never collides across rows.
// ============================================================================
describe('repeatable row a11y isolation (scenario 7)', () => {
  it('row 1 and row 2 have distinct ids and distinct error associations (no duplicate ids)', async () => {
    const { container } = renderForm(
      <FormProvider formConfig={buildRepeatableForm()} defaultValues={{}}>
        <FormBody />
        <AddOwnerButton />
      </FormProvider>
    );

    // Start with 1 row (min), add a second.
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-owner'));
    });

    const ownerInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[id$=".ownerName"]')
    );
    expect(ownerInputs).toHaveLength(2);

    // Composite ids are unique (owners[k0].ownerName vs owners[k1].ownerName).
    const ids = ownerInputs.map((el) => el.id);
    expect(new Set(ids).size).toBe(2);

    // Blur both -> each gets its OWN error node id, distinct across rows.
    for (const el of ownerInputs) {
      await act(async () => {
        fireEvent.blur(el);
      });
    }

    await waitFor(() => {
      for (const el of ownerInputs) {
        expect(el).toHaveAttribute('aria-invalid', 'true');
      }
    });

    const describedBys = ownerInputs.map((el) => el.getAttribute('aria-describedby'));
    // Each points at its own row's error node...
    describedBys.forEach((db, i) => expect(db).toBe(`${ids[i]}-error`));
    // ...and the two associations are distinct (no cross-row collision).
    expect(new Set(describedBys).size).toBe(2);

    // Each error node id resolves to exactly one element in the DOM.
    for (const db of describedBys) {
      expect(container.querySelectorAll(`[id="${db}"]`)).toHaveLength(1);
    }
  });
});

// ============================================================================
// SCENARIO 8 — form-level (cross-field) errors drive an aria-live banner.
// ============================================================================
describe('cross-field errors announced via aria-live banner (scenario 8)', () => {
  it('a __form__ cross-field error surfaces in the live region', async () => {
    renderForm(
      <FormProvider formConfig={buildCrossFieldForm()} defaultValues={{}}>
        <FormBody />
        <LiveErrorBanner />
      </FormProvider>
    );

    const banner = screen.getByTestId('form-live-banner');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(within(banner).queryByRole('alert')).toBeNull();

    // Type identical values -> cross-field rule (onChange) emits a __form__ issue.
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Legal name' }), {
        target: { value: 'ACME' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Tax ID' }), {
        target: { value: 'ACME' },
      });
    });

    await waitFor(() =>
      expect(within(banner).getByRole('alert')).toHaveTextContent(
        'Legal name and Tax ID must be different'
      )
    );

    // Divergence clears it live.
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Tax ID' }), {
        target: { value: 'ACME-TAX-42' },
      });
    });
    await waitFor(() => expect(within(banner).queryByRole('alert')).toBeNull());
  });
});

// ============================================================================
// SCENARIO 6 — step-change focus management (workflow). The state needed to
// move focus to the new step's heading is exposed via useFlowSteps().
// ============================================================================

/** Heading that focuses itself whenever the current step changes. */
function StepHeading() {
  const { steps, currentIndex } = useFlowSteps();
  const ref = useRef<HTMLHeadingElement>(null);
  const currentId = steps[currentIndex]?.id;
  // Focus management reacting to external navigation state — the canonical WCAG
  // "move focus to the new context" pattern. `currentId` (from the exposed step
  // state) is the intentional trigger: the effect body only reads a ref, so it
  // exists solely to re-run focus on every step change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentId is the trigger, not an input
  useEffect(() => {
    ref.current?.focus();
  }, [currentId]);
  return (
    <h1 ref={ref} tabIndex={-1} data-testid="step-heading" data-step={currentId}>
      Step: {currentId}
    </h1>
  );
}

function buildStepFlow() {
  const stepOne = form
    .create(rilConfig, 'step-one')
    .add({ id: 'alpha', type: 'text', props: { label: 'Alpha' } })
    .build();
  const stepTwo = form
    .create(rilConfig, 'step-two')
    .add({ id: 'beta', type: 'text', props: { label: 'Beta' } })
    .build();
  return flow
    .create(rilConfig, 'a11y-flow', 'A11y Flow')
    .addStep({ id: 'one', title: 'One', formConfig: stepOne })
    .addStep({ id: 'two', title: 'Two', formConfig: stepTwo })
    .build();
}

describe('step-change focus management (scenario 6)', () => {
  it('exposes the step state a host needs to move focus to the new step heading', async () => {
    // Import the real nav button lazily to keep the exposed-hook surface honest.
    const { NextButton: BaseNextButton } = await import(
      '../../../packages/workflow/tests/_helpers/nav-buttons'
    );

    render(
      <Flow of={buildStepFlow()}>
        <StepHeading />
        <FlowBody />
        <BaseNextButton testId="flow-next" />
      </Flow>
    );

    const heading = screen.getByTestId('step-heading');
    expect(heading).toHaveAttribute('data-step', 'one');
    // Heading is focusable and receives focus on mount of the first step.
    await waitFor(() => expect(document.activeElement).toBe(heading));

    // Navigate; the exposed step state updates, the host moves focus to the
    // new heading (same node, new step id).
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-next'));
    });

    await waitFor(() => expect(heading).toHaveAttribute('data-step', 'two'));
    expect(document.activeElement).toBe(heading);
  });
});
