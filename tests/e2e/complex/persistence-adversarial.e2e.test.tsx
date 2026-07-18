// WorkflowProvider is the workflow primitive (the all-in-one re-exports `Flow`,
// a wrapper); imported directly, as the sibling persistence e2e does.
import { WorkflowProvider } from '@rilaykit/workflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
/**
 * =============================================================================
 * COMPLEX E2E — Workflow persistence under ADVERSARIAL production conditions.
 *
 * The failure modes a KYC product hits in the wild: a corrupted / wrong-shape /
 * out-of-range persisted blob, an adapter that throws on save/load/remove, a
 * quota-exceeded store, a resume into a step the persisted answers now HIDE,
 * special values (Date/NaN/Infinity/-0/BigInt) round-tripping through the
 * tagged serializer, a legacy bare-JSON blob, rapid autosaves + reload, the
 * completion-clear race (a late save must not resurrect a finished workflow),
 * and a reorder surviving reload.
 *
 * ONE mid-size KYC flow:
 *   0. applicant   (always)   fullName + accountType select
 *   1. business    (accountType ∈ {business, enterprise})  companyName +
 *                             repeatable `owners` (min 1)
 *   2. enterprise  (accountType === enterprise)  taxId
 *   3. review      (always, last)  signature
 *
 * CONTRACTS VERIFIED IN SOURCE BEFORE ASSERTING (see inline notes):
 *   - WorkflowProvider load path clamps a corrupt/out-of-range currentStepIndex
 *     (WorkflowProvider.tsx ~L476-486) and layers the snapshot over defaults.
 *   - A malformed blob whose adapter.load THROWS surfaces via `persistenceError`
 *     (usePersistence.loadPersistedData catch → handleError).
 *   - A malformed blob the adapter returns but the provider cannot merge is
 *     caught in the provider's own try/catch (WorkflowProvider.tsx ~L512) and
 *     degrades to a fresh start WITHOUT surfacing `persistenceError` — an
 *     asymmetry pinned + flagged below as a design observation.
 *   - Completion clears persisted data and the `workflowCompletedRef` guard
 *     stops any later auto-save (usePersistence.ts L138-153, L294;
 *     useWorkflowSubmission.ts L177-187).
 * =============================================================================
 */
import {
  LocalStorageAdapter,
  type PersistedWorkflowData,
  type WorkflowPersistenceAdapter,
  type WorkflowPersistenceError,
  flow,
  form,
  ril,
  when,
} from 'rilaykit';
import { FlowBody, useFlow, useFlowData } from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton } from '../_setup/nav-buttons';
import {
  MockNumberInput,
  MockSelectInput,
  MockTextInput,
  RepeatableControls,
} from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

const WORKFLOW_ID = 'kyc-adversarial';
const STORAGE_KEY = `rilay_workflow_${WORKFLOW_ID}`;

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } })
  .component('number', { name: 'Number', renderer: MockNumberInput, defaultProps: { label: '' } })
  .component('select', {
    name: 'Select',
    renderer: MockSelectInput,
    defaultProps: { label: '', options: [] },
  });

function buildForms() {
  const applicantForm = form
    .create(rilConfig, 'applicant-form')
    .add({ id: 'fullName', type: 'text', props: { label: 'Full name' } })
    .add({
      id: 'accountType',
      type: 'select',
      props: {
        label: 'Account type',
        options: [
          { value: '', label: 'Select...' },
          { value: 'personal', label: 'Personal' },
          { value: 'business', label: 'Business' },
          { value: 'enterprise', label: 'Enterprise' },
        ],
      },
    })
    .build();

  const businessForm = form
    .create(rilConfig, 'business-form')
    .add({ id: 'companyName', type: 'text', props: { label: 'Company' } })
    .addRepeatable('owners', (r) =>
      r
        .add({ id: 'ownerName', type: 'text', props: { label: 'Owner' } })
        .add({ id: 'share', type: 'number', props: { label: 'Share %' } })
        .min(1)
        .defaultValue({ ownerName: '', share: 0 })
    )
    .build();

  const enterpriseForm = form
    .create(rilConfig, 'enterprise-form')
    .add({ id: 'taxId', type: 'text', props: { label: 'Tax ID' } })
    .build();

  const reviewForm = form
    .create(rilConfig, 'review-form')
    .add({ id: 'signature', type: 'text', props: { label: 'Signature' } })
    .build();

  return { applicantForm, businessForm, enterpriseForm, reviewForm };
}

