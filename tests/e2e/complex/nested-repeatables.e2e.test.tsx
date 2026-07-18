import { ConfigurationError, required } from '@rilaykit/core';
import { buildCompositeKey, form, parseCompositeKey, structureFormValues } from '@rilaykit/forms';
import {
  FormBody,
  FormProvider,
  useFieldErrors,
  useFormStoreApi,
  useRepeatableField,
} from '@rilaykit/forms/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepeatableControls, SubmitButton, ValidationTrigger } from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// =====================================================================
// COMPLEX E2E: NESTED repeatables for a real KYC need — "companies[],
// each with beneficialOwners[]".
//
// VERDICT (source-verified, see file:line in each block): nested
// repeatables are NOT supported. RilayKit repeatables are strictly
// ONE level. This suite PINS the ceiling precisely:
//
//   • The builder exposes NO way to nest (RepeatableBuilder has no
//     `addRepeatable`), and `form.addRepeatable` guards against it
//     anyway (form.ts:389 — "Nested repeatables are not supported").
//   • The composite key format is single-level: `id[key].field`
//     (repeatable-data.ts:11). A second `[key]` cannot be expressed —
//     a template field id carrying brackets is rejected at build
//     (repeatable-builder.ts:106), and the parser leaves any second
//     bracket level unparsed inside `fieldId`.
//   • The store order mirror is `Record<string, string[]>`
//     (formStore.ts:28) — one level: repeatableId → item keys. There
//     is no per-outer-row inner order.
//   • The TYPE `RepeatableFieldConfig.allFields: FormFieldConfig[]`
//     (core/types:218) has no repeatable variant — a repeatable's
//     rows can only hold plain fields.
//
// What a KYC team hits: the single-level `companies[]` works to its
// ceiling (per-row validation isolation, structured payload, reorder),
// but the inner `owners[]` is OPAQUE — it round-trips as a passthrough
// value with ZERO framework help: no owner inputs, no per-owner
// composite keys, no per-owner validation, no owner add/remove.
// =====================================================================

// Store handle for direct/assertion access.
let storeRef: any;
function StoreAccessor() {
  const store = useFormStoreApi();
  React.useEffect(() => {
    storeRef = store;
  }, [store]);
  return null;
}

let rilConfig: ReturnType<typeof createTestRilConfig>;

/** Single-level KYC form: companies[] with a company-level field. No inner owners repeatable — the framework offers none. */
function buildKycForm(opts?: { min?: number; max?: number }) {
  return form
    .create(rilConfig, 'kyc')
    .add({ id: 'legalEntityName', type: 'text', props: { label: 'Legal Entity' } })
    .addRepeatable('companies', (r) => {
      let rr = r
        .add({
          id: 'companyName',
          type: 'text',
          props: { label: 'Company Name' },
          validation: { validate: required('Company name required') },
        })
        .add({ id: 'country', type: 'text', props: { label: 'Country' } });
      if (opts?.min !== undefined) rr = rr.min(opts.min);
      if (opts?.max !== undefined) rr = rr.max(opts.max);
      return rr.defaultValue({ companyName: '', country: '' });
    })
    .build();
}

/** Paints the live per-cell error for each company's `companyName`, keyed by its composite id. */
function CompanyNameErrorPainter() {
  const { items } = useRepeatableField('companies');
  return (
    <div data-testid="company-name-errors">
      {items.map((item) => {
        const nameField = item.allFields.find((f) => f.id.endsWith('.companyName'));
        return nameField ? <CellError key={item.key} id={nameField.id} /> : null;
      })}
    </div>
  );
}

function CellError({ id }: { id: string }) {
  const errors = useFieldErrors(id);
  return <span data-testid={`cell-error-${id}`}>{errors.map((e) => e.message).join('|')}</span>;
}

/** Probe: does the framework expose an inner `owners` repeatable? (It does not.) */
function OwnersProbe() {
  const { config, count, canAdd } = useRepeatableField('owners');
  return (
    <div data-testid="owners-probe">
      <span data-testid="owners-config">{config === undefined ? 'undefined' : 'defined'}</span>
      <span data-testid="owners-count">{count}</span>
      <span data-testid="owners-can-add">{canAdd ? 'true' : 'false'}</span>
    </div>
  );
}

