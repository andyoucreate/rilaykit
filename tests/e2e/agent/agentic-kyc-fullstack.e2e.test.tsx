import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React, { useMemo, useRef, useState } from 'react';
/**
 * =============================================================================
 * ULTIMATE AGENTIC-KYC FULLSTACK E2E — an AI agent emits a COMPLETE KYC flow as
 * a `show_flow` tool part, and the user drives it to completion. Agent (toParts
 * + <Parts> + the built-in `ShowFlow`) + workflow (compileFlow → live Flow) +
 * forms (conditional fields, repeatables, cross-field rules) + persistence + the
 * one-shot HITL resolve latch — all together, NOTHING of rilaykit mocked.
 *
 * The model side is literal AI SDK v5 UIMessage JSON in the exact wire shape
 * (`type: 'tool-show_flow'`, `state`, `input: { schema }`). The schema is an
 * untrusted JSON `FlowSchema`; `ShowFlow`/`compileFlow` turn it into a running
 * workflow. Every assertion pins what the USER SEES (rendered steps/fields/
 * errors) or the EXACT `onResolve(toolCallId, output, 'show_flow')` payload.
 *
 * ── Verified in source BEFORE asserting (so nothing here is invented) ────────
 *  - The built-in `show_flow` renderer (Part.tsx BUILT_IN_TOOLS) mounts
 *    `<ShowFlow>` at `state === 'ready'` (input-available) ONLY; it returns
 *    `null` while `input-streaming` and a bare `DefaultTool` marker at
 *    done/error — a rehydrated call never re-arms.
 *  - `ShowFlow` (fallbacks/ShowFlow.tsx) calls `compileFlow(schema, catalog,
 *    { validateProps: true })` with NO bindings, neutralizes per-step
 *    submit `force`/`skipInvalid`, mounts `WorkflowProvider` + `FlowBody`/
 *    `FlowBack`/`FlowNext` + a Cancel, and resolves `{ status:'submitted',
 *    values }` (NO meta) once, `{ status:'cancelled' }` on cancel, and
 *    `{ status:'error', ...EmissionResult }` once for an invalid emission
 *    (its OWN latch, so a corrected re-emission on the same call recovers).
 *    => The built-in renderer supports ONLY binding-free schemas (built-in
 *       validators + conditions + repeatables) and NO persistence; custom
 *       validators/effects/persistence require a HOST renderer that calls
 *       `compileFlow` with bindings and wires `persistence` itself. Both paths
 *       are exercised below (GROUP A/B/C built-in, GROUP D host).
 *  - `compileFlow` passes each step's `conditions` straight through, so step
 *    visibility evaluates against LIVE merged cross-step data (entityType).
 *  - Completion payload is the pure projection of VISIBLE answers: hidden
 *    fields dropped, hidden step slices absent, repeatable projected to an
 *    array; meta (host path only) carries visited/skipped/passed.
 * =============================================================================
 */
import {
  type ComponentRenderContext,
  type FlowBindings,
  type FlowSchema,
  LocalStorageAdapter,
  type ToolRenderContext,
  compileFlow,
  ril,
  uiTools,
} from 'rilaykit';
import { toParts } from 'rilaykit/ai-sdk';
import {
  Catalog,
  Flow,
  FormBody,
  FormField,
  FormList,
  Parts,
  useCatalog,
  useFormErrors,
} from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// ERROR-AWARE FIELD RENDERERS — assert what the user SEES. Each carries a
// data-testid keyed by the (possibly composite `owners[k0].pepReason`) field id
// so repeatable rows are addressable individually.
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

// ============================================================================
// CROSS-FIELD RULE (host path only) — beneficial-owner percentages must total
// exactly 100. Emits a PATH-LESS issue -> routes to `__form__` -> the host's
// useFormErrors() banner. Referenced from the schema as `{ type: 'ownershipSum' }`
// and resolved through FlowBindings.validators, which the built-in ShowFlow
// deliberately cannot supply.
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

/** The host app's binding table: a cross-field validator and a "must be true"
 *  consent validator, referenced by string key from the emitted schema. */
const bindings: FlowBindings = {
  validators: {
    ownershipSum: () => ownershipSumSchema as never,
    mustBeTrue: (_params, message) =>
      ({
        '~standard': {
          version: 1 as const,
          vendor: 'kyc',
          validate: (value: unknown) =>
            value === true
              ? { value }
              : { issues: [{ message: message ?? 'This must be checked' }] },
        },
      }) as never,
  },
};

// ============================================================================
// CATALOGS
//  - builtinCatalog: field components + part('text') + part('data') + uiTools().
//    The built-in `show_flow` renderer drives the flow (no bindings, no persist).
//  - hostCatalog: the same, but `.renderers({ tools: { show_flow: HostShowFlow }})`
//    installs a production renderer that compiles WITH bindings, wires
//    persistence + a form-error banner + row removal, and forwards completion
//    meta — the "Silicon-Valley agentic KYC product" chrome.
// ============================================================================