interface BuildFlowOpts {
  adapter?: WorkflowPersistenceAdapter;
  autoPersist?: boolean;
  debounceMs?: number;
}

function buildFlow(opts: BuildFlowOpts = {}) {
  const { applicantForm, businessForm, enterpriseForm, reviewForm } = buildForms();

  const builder = flow
    .create(rilConfig, WORKFLOW_ID, 'KYC onboarding')
    .addStep({ id: 'applicant', title: 'Applicant', formConfig: applicantForm })
    .addStep({
      id: 'business',
      title: 'Business',
      formConfig: businessForm,
      conditions: { visible: when('accountType').in(['business', 'enterprise']).build() },
    })
    .addStep({
      id: 'enterprise',
      title: 'Enterprise',
      formConfig: enterpriseForm,
      conditions: { visible: when('accountType').equals('enterprise').build() },
    })
    .addStep({ id: 'review', title: 'Review', formConfig: reviewForm });

  if (opts.adapter) {
    return builder
      .configure({
        persistence: {
          adapter: opts.adapter,
          options: { autoPersist: opts.autoPersist ?? true, debounceMs: opts.debounceMs ?? 0 },
        },
      })
      .build();
  }
  return builder.build();
}

// ============================================================================
// PROBES / HELPERS
// ============================================================================

function StateProbe() {
  const { workflowState, currentStep } = useFlow();
  const allData = useFlowData();
  return (
    <div>
      <span data-testid="cur-idx">{workflowState.currentStepIndex}</span>
      <span data-testid="cur-id">{currentStep?.id}</span>
      <span data-testid="visited">{Array.from(workflowState.visitedSteps).sort().join(',')}</span>
      <pre data-testid="all-data">
        {JSON.stringify(allData, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}
      </pre>
    </div>
  );
}

function PersistErrorProbe() {
  const { persistenceError } = useFlow();
  const err = persistenceError as WorkflowPersistenceError | null;
  return (
    <div>
      <span data-testid="perr-code">{err ? ((err as { code?: string }).code ?? '') : ''}</span>
      <span data-testid="perr-msg">{err ? err.message : ''}</span>
    </div>
  );
}

function StepVisibilityProbe() {
  const { conditionsHelpers } = useFlow();
  return (
    <div>
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} data-testid={`visible-${i}`}>
          {conditionsHelpers.isStepVisible(i) ? 'true' : 'false'}
        </span>
      ))}
    </div>
  );
}

/**
 * Reads the SPECIAL values back from the raw store slice (`useFlowData()` is the
 * store's internal shape) and reports each value's runtime type + a canonical
 * string. A whole-slice JSON.stringify would throw on the BigInt, so each is
 * inspected individually.
 */
function SpecialValueProbe() {
  const applicant = (useFlowData().applicant ?? {}) as Record<string, unknown>;
  const d = applicant.d;
  const big = applicant.big;
  const nan = applicant.nan;
  const inf = applicant.inf;
  const ninf = applicant.ninf;
  const nz = applicant.nz;
  const huge = applicant.huge;
  return (
    <div>
      <span data-testid="sv-d-isdate">{String(d instanceof Date)}</span>
      <span data-testid="sv-d-time">{d instanceof Date ? String(d.getTime()) : ''}</span>
      <span data-testid="sv-big-type">{typeof big}</span>
      <span data-testid="sv-big-val">{typeof big === 'bigint' ? big.toString() : ''}</span>
      <span data-testid="sv-nan">{String(typeof nan === 'number' && Number.isNaN(nan))}</span>
      <span data-testid="sv-inf">{String(inf === Number.POSITIVE_INFINITY)}</span>
      <span data-testid="sv-ninf">{String(ninf === Number.NEGATIVE_INFINITY)}</span>
      <span data-testid="sv-nz">{String(Object.is(nz, -0))}</span>
      <span data-testid="sv-huge">{String(huge === Number.MAX_VALUE)}</span>
    </div>
  );
}