function renderKyc(config: any, defaultValues: any, onSubmit?: any) {
  return render(
    <FormProvider formConfig={config} defaultValues={defaultValues} onSubmit={onSubmit}>
      <FormBody />
      <RepeatableControls repeatableId="companies" />
      <CompanyNameErrorPainter />
      <OwnersProbe />
      <SubmitButton />
      <ValidationTrigger />
      <StoreAccessor />
    </FormProvider>
  );
}

describe('Nested repeatables (KYC companies[] → owners[])', () => {
  beforeEach(() => {
    rilConfig = createTestRilConfig();
    storeRef = null;
  });

  // ================================================================
  // A. CAPABILITY BOUNDARY — nesting is not supported, and cannot even
  //    be expressed. Source-grounded pins.
  // ================================================================
  describe('capability boundary', () => {
    it('the RepeatableBuilder exposes NO addRepeatable — the fluent API offers no nesting', () => {
      let captured: any;
      form.create(rilConfig, 'probe').addRepeatable('companies', (r) => {
        captured = r;
        return r.add({ id: 'companyName', type: 'text', props: { label: 'Name' } });
      });

      // No way to descend a second level from inside a repeatable callback.
      expect(typeof captured.addRepeatable).toBe('undefined');
      // The methods it DOES expose are strictly one-level building blocks.
      for (const method of ['add', 'addSeparateRows', 'min', 'max', 'defaultValue', 'validation']) {
        expect(typeof captured[method]).toBe('function');
      }
    });

    it('a template field id encoding a second level (brackets) is rejected at build (repeatable-builder.ts:106)', () => {
      // The only way a KYC dev could try to fake `owners[k].fullName` is by
      // naming a template field with brackets — build rejects it outright.
      expect(() =>
        form
          .create(rilConfig, 'probe')
          .addRepeatable('companies', (r) =>
            r.add({ id: 'owners[k0].fullName', type: 'text', props: { label: 'x' } })
          )
      ).toThrow(ConfigurationError);
      expect(() =>
        form
          .create(rilConfig, 'probe')
          .addRepeatable('companies', (r) =>
            r.add({ id: 'owners[k0].fullName', type: 'text', props: { label: 'x' } })
          )
      ).toThrow(/cannot contain/);
    });

    it('composite-key helpers are strictly single-level (repeatable-data.ts:11)', () => {
      // buildCompositeKey emits exactly ONE `[key]` bracket level.
      expect(buildCompositeKey('companies', 'k0', 'companyName')).toBe('companies[k0].companyName');

      // A well-formed one-level key round-trips cleanly.
      expect(parseCompositeKey('companies[k0].companyName')).toEqual({
        repeatableId: 'companies',
        itemKey: 'k0',
        fieldId: 'companyName',
      });

      // A would-be TWO-level key parses only its OUTER level; the entire inner
      // `owners[k1].fullName` leaks UNPARSED into `fieldId`. The parser never
      // descends — proof the key grammar cannot express nesting.
      expect(parseCompositeKey('companies[k0].owners[k1].fullName')).toEqual({
        repeatableId: 'companies',
        itemKey: 'k0',
        fieldId: 'owners[k1].fullName',
      });
    });

    it('the store order mirror is one level: repeatableId → string[] (formStore.ts:28)', () => {
      renderKyc(buildKycForm(), {
        legalEntityName: 'Acme Group',
        companies: [{ companyName: 'Acme SA', country: 'FR' }],
      });
      const order = storeRef.getState()._repeatableOrder;
      // A flat map keyed by the TOP-LEVEL repeatable id only. Each value is a
      // string[] of item keys — never a nested per-row order structure.
      expect(Object.keys(order)).toEqual(['companies']);
      expect(Array.isArray(order.companies)).toBe(true);
      expect(order.companies).toHaveLength(1);
      expect(typeof order.companies[0]).toBe('string');
    });
  });

  // ================================================================
  // B. THE ONE-LEVEL CEILING WORKS SOLIDLY — companies[] with a
  //    company-level field. This is as deep as a KYC team can go.
  // ================================================================
  describe('single-level companies[] works to the ceiling', () => {
    it('add/remove companies produce ONLY single-level composite keys — no nested owner keys ever appear', async () => {
      renderKyc(buildKycForm(), {
        legalEntityName: 'Acme Group',
        companies: [{ companyName: 'Acme SA', country: 'FR' }],
      });
      const [k0] = storeRef.getState()._repeatableOrder.companies;

      // Add a second company row.
      fireEvent.click(screen.getByTestId('repeatable-append-companies'));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.companies).toHaveLength(2));
      const k1 = storeRef.getState()._repeatableOrder.companies[1];

      fireEvent.change(screen.getByTestId(`input-companies[${k1}].companyName`), {
        target: { value: 'Beta Ltd' },
      });
      await waitFor(() =>
        expect(storeRef.getState().values[`companies[${k1}].companyName`]).toBe('Beta Ltd')
      );

      // Every composite value key has EXACTLY one bracket level. There is no
      // `companies[k].owners[..]` — the framework never manufactures a 2nd level.
      const compositeKeys = Object.keys(storeRef.getState().values).filter((key) =>
        key.startsWith('companies[')
      );
      expect(compositeKeys.length).toBeGreaterThan(0);
      for (const key of compositeKeys) {
        const bracketLevels = (key.match(/\[/g) ?? []).length;
        expect(bracketLevels).toBe(1);
        // Parses at exactly one level, and the fieldId carries no further bracket.
        const parsed = parseCompositeKey(key);
        expect(parsed).not.toBeNull();
        expect(parsed?.fieldId).not.toContain('[');
      }

      // Remove k0 — its keys vanish, k1 survives (single-level scoping is clean).
      fireEvent.click(screen.getByTestId(`repeatable-remove-companies-${k0}`));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.companies).toEqual([k1]));
      const ghosts = Object.keys(storeRef.getState().values).filter((key) =>
        key.startsWith(`companies[${k0}]`)
      );
      expect(ghosts).toEqual([]);
    });

    it('per-company validation is isolated: companies[0] name error shows ONLY on that row', async () => {
      renderKyc(buildKycForm(), {
        legalEntityName: 'Acme Group',
        companies: [
          { companyName: '', country: 'FR' }, // row 0 — invalid
          { companyName: 'Beta Ltd', country: 'DE' }, // row 1 — valid
        ],
      });
      const [k0, k1] = storeRef.getState()._repeatableOrder.companies;

      fireEvent.click(screen.getByTestId('validate-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false')
      );

      // Exactly ONE required error across the whole form.
      const errors = JSON.parse(screen.getByTestId('validation-errors').textContent!);
      const nameErrors = errors.filter(
        (e: { message: string }) => e.message === 'Company name required'
      );
      expect(nameErrors).toHaveLength(1);

      // The store keys the error by row 0's EXACT composite id, and only that row.
      const storeErrors = storeRef.getState().errors;
      expect(storeErrors[`companies[${k0}].companyName`]?.[0]?.message).toBe(
        'Company name required'
      );
      expect(storeErrors[`companies[${k1}].companyName`] ?? []).toEqual([]);

      // What the USER sees: the error paints on row 0's cell, NEVER on row 1's.
      await waitFor(() =>
        expect(screen.getByTestId(`cell-error-companies[${k0}].companyName`)).toHaveTextContent(
          'Company name required'
        )
      );
      expect(screen.getByTestId(`cell-error-companies[${k1}].companyName`)).toHaveTextContent('');
    });

    it('submit payload nests EXACTLY one level: companies: [{ companyName, country }]', async () => {
      const onSubmit = vi.fn();
      renderKyc(
        buildKycForm(),
        {
          legalEntityName: 'Acme Group',
          companies: [
            { companyName: 'Acme SA', country: 'FR' },
            { companyName: 'Beta Ltd', country: 'DE' },
          ],
        },
        onSubmit
      );

      fireEvent.click(screen.getByTestId('submit-btn'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());

      const payload = onSubmit.mock.calls[0][0];
      expect(payload.legalEntityName).toBe('Acme Group');
      expect(payload.companies).toEqual([
        { companyName: 'Acme SA', country: 'FR' },
        { companyName: 'Beta Ltd', country: 'DE' },
      ]);
      // No flat composite keys leak into the payload.
      expect(Object.keys(payload).filter((key) => key.includes('companies['))).toEqual([]);
    });

    it('reorder companies keeps each row value with ITS row (single level)', async () => {
      renderKyc(buildKycForm(), {
        legalEntityName: 'Acme Group',
        companies: [
          { companyName: 'Acme SA', country: 'FR' },
          { companyName: 'Beta Ltd', country: 'DE' },
        ],
      });
      const [k0, k1] = storeRef.getState()._repeatableOrder.companies;

      fireEvent.click(screen.getByTestId('repeatable-move-down-companies-0'));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.companies).toEqual([k1, k0]));
      // Values stayed bound to their composite keys through the reorder.
      expect(storeRef.getState().values[`companies[${k0}].companyName`]).toBe('Acme SA');
      expect(storeRef.getState().values[`companies[${k1}].companyName`]).toBe('Beta Ltd');
    });
  });

  // ================================================================
  // C. THE NESTING CEILING — an inner owners[] array is OPAQUE. This is
  //    exactly what a KYC team hits when it needs beneficial owners.
  // ================================================================
  describe('the nesting ceiling — inner owners[] is opaque to the engine', () => {
    it('an inner owners[] round-trips as a PASSTHROUGH value, but the engine never descends into it', async () => {
      const onSubmit = vi.fn();
      // Supply per-company `owners` arrays (as a backend would). `owners` is NOT
      // a configured template field — the framework has no way to declare it as
      // a nested repeatable.
      renderKyc(
        buildKycForm(),
        {
          legalEntityName: 'Acme Group',
          companies: [
            {
              companyName: 'Acme SA',
              country: 'FR',
              owners: [
                { fullName: 'Alice', pct: 60 },
                { fullName: 'Bob', pct: 40 },
              ],
            },
            {
              companyName: 'Beta Ltd',
              country: 'DE',
              owners: [{ fullName: 'Carol', pct: 100 }],
            },
          ],
        },
        onSubmit
      );

      // 1) NO owner inputs render — the engine sees `owners` as a single opaque
      //    value, not a list of fields.
      expect(document.querySelectorAll('[data-testid*="fullName"]').length).toBe(0);
      expect(document.querySelectorAll('[data-testid*="owners["]').length).toBe(0);

      // 2) NO second-level composite key exists. Each company holds ONE opaque
      //    `companies[k].owners` key whose value is the raw array — the array is
      //    never flattened into per-owner scoped keys.
      const values = storeRef.getState().values;
      const secondLevel = Object.keys(values).filter((key) => /\].*\[/.test(key));
      expect(secondLevel).toEqual([]);
      const [k0] = storeRef.getState()._repeatableOrder.companies;
      expect(Array.isArray(values[`companies[${k0}].owners`])).toBe(true);

      // 3) The order mirror still knows ONLY `companies` — no per-company owner order.
      expect(Object.keys(storeRef.getState()._repeatableOrder)).toEqual(['companies']);

      // 4) At submit the opaque array round-trips verbatim (round-trip carry-over
      //    in structureFormValues), so data is NOT lost — but it is entirely
      //    unmanaged: no validation, no scoping, no editability.
      fireEvent.click(screen.getByTestId('submit-btn'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.companies).toHaveLength(2);
      expect(payload.companies[0]).toEqual({
        companyName: 'Acme SA',
        country: 'FR',
        owners: [
          { fullName: 'Alice', pct: 60 },
          { fullName: 'Bob', pct: 40 },
        ],
      });
      expect(payload.companies[1].owners).toEqual([{ fullName: 'Carol', pct: 100 }]);

      // Cross-check via structureFormValues directly: the inner array is a leaf.
      const state = storeRef.getState();
      const structured = structureFormValues(
        state.values,
        state._repeatableConfigs,
        state._repeatableOrder
      );
      expect((structured.companies as any[])[0].owners).toHaveLength(2);
    });

    it('the framework offers NO per-company owner management — owners is not a repeatable', () => {
      renderKyc(buildKycForm(), {
        legalEntityName: 'Acme Group',
        companies: [{ companyName: 'Acme SA', country: 'FR' }],
      });

      // `owners` is not a configured repeatable — a KYC team gets zero help for
      // the inner list: no config, no rows, no add.
      expect(screen.getByTestId('owners-config')).toHaveTextContent('undefined');
      expect(screen.getByTestId('owners-count')).toHaveTextContent('0');
      expect(screen.getByTestId('owners-can-add')).toHaveTextContent('false');

      // The form config declares exactly ONE repeatable — companies. There is no
      // mechanism (no id, no builder path) to reach a per-company `owners` list.
      const repeatables = storeRef.getState()._repeatableConfigs;
      expect(Object.keys(repeatables)).toEqual(['companies']);
    });
  });
});