const componentConfig = {
  text: { name: 'Text', renderer: ErrorAwareText, defaultProps: { label: '' } },
  select: { name: 'Select', renderer: ErrorAwareSelect, defaultProps: { label: '', options: [] } },
  number: { name: 'Number', renderer: ErrorAwareNumber, defaultProps: { label: '' } },
  checkbox: { name: 'Checkbox', renderer: ErrorAwareCheckbox, defaultProps: { label: '' } },
} as const;

const TextPart = ({ part }: { part: { text?: string } }) => <p>{part.text}</p>;
const DataPart = ({ part }: { part: { name?: string; data?: unknown } }) => {
  const data = (part.data ?? {}) as { ref?: unknown; holder?: unknown };
  return (
    <div data-receipt data-receipt-ref={String(data.ref ?? '')}>
      Receipt {String(data.ref ?? '')} for {String(data.holder ?? '')}
    </div>
  );
};

const builtinCatalog = ril
  .create()
  .component('text', componentConfig.text)
  .component('select', componentConfig.select)
  .component('number', componentConfig.number)
  .component('checkbox', componentConfig.checkbox)
  .part('text', { renderer: TextPart })
  .part('data', { renderer: DataPart })
  .use(uiTools());

// --- host chrome -----------------------------------------------------------

/** The current step form's `__form__` errors, rendered as a visible banner. */
function FormErrorsBanner() {
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

/** The host's step body: the default chrome PLUS a cross-field error banner and
 *  per-row Remove buttons (the default FormList ships only "Add"). */
function KycStepBody() {
  return (
    <>
      <FormErrorsBanner />
      <FormBody>
        {({ rows }) =>
          rows.map((row) =>
            row.kind === 'repeatable' ? (
              <FormList key={row.id} id={row.repeatable.id}>
                {({ items, add, remove, canAdd, canRemove }) => (
                  <div data-owner-list>
                    {items.map((item) => (
                      <div key={item.key} data-owner-row={item.key}>
                        {item.allFields.map((f) => (
                          <FormField key={f.id} id={f.id} config={f} />
                        ))}
                        {canRemove ? (
                          <button
                            type="button"
                            data-testid={`remove-${item.key}`}
                            onClick={() => remove(item.key)}
                          >
                            {`Remove owner ${item.index + 1}`}
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {canAdd ? (
                      <button type="button" onClick={() => add()}>
                        Add owner
                      </button>
                    ) : null}
                  </div>
                )}
              </FormList>
            ) : (
              <div key={row.id}>
                {row.fields.map((f) => (
                  <FormField key={f.id} id={f.id} />
                ))}
              </div>
            )
          )
        }
      </FormBody>
    </>
  );
}

/** A production app owns ONE persistence adapter; a reload reuses it. */
const ADAPTER = new LocalStorageAdapter();
const PERSIST_OPTIONS = { autoPersist: true, debounceMs: 0 } as const;

/** The host `show_flow` renderer: compiles the emission WITH bindings, mounts
 *  the real flow chrome with auto-persistence + a form-error banner + Remove
 *  buttons, and answers the tool call exactly once — forwarding completion meta
 *  the built-in renderer discards. */
function HostShowFlow({ state, input, resolve }: ToolRenderContext) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo(() => {
    if (state !== 'ready') return null;
    const schema = (input as { schema?: unknown } | null | undefined)?.schema;
    return compileFlow(schema as FlowSchema, catalog, { bindings, validateProps: true });
  }, [state, input, catalog]);

  const config = useMemo(
    () =>
      compiled
        ? {
            ...compiled.workflowConfig,
            persistence: { adapter: ADAPTER, options: PERSIST_OPTIONS },
          }
        : null,
    [compiled]
  );

  if (state !== 'ready' || !config || !compiled) {
    return <div data-tool-state={state} data-tool-name="show_flow" />;
  }

  const settle = (output: unknown) => {
    if (settled.current) return;
    settled.current = true;
    resolve(output);
  };

  return (
    <Flow
      of={config}
      defaults={compiled.defaultValues}
      onComplete={(values, meta) => settle({ status: 'submitted', values, meta })}
    >
      <Flow.Body>
        <KycStepBody />
      </Flow.Body>
      <Flow.Back />
      <Flow.Next />
      <button type="button" onClick={() => settle({ status: 'cancelled' })} data-agent-cancel>
        Cancel
      </button>
    </Flow>
  );
}

const hostCatalog = ril
  .create()
  .component('text', componentConfig.text)
  .component('select', componentConfig.select)
  .component('number', componentConfig.number)
  .component('checkbox', componentConfig.checkbox)
  .part('text', { renderer: TextPart })
  .part('data', { renderer: DataPart })
  .use(uiTools())
  .renderers({ tools: { show_flow: HostShowFlow } });

// ============================================================================
// WIRE-SHAPE BUILDERS — literal AI SDK v5 UIMessage fixtures. Round-tripped
// through JSON so the schema reaching <Parts> is pure, untrusted JSON.
// ============================================================================

function sdkMessage(parts: unknown[]): unknown {
  return JSON.parse(JSON.stringify({ id: 'msg_1', role: 'assistant', parts }));
}
function flowPart(
  toolCallId: string,
  schema: unknown,
  state: 'input-streaming' | 'input-available' | 'output-available' = 'input-available',
  output?: unknown
): unknown {
  return {
    type: 'tool-show_flow',
    toolCallId,
    state,
    input: { schema },
    ...(output ? { output } : {}),
  };
}
function text(value: string): unknown {
  return { type: 'text', text: value, state: 'done' };
}
function receipt(data: unknown): unknown {
  return { type: 'data-receipt', data };
}

// ============================================================================
// SCHEMAS — the model-emitted FlowSchema JSON.
// ============================================================================

const nationalityOptions = [
  { value: '', label: 'Select...' },
  { value: 'US', label: 'United States' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
];
const countryOptions = [
  { value: '', label: 'Select...' },
  { value: 'US', label: 'United States' },
  { value: 'DE', label: 'Germany' },
  { value: 'other', label: 'Other' },
];
const entityOptions = [
  { value: '', label: 'Select...' },
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
];
const idTypeOptions = [
  { value: '', label: 'Select...' },
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
];

const vis = (field: string, value: string) => ({ field, operator: 'equals', value });
const req = (msg: string) => ({ type: 'required', message: msg });

/** identity → address(country-conditional) → entity → ownership(company,
 *  repeatable min1, per-row PEP) → companyDocs(company) / individualDocs
 *  (individual) → review. Reused by the built-in AND host paths; the host
 *  variant additionally attaches the cross-field sum rule + a consent gate. */
function identityStep() {
  return {
    id: 'identity',
    title: 'Identity',
    form: {
      id: 'identity',
      fields: [
        {
          id: 'legalName',
          type: 'text',
          props: { label: 'Legal name' },
          validation: { rules: req('Legal name is required') },
        },
        {
          id: 'nationality',
          type: 'select',
          props: { label: 'Nationality', options: nationalityOptions },
          validation: { rules: req('Nationality is required') },
        },
      ],
    },
  };
}
function addressStep() {
  return {
    id: 'address',
    title: 'Address',
    form: {
      id: 'address',
      fields: [
        {
          id: 'country',
          type: 'select',
          props: { label: 'Country of residence', options: countryOptions },
          validation: { rules: req('Country is required') },
        },
        {
          id: 'ssn',
          type: 'text',
          props: { label: 'SSN' },
          conditions: { visible: vis('country', 'US'), required: vis('country', 'US') },
        },
        {
          id: 'usState',
          type: 'text',
          props: { label: 'State' },
          conditions: { visible: vis('country', 'US'), required: vis('country', 'US') },
        },
        {
          id: 'vatId',
          type: 'text',
          props: { label: 'VAT ID' },
          conditions: { visible: vis('country', 'DE'), required: vis('country', 'DE') },
        },
        {
          id: 'passportNo',
          type: 'text',
          props: { label: 'Passport number' },
          conditions: { visible: vis('country', 'other'), required: vis('country', 'other') },
        },
      ],
    },
  };
}
function entityStep() {
  return {
    id: 'entity',
    title: 'Entity type',
    form: {
      id: 'entity',
      fields: [
        {
          id: 'entityType',
          type: 'select',
          props: { label: 'Entity type', options: entityOptions },
          validation: { rules: req('Entity type is required') },
        },
      ],
    },
  };
}
function ownershipStep(withSumRule: boolean) {
  return {
    id: 'ownership',
    title: 'Beneficial owners',
    conditions: { visible: vis('entityType', 'company') },
    form: {
      id: 'ownership',
      rows: [
        {
          kind: 'repeatable',
          repeatable: {
            id: 'owners',
            min: 1,
            defaultValue: { ownerName: '', ownershipPct: 0, isPEP: false, pepReason: '' },
            rows: [
              {
                fields: [
                  {
                    id: 'ownerName',
                    type: 'text',
                    props: { label: 'Owner name' },
                    validation: { rules: req('Owner name is required') },
                  },
                  { id: 'ownershipPct', type: 'number', props: { label: 'Ownership %' } },
                  { id: 'isPEP', type: 'checkbox', props: { label: 'Politically exposed?' } },
                  {
                    id: 'pepReason',
                    type: 'text',
                    props: { label: 'PEP explanation' },
                    conditions: {
                      visible: { field: 'isPEP', operator: 'equals', value: true },
                      required: { field: 'isPEP', operator: 'equals', value: true },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
      ...(withSumRule ? { validation: { rules: { type: 'ownershipSum' }, mode: 'onChange' } } : {}),
    },
  };
}
function companyDocsStep() {
  return {
    id: 'companyDocs',
    title: 'Company documents',
    conditions: { visible: vis('entityType', 'company') },
    form: {
      id: 'companyDocs',
      fields: [
        {
          id: 'incorporationNo',
          type: 'text',
          props: { label: 'Incorporation no.' },
          validation: { rules: req('Incorporation number is required') },
        },
        {
          id: 'taxId',
          type: 'text',
          props: { label: 'Company tax ID' },
          validation: { rules: req('Tax ID is required') },
        },
      ],
    },
  };
}
function individualDocsStep() {
  return {
    id: 'individualDocs',
    title: 'Identity documents',
    conditions: { visible: vis('entityType', 'individual') },
    form: {
      id: 'individualDocs',
      fields: [
        {
          id: 'idType',
          type: 'select',
          props: { label: 'ID type', options: idTypeOptions },
          validation: { rules: req('ID type is required') },
        },
        {
          id: 'idNumber',
          type: 'text',
          props: { label: 'ID number' },
          validation: { rules: req('ID number is required') },
        },
      ],
    },
  };
}
function reviewStep(withConsent: boolean) {
  return {
    id: 'review',
    title: 'Review',
    form: {
      id: 'review',
      fields: withConsent
        ? [
            {
              id: 'consent',
              type: 'checkbox',
              props: { label: 'I certify this is accurate' },
              validation: {
                rules: { type: 'mustBeTrue', message: 'You must certify to continue' },
              },
            },
          ]
        : [{ id: 'notes', type: 'text', props: { label: 'Notes' } }],
    },
  };
}

/** Binding-free schema for the built-in ShowFlow (no cross-field rule, no
 *  consent-must-be-true — those need bindings the built-in cannot supply). */
function builtinKycSchema() {
  return {
    id: 'agentic-kyc-builtin',
    name: 'KYC onboarding',
    description: 'Agent-emitted customer due-diligence flow',
    steps: [
      identityStep(),
      addressStep(),
      entityStep(),
      ownershipStep(false),
      companyDocsStep(),
      individualDocsStep(),
      reviewStep(false),
    ],
  };
}

/** Production schema for the host renderer: adds the ownership-sum cross-field
 *  rule and the consent gate (both binding-resolved). Distinct flow id so its
 *  persistence namespace is its own. */
function hostKycSchema() {
  return {
    id: 'agentic-kyc',
    name: 'KYC onboarding',
    description: 'Agent-emitted customer due-diligence flow',
    steps: [
      identityStep(),
      addressStep(),
      entityStep(),
      ownershipStep(true),
      companyDocsStep(),
      individualDocsStep(),
      reviewStep(true),
    ],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function renderParts(message: unknown, onResolve: (...a: unknown[]) => void, catalog: unknown) {
  return render(
    <Catalog value={catalog as never}>
      <Parts parts={toParts(message as never) as never} onResolve={onResolve as never} />
    </Catalog>
  );
}
function partsTree(message: unknown, onResolve: (...a: unknown[]) => void, catalog: unknown) {
  return (
    <Catalog value={catalog as never}>
      <Parts parts={toParts(message as never) as never} onResolve={onResolve as never} />
    </Catalog>
  );
}

function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
function setCheckbox(id: string, checked: boolean) {
  const el = screen.getByTestId(`input-${id}`) as HTMLInputElement;
  if (el.checked !== checked) fireEvent.click(el);
}
async function clickNext() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  });
}
async function clickBack() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  });
}
async function addOwner() {
  await act(async () => {
    // Built-in chrome: default FormList add button (data-form-list-add).
    // Host chrome: an "Add owner" button.
    const builtin = document.querySelector('[data-form-list-add="owners"]') as HTMLElement | null;
    fireEvent.click(builtin ?? screen.getByRole('button', { name: 'Add owner' }));
  });
}
function hasField(id: string) {
  return screen.queryByTestId(`field-${id}`) !== null;
}
function hasUiError(id: string) {
  return screen.queryByTestId(`ui-errors-${id}`) !== null;
}
async function fillIdentity(name = 'Acme Founder', nationality = 'US') {
  await waitFor(() => expect(screen.getByTestId('input-legalName')).toBeInTheDocument());
  await act(async () => {
    setField('legalName', name);
    setField('nationality', nationality);
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

// ============================================================================
// GROUP A — the SHIPPED built-in ShowFlow drives the agent-emitted KYC flow.
// ============================================================================

describe('AGENTIC KYC — built-in ShowFlow drives the emitted flow', () => {
  it('A1: full company round-trip resolves the exact projected KYC payload (hidden steps/fields absent)', async () => {
    const onResolve = vi.fn();
    renderParts(
      sdkMessage([
        text('I can onboard you — please complete this KYC flow.'),
        flowPart('call_kyc', builtinKycSchema()),
      ]),
      onResolve,
      builtinCatalog
    );

    // The prose part rendered; the flow mounted (identity is live).
    expect(
      screen.getByText('I can onboard you — please complete this KYC flow.')
    ).toBeInTheDocument();

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();

    // Ownership: the min=1 seeded row + one added row.
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '60');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k1].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '40');
    });
    await clickNext();

    await waitFor(() => expect(screen.getByTestId('input-incorporationNo')).toBeInTheDocument());
    await act(async () => {
      setField('incorporationNo', 'INC-123');
      setField('taxId', 'TAX-9');
    });
    await clickNext();

    await waitFor(() => expect(screen.getByTestId('input-notes')).toBeInTheDocument());
    await act(async () => setField('notes', 'All good'));
    await clickNext();

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const [callId, output, toolName] = onResolve.mock.calls[0] as [string, any, string];
    expect(callId).toBe('call_kyc');
    expect(toolName).toBe('show_flow');
    expect(output.status).toBe('submitted');

    expect(output.values).toEqual({
      identity: { legalName: 'Acme Founder', nationality: 'US' },
      // Only the US conditional fields survive; DE/other fields never shipped.
      address: { country: 'US', ssn: '123-45-6789', usState: 'CA' },
      entity: { entityType: 'company' },
      // Repeatable projected to an array; hidden pepReason dropped per row.
      ownership: {
        owners: [
          { ownerName: 'Alice', ownershipPct: 60, isPEP: false },
          { ownerName: 'Bob', ownershipPct: 40, isPEP: false },
        ],
      },
      companyDocs: { incorporationNo: 'INC-123', taxId: 'TAX-9' },
      review: { notes: 'All good' },
    });
    // The individual-only step is absent entirely.
    expect(output.values.individualDocs).toBeUndefined();
    // The built-in ShowFlow resolves values only — no meta channel.
    expect(output.meta).toBeUndefined();
  });

  it('A2: individual path — ownership + companyDocs absent, individualDocs present', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', builtinKycSchema())]), onResolve, builtinCatalog);

    await fillIdentity('Jane Doe', 'DE');
    await clickNext();
    // DE resident -> vatId is the only conditional field.
    await waitFor(() => expect(screen.getByTestId('input-country')).toBeInTheDocument());
    await act(async () => setField('country', 'DE'));
    await waitFor(() => expect(screen.getByTestId('input-vatId')).toBeInTheDocument());
    expect(hasField('ssn')).toBe(false);
    await act(async () => setField('vatId', 'DE811'));
    await clickNext();

    await setEntity('individual');
    await clickNext();
    // ownership + companyDocs skipped -> straight to individualDocs.
    await waitFor(() => expect(screen.getByTestId('input-idType')).toBeInTheDocument());
    await act(async () => {
      setField('idType', 'passport');
      setField('idNumber', 'P-77');
    });
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-notes')).toBeInTheDocument());
    await clickNext();

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const output = onResolve.mock.calls[0][1] as any;
    expect(output.values.address).toEqual({ country: 'DE', vatId: 'DE811' });
    expect(output.values.entity).toEqual({ entityType: 'individual' });
    expect(output.values.individualDocs).toEqual({ idType: 'passport', idNumber: 'P-77' });
    expect(output.values.ownership).toBeUndefined();
    expect(output.values.companyDocs).toBeUndefined();
  });

  it('A3: back/next/back nav hygiene inside the agent-emitted flow — values persist, conditionals survive', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', builtinKycSchema())]), onResolve, builtinCatalog);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();

    // Back to identity: values re-seeded into the real inputs.
    await clickBack();
    await waitFor(() => {
      expect(screen.getByTestId('input-legalName')).toHaveValue('Acme Founder');
      expect(screen.getByTestId('input-nationality')).toHaveValue('US');
    });
    expect(hasUiError('legalName')).toBe(false);

    // Forward again: the address step's conditional US values survived the trip.
    await clickNext();
    await waitFor(() => {
      expect(screen.getByTestId('input-country')).toHaveValue('US');
      expect(screen.getByTestId('input-ssn')).toHaveValue('123-45-6789');
      expect(screen.getByTestId('input-usState')).toHaveValue('CA');
    });
  });

  it('A4: a required field blocks Next with the error VISIBLE, still on the step; fixing it lets Next through', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', builtinKycSchema())]), onResolve, builtinCatalog);

    await waitFor(() => expect(screen.getByTestId('input-legalName')).toBeInTheDocument());
    await act(async () => setField('legalName', 'Only Name'));
    // nationality empty -> Next blocked, error painted, still on identity.
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-nationality-0')).toHaveTextContent(
        'Nationality is required'
      )
    );
    expect(screen.getByTestId('input-legalName')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();

    // Fill it -> Next proceeds to address.
    await act(async () => setField('nationality', 'US'));
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-country')).toBeInTheDocument());
    expect(hasUiError('nationality')).toBe(false);
  });

  it('A5: flipping country removes hidden fields from the DOM and drops them from the payload', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', builtinKycSchema())]), onResolve, builtinCatalog);

    await fillIdentity();
    await clickNext();

    // US -> ssn + usState visible; type stale values.
    await act(async () => setField('country', 'US'));
    await waitFor(() => expect(screen.getByTestId('input-ssn')).toBeInTheDocument());
    await act(async () => {
      setField('ssn', 'STALE');
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
    await clickNext();

    await setEntity('individual');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-idType')).toBeInTheDocument());
    await act(async () => {
      setField('idType', 'passport');
      setField('idNumber', 'P-1');
    });
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-notes')).toBeInTheDocument());
    await clickNext();

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    // Only still-visible fields survive; the stale US values are dropped.
    expect((onResolve.mock.calls[0][1] as any).values.address).toEqual({
      country: 'DE',
      vatId: 'DE99',
    });
  });

  it('A6: per-row PEP explanation shows/hides ONLY within its own row', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', builtinKycSchema())]), onResolve, builtinCatalog);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();

    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await act(async () => setField('owners[k0].ownerName', 'Alice'));
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k1].ownerName')).toBeInTheDocument()
    );

    // Neither row shows the PEP explanation yet.
    expect(hasField('owners[k0].pepReason')).toBe(false);
    expect(hasField('owners[k1].pepReason')).toBe(false);

    // Toggle isPEP on row 0 ONLY -> only row 0's explanation appears.
    await act(async () => setCheckbox('owners[k0].isPEP', true));
    await waitFor(() => expect(hasField('owners[k0].pepReason')).toBe(true));
    expect(hasField('owners[k1].pepReason')).toBe(false);

    // Toggle off -> row 0's explanation disappears again.
    await act(async () => setCheckbox('owners[k0].isPEP', false));
    await waitFor(() => expect(hasField('owners[k0].pepReason')).toBe(false));
  });
});

// ============================================================================
// GROUP B — streaming the schema + self-correcting re-emission (built-in latch).
// ============================================================================

describe('AGENTIC KYC — streaming + re-emission through the built-in ShowFlow', () => {
  it('B1: the flow mounts only when the tool part is ready; a prior settled part is undisturbed', async () => {
    const onResolve = vi.fn();
    // A prior, already-answered flow (bare done marker) sits above the streaming one.
    const priorDone = flowPart('call_prior', builtinKycSchema(), 'output-available', {
      status: 'submitted',
      values: {},
    });

    const withStream = (streaming: unknown) =>
      sdkMessage([text('Verifying...'), priorDone, streaming]);

    const view = renderParts(
      withStream(flowPart('call_stream', builtinKycSchema(), 'input-streaming')),
      onResolve,
      builtinCatalog
    );

    // Prior call is a settled marker from the first paint.
    expect(
      document.querySelector('[data-tool-name="show_flow"][data-tool-state="done"]')
    ).not.toBeNull();
    // STREAMING: the flow is NOT mounted — no fields, no Next, no resolve.
    expect(screen.queryByTestId('input-legalName')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(onResolve).not.toHaveBeenCalled();
    // The prose part still renders alongside.
    expect(screen.getByText('Verifying...')).toBeInTheDocument();

    // READY on the same toolCallId: the flow mounts in place.
    view.rerender(
      partsTree(
        withStream(flowPart('call_stream', builtinKycSchema(), 'input-available')),
        onResolve,
        builtinCatalog
      )
    );
    expect(await screen.findByTestId('input-legalName')).toBeInTheDocument();
    // The prior settled marker is still exactly where it was.
    expect(
      document.querySelector('[data-tool-name="show_flow"][data-tool-state="done"]')
    ).not.toBeNull();
  });

  it('B2: an invalid emission resolves an error once; a corrected re-emission on the same call recovers and completes', async () => {
    const onResolve = vi.fn();
    // A schema referencing an unregistered component type — compileFlow rejects it.
    const badSchema = {
      id: 'agentic-kyc-bad',
      name: 'KYC',
      steps: [
        {
          id: 'identity',
          title: 'Identity',
          form: { id: 'identity', fields: [{ id: 'x', type: 'nonexistent', props: {} }] },
        },
      ],
    };

    const view = renderParts(
      sdkMessage([flowPart('call_fix', badSchema)]),
      onResolve,
      builtinCatalog
    );

    // The emission error is announced AND delivered to the model exactly once.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-agent-error', 'emission');
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const [errId, errOut, errTool] = onResolve.mock.calls[0] as [string, any, string];
    expect(errId).toBe('call_fix');
    expect(errTool).toBe('show_flow');
    expect(errOut.status).toBe('error');

    // The model re-emits a CORRECTED single-step schema on the SAME toolCallId.
    const fixedSchema = {
      id: 'agentic-kyc-fixed',
      name: 'KYC',
      steps: [
        {
          id: 'identity',
          title: 'Identity',
          form: {
            id: 'identity',
            fields: [
              {
                id: 'idNumber',
                type: 'text',
                props: { label: 'ID number' },
                validation: { rules: req('ID number is required') },
              },
            ],
          },
        },
      ],
    };
    view.rerender(
      partsTree(sdkMessage([flowPart('call_fix', fixedSchema)]), onResolve, builtinCatalog)
    );

    // The corrected flow is live; the user completes it and the submit resolves.
    const input = await screen.findByTestId('input-idNumber');
    await act(async () => fireEvent.change(input, { target: { value: 'AB1234' } }));
    await clickNext();

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    const [, subOut] = onResolve.mock.calls[1] as [string, any, string];
    expect(subOut).toEqual({ status: 'submitted', values: { identity: { idNumber: 'AB1234' } } });
    // The one-shot latch held: the error was delivered once, the submit once.
    expect(onResolve.mock.calls.filter((c) => (c[1] as any).status === 'error')).toHaveLength(1);
  });
});

// ============================================================================
// GROUP C — mixed multi-turn conversation: text + show_flow + a post-resolve
// data receipt. Resolving the flow appends the agent's next turn.
// ============================================================================

/** A tiny stateful transcript standing in for a `useChat` + addToolResult host:
 *  on resolve it settles the flow in place and appends the next assistant turn. */
function KycConversation({ onResolve }: { onResolve: (...a: unknown[]) => void }) {
  const [messages, setMessages] = useState<unknown[]>([
    sdkMessage([text('Let me verify your identity.'), flowPart('call_verify', builtinKycSchema())]),
  ]);
  const handle = (toolCallId: string, output: unknown, toolName: string) => {
    onResolve(toolCallId, output, toolName);
    setMessages((prev) => {
      // Settle the resolved flow part in place (→ output-available marker).
      const settled = prev.map((m) =>
        JSON.parse(JSON.stringify(settlePart(m, toolCallId, output)))
      );
      return [
        ...settled,
        sdkMessage([
          text('All set — your account is verified.'),
          receipt({ ref: 'KYC-2026-01', holder: 'Ada Lovelace' }),
        ]),
      ];
    });
  };
  return (
    <Catalog value={builtinCatalog as never}>
      {(messages as any[]).map((m) => (
        <section key={m.id + JSON.stringify(m.parts).length} data-message>
          <Parts parts={toParts(m as never) as never} onResolve={handle as never} />
        </section>
      ))}
    </Catalog>
  );
}
function settlePart(msg: unknown, toolCallId: string, output: unknown): unknown {
  const m = msg as { id: string; role: string; parts: any[] };
  return {
    ...m,
    parts: m.parts.map((p) =>
      p.toolCallId === toolCallId ? { ...p, state: 'output-available', output } : p
    ),
  };
}

describe('AGENTIC KYC — mixed conversation (text + show_flow + receipt)', () => {
  it('C1: driving the emitted flow to completion appends the next turn; the flow settles, resolves once', async () => {
    const onResolve = vi.fn();
    // Each conversation section gets a unique key so React keeps them distinct;
    // multiple <Catalog> subtrees would collide on the same message id otherwise.
    render(<KycConversation onResolve={onResolve} />);

    expect(screen.getByText('Let me verify your identity.')).toBeInTheDocument();

    // Drive the full individual KYC to completion.
    await fillIdentity('Ada Lovelace', 'FR');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-country')).toBeInTheDocument());
    await act(async () => setField('country', 'other'));
    await waitFor(() => expect(screen.getByTestId('input-passportNo')).toBeInTheDocument());
    await act(async () => setField('passportNo', 'X-1'));
    await clickNext();
    await setEntity('individual');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-idType')).toBeInTheDocument());
    await act(async () => {
      setField('idType', 'national_id');
      setField('idNumber', 'ID-9');
    });
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-notes')).toBeInTheDocument());
    await clickNext();

    // Resolve fired once with the projected payload.
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const output = onResolve.mock.calls[0][1] as any;
    expect(output.status).toBe('submitted');
    expect(output.values.address).toEqual({ country: 'other', passportNo: 'X-1' });
    expect(output.values.individualDocs).toEqual({ idType: 'national_id', idNumber: 'ID-9' });

    // The next assistant turn appended, with its receipt; the flow is settled
    // (a bare done marker, no live Next).
    expect(await screen.findByText('All set — your account is verified.')).toBeInTheDocument();
    const receiptEl = document.querySelector('[data-receipt]') as HTMLElement;
    expect(receiptEl).toHaveAttribute('data-receipt-ref', 'KYC-2026-01');
    expect(receiptEl).toHaveTextContent('Receipt KYC-2026-01 for Ada Lovelace');
    await waitFor(() =>
      expect(
        document.querySelector('[data-tool-name="show_flow"][data-tool-state="done"]')
      ).not.toBeNull()
    );
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    // The one-shot latch held as the transcript grew.
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// GROUP D — the PRODUCTION host renderer: bindings (cross-field rule + consent),
// completion meta, per-row removal, and persistence the built-in leaves to hosts.
// ============================================================================

describe('AGENTIC KYC — production host renderer (bindings + meta + persistence)', () => {
  it('D1: full company KYC resolves the exact payload AND meta; cross-field sum=100 + consent pass', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', hostKycSchema())]), onResolve, hostCatalog);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();

    // Two owners; PEP on row 0 with an explanation; sum exactly 100.
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '70');
      setCheckbox('owners[k0].isPEP', true);
    });
    await waitFor(() => expect(hasField('owners[k0].pepReason')).toBe(true));
    await act(async () => setField('owners[k0].pepReason', 'Former minister'));
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k1].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '30');
    });
    // Sum is 100 -> the banner is clear.
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());
    await clickNext();

    await waitFor(() => expect(screen.getByTestId('input-incorporationNo')).toBeInTheDocument());
    await act(async () => {
      setField('incorporationNo', 'INC-1');
      setField('taxId', 'TAX-1');
    });
    await clickNext();

    // Consent gate: unchecked -> completion blocked, error visible.
    await waitFor(() => expect(screen.getByTestId('input-consent')).toBeInTheDocument());
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-consent-0')).toHaveTextContent(
        'You must certify to continue'
      )
    );
    expect(onResolve).not.toHaveBeenCalled();

    await act(async () => setCheckbox('consent', true));
    await clickNext();

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const [callId, output, toolName] = onResolve.mock.calls[0] as [string, any, string];
    expect(callId).toBe('call_kyc');
    expect(toolName).toBe('show_flow');
    expect(output.status).toBe('submitted');
    expect(output.values).toEqual({
      identity: { legalName: 'Acme Founder', nationality: 'US' },
      address: { country: 'US', ssn: '123-45-6789', usState: 'CA' },
      entity: { entityType: 'company' },
      ownership: {
        owners: [
          { ownerName: 'Alice', ownershipPct: 70, isPEP: true, pepReason: 'Former minister' },
          { ownerName: 'Bob', ownershipPct: 30, isPEP: false },
        ],
      },
      companyDocs: { incorporationNo: 'INC-1', taxId: 'TAX-1' },
      review: { consent: true },
    });
    // Host renderer forwards completion meta: individualDocs never visited, nothing
    // skipped. `visitedSteps` records the steps navigated TO, so the starting
    // `identity` step is not among them (matches the workflow engine's contract).
    expect(output.meta.skippedSteps).toEqual([]);
    expect(output.meta.visitedSteps).not.toContain('individualDocs');
    expect(output.meta.visitedSteps).toEqual(
      expect.arrayContaining(['address', 'entity', 'ownership', 'companyDocs', 'review'])
    );
  });

  it('D2: a bad ownership sum blocks completion with the banner visible, and clears LIVE on correction', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', hostKycSchema())]), onResolve, hostCatalog);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();

    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '50');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k1].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '40');
    });
    // Sum 90 -> the cross-field banner appears (mode onChange).
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('Ownership must total 100%')
    );

    // Next is blocked while the sum is wrong.
    await clickNext();
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('currently 90%')
    );
    expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument();

    // Correct Bob to 50 -> sum 100 -> the banner clears live, no resubmit.
    await act(async () => setField('owners[k1].ownershipPct', '50'));
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-incorporationNo')).toBeInTheDocument());
  });

  it('D3: removing an owner row re-runs the cross-field sum rule LIVE (banner clears on removal)', async () => {
    const onResolve = vi.fn();
    renderParts(sdkMessage([flowPart('call_kyc', hostKycSchema())]), onResolve, hostCatalog);

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();

    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '100');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k1].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '60');
    });
    // Sum 160 -> banner.
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('currently 160%')
    );

    // Remove Bob -> surviving sum is exactly 100 -> banner clears live.
    await act(async () => fireEvent.click(screen.getByTestId('remove-k1')));
    await waitFor(() =>
      expect(screen.queryByTestId('input-owners[k1].ownerName')).not.toBeInTheDocument()
    );
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());

    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-incorporationNo')).toBeInTheDocument());
  });

  it('D4: persistence — fill partway, unmount, remount the SAME emission -> resumes at ownership with rows/values', async () => {
    const onResolve = vi.fn();
    const view = renderParts(
      sdkMessage([flowPart('call_kyc', hostKycSchema())]),
      onResolve,
      hostCatalog
    );

    await fillIdentity();
    await clickNext();
    await fillAddressUS();
    await clickNext();
    await setEntity('company');
    await clickNext();

    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k0].ownerName', 'Alice');
      setField('owners[k0].ownershipPct', '30');
    });
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k1].ownerName')).toBeInTheDocument()
    );
    await act(async () => {
      setField('owners[k1].ownerName', 'Bob');
      setField('owners[k1].ownershipPct', '70');
    });

    // Wait for the autosave to capture the ownership step (index 3) + both rows.
    await waitFor(async () => {
      const saved = (await ADAPTER.load('agentic-kyc')) as any;
      expect(saved?.currentStepIndex).toBe(3);
      expect(saved?.allData?.ownership?.['owners[k1].ownerName']).toBe('Bob');
    });

    // PAGE RELOAD: unmount, remount the same emission against the same adapter.
    view.unmount();
    renderParts(sdkMessage([flowPart('call_kyc', hostKycSchema())]), onResolve, hostCatalog);

    // Resumed on the ownership step with both rows + values restored.
    await waitFor(() =>
      expect(screen.getByTestId('input-owners[k0].ownerName')).toBeInTheDocument()
    );
    await waitFor(() => {
      expect(screen.getByTestId('input-owners[k0].ownerName')).toHaveValue('Alice');
      expect(screen.getByTestId('input-owners[k0].ownershipPct')).toHaveValue(30);
      expect(screen.getByTestId('input-owners[k1].ownerName')).toHaveValue('Bob');
      expect(screen.getByTestId('input-owners[k1].ownershipPct')).toHaveValue(70);
    });
    // Not reset to identity.
    expect(screen.queryByTestId('input-legalName')).not.toBeInTheDocument();
  });

  it('D5: BOUNDARY — the built-in ShowFlow has NO persistence: unmount/remount restarts at step 0', async () => {
    const onResolve = vi.fn();
    const view = renderParts(
      sdkMessage([flowPart('call_kyc', builtinKycSchema())]),
      onResolve,
      builtinCatalog
    );

    await fillIdentity('Persisted?', 'US');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('input-country')).toBeInTheDocument());

    // Remount the same emission: the built-in renderer wires no adapter, so the
    // flow starts fresh at identity with empty values — the documented boundary
    // (persistence is left to a host renderer; see ShowFlow.tsx & D4).
    view.unmount();
    renderParts(sdkMessage([flowPart('call_kyc', builtinKycSchema())]), onResolve, builtinCatalog);

    await waitFor(() => expect(screen.getByTestId('input-legalName')).toBeInTheDocument());
    expect(screen.getByTestId('input-legalName')).toHaveValue('');
    expect(screen.queryByTestId('input-country')).not.toBeInTheDocument();
  });
});