function renderFlow(
  workflowConfig: ReturnType<typeof buildFlow>,
  extra?: { onComplete?: (data: Record<string, unknown>) => void }
) {
  return render(
    <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={extra?.onComplete}>
      <FlowBody />
      <NextButton />
      <PrevButton />
      <RepeatableControls repeatableId="owners" />
      <StateProbe />
      <PersistErrorProbe />
      <StepVisibilityProbe />
      <SpecialValueProbe />
    </WorkflowProvider>
  );
}

function readPersisted(): Record<string, any> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).data : null;
}

function allData(): Record<string, any> {
  return JSON.parse(screen.getByTestId('all-data').textContent || '{}');
}

/** `ownerName` input values, in DOM (row) order. */
function ownerNamesInOrder(): string[] {
  return Array.from(document.querySelectorAll('input'))
    .filter((el) =>
      /^input-owners\[[^\]]+\]\.ownerName$/.test(el.getAttribute('data-testid') || '')
    )
    .map((el) => (el as HTMLInputElement).value);
}

async function clickNext() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('next-btn'));
  });
}
async function addOwner() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('repeatable-append-owners'));
  });
}
function setField(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

async function fillApplicant(name: string, accountType: string) {
  await waitFor(() => expect(screen.getByTestId('input-fullName')).toBeInTheDocument());
  setField('input-fullName', name);
  setField('input-accountType', accountType);
  await waitFor(() => {
    expect(screen.getByTestId('input-fullName')).toHaveValue(name);
    expect(screen.getByTestId('input-accountType')).toHaveValue(accountType);
  });
}

/** Build a StorageEntry the adapter would recognise, for a raw legacy/bare seed. */
function bareEntry(data: Record<string, unknown>): string {
  return JSON.stringify({ data, version: '1.0.0' });
}

// A no-op-ish backing adapter used where the flow must run but we control one op.
function makeMapAdapter(over: Partial<WorkflowPersistenceAdapter> = {}): {
  adapter: WorkflowPersistenceAdapter;
  store: Map<string, PersistedWorkflowData>;
} {
  const store = new Map<string, PersistedWorkflowData>();
  const adapter: WorkflowPersistenceAdapter = {
    save: async (key, data) => {
      store.set(key, data);
    },
    load: async (key) => store.get(key) ?? null,
    remove: async (key) => {
      store.delete(key);
    },
    exists: async (key) => store.has(key),
    ...over,
  };
  return { adapter, store };
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — persistence under adversarial production conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // S1 — Corrupted / wrong-shape / out-of-range persisted blob
  // --------------------------------------------------------------------------

  it('S1a: non-JSON garbage in storage → starts fresh and surfaces LOAD_FAILED, no white-screen', async () => {
    localStorage.setItem(STORAGE_KEY, 'this is not json {{{ ][');

    // autoPersist:false so a fresh-state auto-save cannot overwrite the garbage
    // (or clear the error) before we observe it.
    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    // Degrades to a fresh flow on the first step.
    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
      expect(screen.getByTestId('cur-id')).toHaveTextContent('applicant');
    });
    expect(screen.getByTestId('input-fullName')).toHaveValue('');

    // adapter.load THREW → error reaches the persistence channel.
    await waitFor(() => expect(screen.getByTestId('perr-code')).toHaveTextContent('LOAD_FAILED'));
    expect(screen.getByTestId('perr-msg').textContent).toContain(
      'Failed to load from localStorage'
    );
  });

  it('S1b: valid-JSON WRONG shape (missing allData) → starts fresh, no crash (error NOT surfaced — design note)', async () => {
    // Shape the adapter returns but the provider cannot merge: mergeStepSlices
    // does Object.entries(undefined) → throws → caught in the provider try/catch
    // (WorkflowProvider.tsx ~L512) → fresh start. The adapter's load path never
    // runs validatePersistedData, so this asymmetry (garbage surfaces an error,
    // wrong-shape does not) is intended-but-silent. Pinned as an observation.
    localStorage.setItem(
      STORAGE_KEY,
      bareEntry({ workflowId: WORKFLOW_ID, visitedSteps: [], stepData: {}, lastSaved: 1 })
    );

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
      expect(screen.getByTestId('cur-id')).toHaveTextContent('applicant');
    });
    expect(screen.getByTestId('input-fullName')).toHaveValue('');
    // Observed contract: NOT surfaced via persistenceError (caught in provider).
    expect(screen.getByTestId('perr-code').textContent).toBe('');
  });

  it('S1c: missing currentStepIndex but allData present → clamps to step 0 and restores data', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      bareEntry({
        workflowId: WORKFLOW_ID,
        allData: { applicant: { fullName: 'Seeded', accountType: 'personal' } },
        stepData: {},
        visitedSteps: ['applicant'],
        lastSaved: 1,
      })
    );

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
      expect(screen.getByTestId('input-fullName')).toHaveValue('Seeded');
    });
  });

  it('S1d: NEGATIVE persisted currentStepIndex → clamps into range (step 0), no strand', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      bareEntry({
        workflowId: WORKFLOW_ID,
        currentStepIndex: -5,
        allData: { applicant: { fullName: 'Neg', accountType: 'personal' } },
        stepData: {},
        visitedSteps: ['applicant'],
        lastSaved: 1,
      })
    );

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
      expect(screen.getByTestId('cur-id')).toHaveTextContent('applicant');
      expect(screen.getByTestId('input-fullName')).toHaveValue('Neg');
    });
  });

  it('S1e: currentStepIndex BEYOND step count → clamps to last visible step (review), no crash', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      bareEntry({
        workflowId: WORKFLOW_ID,
        currentStepIndex: 999,
        allData: {
          applicant: { fullName: 'Big', accountType: 'personal' },
          review: { signature: 'restored-sig' },
        },
        stepData: {},
        visitedSteps: ['applicant', 'review'],
        lastSaved: 1,
      })
    );

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    // lastIndex = 3 (review), review is always visible → lands there.
    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('3');
      expect(screen.getByTestId('cur-id')).toHaveTextContent('review');
    });
    await waitFor(() => expect(screen.getByTestId('input-signature')).toHaveValue('restored-sig'));
  });

  // --------------------------------------------------------------------------
  // S2 — A throwing / rejecting adapter
  // --------------------------------------------------------------------------

  it('S2a: an adapter whose load() REJECTS → fresh start, workflow fully usable, error surfaced', async () => {
    const adapter: WorkflowPersistenceAdapter = {
      save: async () => {},
      load: async () => {
        throw new Error('load boom');
      },
      remove: async () => {},
      exists: async () => false,
    };

    renderFlow(buildFlow({ adapter, autoPersist: false }));

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('applicant'));
    await waitFor(() => expect(screen.getByTestId('perr-msg')).toHaveTextContent('load boom'));

    // Usable: fill + navigate (personal hides business/enterprise → review).
    await fillApplicant('Live', 'personal');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
  });

  it('S2b: an adapter whose save() REJECTS → error surfaced, in-memory state intact, navigation not wedged', async () => {
    const adapter: WorkflowPersistenceAdapter = {
      save: async () => {
        throw new Error('save boom');
      },
      load: async () => null,
      remove: async () => {},
      exists: async () => false,
    };

    renderFlow(buildFlow({ adapter, autoPersist: true, debounceMs: 0 }));

    await fillApplicant('Nadia', 'personal');

    // The failed save surfaces on the error channel...
    await waitFor(() => expect(screen.getByTestId('perr-msg')).toHaveTextContent('save boom'));
    // ...but does NOT corrupt in-memory state...
    expect(screen.getByTestId('input-fullName')).toHaveValue('Nadia');
    // ...and navigation still works.
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    expect(allData().applicant?.fullName).toBe('Nadia');
  });

  it('S2c: an adapter whose remove() REJECTS on completion → workflow still completes, no crash', async () => {
    const onComplete = vi.fn();
    const { adapter: base } = makeMapAdapter();
    const adapter: WorkflowPersistenceAdapter = {
      ...base,
      remove: async () => {
        throw new Error('remove boom');
      },
    };

    renderFlow(buildFlow({ adapter, autoPersist: true, debounceMs: 0 }), { onComplete });

    await fillApplicant('Rex', 'personal');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 'Rex-sig');
    await clickNext(); // complete

    // onComplete is awaited BEFORE the clear (useWorkflowSubmission L167 vs L183),
    // and the clear rejection is caught there (L184) — so completion succeeds and
    // does not crash even though remove() threw.
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0].review?.signature).toBe('Rex-sig');
    // The clear DID run (and its failure surfaced on the error channel) — proof
    // the remove path executed rather than being skipped.
    await waitFor(() => expect(screen.getByTestId('perr-msg')).toHaveTextContent('Clear failed'));
  });

  // --------------------------------------------------------------------------
  // S3 — Quota exceeded on save
  // --------------------------------------------------------------------------

  it('S3: a QuotaExceededError on save → surfaced as QUOTA_EXCEEDED, workflow stays usable', async () => {
    // Construct the adapter FIRST (its availability probe writes once) THEN make
    // every subsequent setItem throw a quota error — otherwise the probe fails
    // and the adapter marks localStorage unavailable, silencing the save path.
    const adapter = new LocalStorageAdapter();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    });

    renderFlow(buildFlow({ adapter, autoPersist: true, debounceMs: 0 }));

    await fillApplicant('Quinn', 'personal');

    // Adapter retries after clearExpiredData, still throws → QUOTA_EXCEEDED.
    await waitFor(() =>
      expect(screen.getByTestId('perr-code')).toHaveTextContent('QUOTA_EXCEEDED')
    );

    // Usable despite the failing store.
    expect(screen.getByTestId('input-fullName')).toHaveValue('Quinn');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
  });

  // --------------------------------------------------------------------------
  // S4 — Resume into a step the persisted answers now HIDE
  // --------------------------------------------------------------------------

  it('S4: persisted at a now-HIDDEN step (enterprise, but accountType=business) → lands on a visible step, data preserved', async () => {
    // Seed via the real adapter so the exact serialization/shape is used.
    const seed = new LocalStorageAdapter();
    await seed.save(WORKFLOW_ID, {
      workflowId: WORKFLOW_ID,
      currentStepIndex: 2, // enterprise — hidden once accountType=business
      allData: {
        applicant: { fullName: 'Bea', accountType: 'business' },
        business: { companyName: 'Acme', 'owners[k0].ownerName': 'O1', 'owners[k0].share': 10 },
        enterprise: { taxId: 'TAX-1' },
      },
      stepData: {},
      visitedSteps: ['applicant', 'business', 'enterprise'],
      passedSteps: ['applicant', 'business'],
      skippedSteps: [],
      lastSaved: Date.now(),
    } as PersistedWorkflowData);

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    // Enterprise is hidden (accountType=business); the hidden-step effect
    // relocates forward to the next visible step (review). It must NOT strand
    // the user on the invisible enterprise step, and must not crash.
    await waitFor(() => {
      expect(screen.getByTestId('cur-id')).not.toHaveTextContent('enterprise');
    });
    await waitFor(() => expect(screen.getByTestId('visible-2')).toHaveTextContent('false'));
    // Landed on a VISIBLE step.
    const landedIdx = Number(screen.getByTestId('cur-idx').textContent);
    expect(screen.getByTestId(`visible-${landedIdx}`)).toHaveTextContent('true');

    // The earlier answers survived the relocation.
    expect(allData().applicant?.fullName).toBe('Bea');
    expect(allData().business?.companyName).toBe('Acme');
    expect(allData().business?.['owners[k0].ownerName']).toBe('O1');
  });

  // --------------------------------------------------------------------------
  // S5 — Special-value round trip + legacy bare-JSON blob
  // --------------------------------------------------------------------------

  it('S5a: Date / NaN / Infinity / -0 / BigInt / MAX_VALUE survive save→load through the tagged serializer', async () => {
    const when = new Date('2020-01-02T03:04:05.000Z');
    const seed = new LocalStorageAdapter();
    await seed.save(WORKFLOW_ID, {
      workflowId: WORKFLOW_ID,
      currentStepIndex: 0,
      allData: {
        applicant: {
          fullName: 'S',
          accountType: 'personal',
          d: when,
          big: 123456789012345678901234567890n,
          nan: Number.NaN,
          inf: Number.POSITIVE_INFINITY,
          ninf: Number.NEGATIVE_INFINITY,
          nz: -0,
          huge: Number.MAX_VALUE,
        },
      },
      stepData: {},
      visitedSteps: ['applicant'],
      passedSteps: [],
      skippedSteps: [],
      lastSaved: Date.now(),
    } as PersistedWorkflowData);

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    await waitFor(() => expect(screen.getByTestId('input-fullName')).toHaveValue('S'));

    await waitFor(() => {
      expect(screen.getByTestId('sv-d-isdate')).toHaveTextContent('true');
      expect(screen.getByTestId('sv-d-time')).toHaveTextContent(String(when.getTime()));
      expect(screen.getByTestId('sv-big-type')).toHaveTextContent('bigint');
      expect(screen.getByTestId('sv-big-val')).toHaveTextContent('123456789012345678901234567890');
      expect(screen.getByTestId('sv-nan')).toHaveTextContent('true');
      expect(screen.getByTestId('sv-inf')).toHaveTextContent('true');
      expect(screen.getByTestId('sv-ninf')).toHaveTextContent('true');
      expect(screen.getByTestId('sv-nz')).toHaveTextContent('true');
      expect(screen.getByTestId('sv-huge')).toHaveTextContent('true');
    });
  });

  it('S5b: a legacy BARE-JSON blob (no type tags) still loads without crashing', async () => {
    // Exactly what an old build's plain JSON.stringify would have written: no
    // tagged wrappers. The reviver passes untagged values straight through.
    localStorage.setItem(
      STORAGE_KEY,
      bareEntry({
        workflowId: WORKFLOW_ID,
        currentStepIndex: 0,
        allData: { applicant: { fullName: 'Legacy', accountType: 'personal' } },
        stepData: {},
        visitedSteps: ['applicant'],
        passedSteps: [],
        skippedSteps: [],
        lastSaved: 1,
      })
    );

    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: false }));

    await waitFor(() => {
      expect(screen.getByTestId('cur-id')).toHaveTextContent('applicant');
      expect(screen.getByTestId('input-fullName')).toHaveValue('Legacy');
    });
    expect(screen.getByTestId('perr-code').textContent).toBe('');
  });

  // --------------------------------------------------------------------------
  // S6 — Rapid autosaves: last write wins (no lost update)
  // --------------------------------------------------------------------------

  it('S6: rapid successive edits persist only the LATEST value, which survives reload', async () => {
    const { unmount } = renderFlow(
      buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: true, debounceMs: 5 })
    );

    await waitFor(() => expect(screen.getByTestId('input-fullName')).toBeInTheDocument());
    setField('input-accountType', 'personal');
    // Rapid-fire edits within the debounce window: only the last should persist.
    setField('input-fullName', 'A');
    setField('input-fullName', 'AB');
    setField('input-fullName', 'ABC');
    await waitFor(() => expect(screen.getByTestId('input-fullName')).toHaveValue('ABC'));

    // The debounced autosave flushes the LATEST state, not an intermediate one.
    await waitFor(() => expect(readPersisted()?.allData?.applicant?.fullName).toBe('ABC'));

    unmount();
    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: true, debounceMs: 5 }));

    await waitFor(() => expect(screen.getByTestId('input-fullName')).toHaveValue('ABC'));
  });

  // --------------------------------------------------------------------------
  // S7 — Completion clears persistence; a late save must not resurrect it
  // --------------------------------------------------------------------------

  it('S7a: completing clears persisted data and a post-completion edit does NOT resurrect it', async () => {
    const onComplete = vi.fn();
    renderFlow(
      buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: true, debounceMs: 0 }),
      { onComplete }
    );

    await fillApplicant('Cleo', 'personal');
    await waitFor(() => expect(readPersisted()).not.toBeNull());

    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 'Cleo-sig');
    await clickNext(); // complete
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(readPersisted()).toBeNull());

    // A change AFTER completion must not schedule a resurrecting save
    // (workflowCompletedRef guard in the auto-persist effect + saveWorkflowState).
    setField('input-signature', 'Cleo-sig-again');
    await new Promise((r) => setTimeout(r, 60));
    expect(readPersisted()).toBeNull();
  });

  it('S7b: a slow save in flight during completion does not resurrect the cleared workflow', async () => {
    const onComplete = vi.fn();
    // Backing-map adapter whose save resolves on a later macrotask, so a save
    // scheduled just before completion resolves AFTER the completion clear.
    const { adapter: base, store } = makeMapAdapter();
    const adapter: WorkflowPersistenceAdapter = {
      ...base,
      save: async (key, data) => {
        await new Promise((r) => setTimeout(r, 40));
        store.set(key, data);
      },
    };

    renderFlow(buildFlow({ adapter, autoPersist: true, debounceMs: 0 }), { onComplete });

    await fillApplicant('Wade', 'personal');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));

    // Schedule a save (in-flight), then complete in the same run.
    setField('input-signature', 'Wade-sig');
    await clickNext(); // complete → sets completed flag → clears

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // Let any in-flight save resolve; the post-await guard must re-remove it.
    await new Promise((r) => setTimeout(r, 120));
    expect(store.has(WORKFLOW_ID)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // S8 — Reorder (move) survives reload — order AND values
  // --------------------------------------------------------------------------

  it('S8: a repeatable REORDER (move down) survives unmount/remount — order and values', async () => {
    const { unmount } = renderFlow(
      buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: true, debounceMs: 0 })
    );

    await fillApplicant('Owen', 'business');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('business'));

    setField('input-owners[k0].ownerName', 'O1');
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    setField('input-owners[k1].ownerName', 'O2');
    await addOwner();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('3')
    );
    setField('input-owners[k2].ownerName', 'O3');
    await waitFor(() => expect(ownerNamesInOrder()).toEqual(['O1', 'O2', 'O3']));

    // Move O1 (index 0) DOWN → O2, O1, O3 (distinct from the move-up cases).
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-move-down-owners-0'));
    });
    await waitFor(() => expect(ownerNamesInOrder()).toEqual(['O2', 'O1', 'O3']));

    // The reordered key order is captured in the persisted mirror.
    await waitFor(() => {
      const p = readPersisted();
      expect(p?.repeatableOrders?.business?.owners).toEqual(['k1', 'k0', 'k2']);
    });

    unmount();
    renderFlow(buildFlow({ adapter: new LocalStorageAdapter(), autoPersist: true, debounceMs: 0 }));

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('business'));
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('3')
    );
    // Reordered (not insertion) order restored, with values intact.
    expect(ownerNamesInOrder()).toEqual(['O2', 'O1', 'O3']);
  });
});
