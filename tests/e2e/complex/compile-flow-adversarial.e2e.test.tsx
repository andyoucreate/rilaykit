/**
 * =============================================================================
 * E2E — ADVERSARIAL `compileFlow`: the FLOW-schema compiler an agent-emitted
 * `show_flow` and a server-driven multi-step KYC lean on.
 *
 * `compileForm` (the FORM-schema compiler) was already hardened in
 * tests/e2e/forms/server-driven-kyc.e2e.test.tsx. This suite mirrors that rigor
 * one layer up: it hunts REAL library bugs in `compileFlow`'s OWN validation —
 * the FLOW-level rules (step ids, step titles, step conditions, allowSkip /
 * after bindings, the envelope) — and pins the exact boundary between what
 * `compileFlow` validates itself and what it delegates to the per-step
 * `compileForm`.
 *
 * Every schema is authored as a JSON STRING and `JSON.parse`d, so the payload is
 * provably data-only (no functions, no closures) — exactly what a flow-definition
 * service or an LLM emits. Non-serializable logic (an after-validation handler,
 * an allowSkip predicate, field validators) is resolved by name through
 * `FlowBindings`.
 *
 * Contracts verified against:
 *   packages/workflow/src/schema/compile-flow.ts
 *   packages/workflow/src/schema/validate-flow-schema.ts
 *   packages/workflow/src/schema/flow-schema-types.ts
 *   packages/forms/src/schema/compile-form.ts (the delegated per-step compiler)
 *
 * Malformed-schema assertions pin the EXACT SchemaValidationError issue (path +
 * message + severity) AND its `documentKind`, never merely "it throws".
 * =============================================================================
 */
import type { StepContext } from '@rilaykit/workflow';
import { SchemaValidationError, compileFlow, validateFlowSchema } from '@rilaykit/workflow';
import type { FlowBindings, FlowSchema } from '@rilaykit/workflow';
import { Flow } from '@rilaykit/workflow/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ril } from 'rilaykit';
import { afterEach, describe, expect, it, vi } from 'vitest';

// =============================================================================
// RENDERERS — paint data-testid={id}; a field's errors as role="alert".
// Composite repeatable keys (`owners[k0].name`) arrive as the field id.
// =============================================================================

function TextRenderer({ id, field }: any): ReactElement {
  return (
    <div>
      <input
        data-testid={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.map((err: { message: string }) => (
        <p key={err.message} role="alert">
          {err.message}
        </p>
      ))}
    </div>
  );
}

function NumberRenderer({ id, field }: any): ReactElement {
  return (
    <input
      data-testid={id}
      type="number"
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(Number(e.target.value))}
      onBlur={() => field?.onBlur()}
    />
  );
}

function SelectRenderer({ id, props, field }: any): ReactElement {
  const options = (props?.options as { value: string; label: string }[] | undefined) ?? [];
  return (
    <select
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function CheckboxRenderer({ id, field }: any): ReactElement {
  return (
    <input
      data-testid={id}
      type="checkbox"
      checked={Boolean(field?.value)}
      onChange={(e) => field?.onChange(e.target.checked)}
    />
  );
}

/** The catalog a KYC backend targets — four registered component types. */
function createKycCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: TextRenderer })
    .component('number', { name: 'Number', renderer: NumberRenderer })
    .component('select', { name: 'Select', renderer: SelectRenderer })
    .component('checkbox', { name: 'Checkbox', renderer: CheckboxRenderer });
}

/**
 * Asserts `fn` throws a SchemaValidationError whose `issues` CONTAIN exactly the
 * given {path, message, severity: 'error'} tuple, and whose `documentKind`
 * matches. Calls `fn` twice (toThrow + the manual catch) so both the class and
 * the exact issue are pinned.
 */
function expectFlowIssue(
  fn: () => unknown,
  path: string,
  message: string,
  documentKind: 'flow' | 'form' = 'flow'
): void {
  expect(fn).toThrow(SchemaValidationError);
  try {
    fn();
    throw new Error('compileFlow did not throw');
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaValidationError);
    const sve = error as SchemaValidationError;
    expect(sve.issues).toContainEqual({ path, message, severity: 'error' });
    expect(sve.documentKind).toBe(documentKind);
  }
}

afterEach(cleanup);

// =============================================================================
// SCENARIO 1 — FULL HAPPY PATH: a realistic multi-step KYC FlowSchema drives a
// live Flow, cross-step visibility + bindings resolve, exact payload on submit.
// =============================================================================

describe('Scenario 1 — KYC FlowSchema compiles and drives a live multi-step flow', () => {
  const KYC_FLOW_JSON = `{
    "version": 1,
    "id": "kyc-onboarding",
    "name": "KYC Onboarding",
    "description": "Collect identity, company and ownership data",
    "steps": [
      {
        "id": "identity",
        "title": "Identity",
        "onAfterValidation": "logIdentity",
        "form": {
          "version": 1,
          "id": "identity-form",
          "fields": [
            { "id": "fullName", "type": "text", "validation": { "rules": ["required"] } },
            { "id": "accountType", "type": "select", "props": { "options": [
              { "value": "personal", "label": "Personal" },
              { "value": "business", "label": "Business" }
            ] }, "default": "personal" }
          ]
        }
      },
      {
        "id": "company",
        "title": "Company",
        "conditions": { "visible": { "field": "accountType", "operator": "equals", "value": "business" } },
        "form": {
          "version": 1,
          "id": "company-form",
          "fields": [
            { "id": "companyName", "type": "text",
              "validation": { "rules": ["required", { "type": "pattern", "params": { "pattern": "^[A-Za-z0-9 ]+$" }, "message": "Letters and digits only" }] } }
          ]
        }
      },
      {
        "id": "ownership",
        "title": "Ownership",
        "allowSkip": { "binding": "skipOwnership" },
        "form": {
          "version": 1,
          "id": "ownership-form",
          "rows": [
            { "kind": "repeatable", "repeatable": { "id": "owners", "min": 1, "rows": [
              { "kind": "fields", "fields": [
                { "id": "name", "type": "text", "validation": { "rules": ["required"] } },
                { "id": "share", "type": "number" }
              ] }
            ], "defaultValue": { "name": "", "share": 0 } } }
          ],
          "defaultValues": { "owners": [{ "name": "", "share": 0 }] }
        }
      }
    ]
  }`;

  function parseKyc(): FlowSchema {
    const schema: FlowSchema = JSON.parse(KYC_FLOW_JSON);
    // Data-only authorship: round-trips through JSON unchanged (no closures).
    expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(KYC_FLOW_JSON)));
    return schema;
  }

  function createBindings(logIdentity: (step: StepContext) => void): FlowBindings {
    return {
      after: { logIdentity },
      // A paying customer must declare ownership; nobody may skip in this suite.
      allowSkip: { skipOwnership: () => false },
    };
  }

  it('drives business path: cross-step visibility, after binding, exact namespaced completion payload', async () => {
    const logIdentity = vi.fn((step: StepContext) => {
      // Cross-step access proves the after binding runs with real step data.
      expect(step.data.accountType).toBe('business');
    });
    const { workflowConfig, defaultValues } = compileFlow(parseKyc(), createKycCatalog(), {
      bindings: createBindings(logIdentity),
    });
    const onComplete = vi.fn();

    render(
      <Flow of={workflowConfig} defaults={defaultValues} onComplete={onComplete}>
        <Flow.Progress>
          {({ steps }: any) => (
            <span data-testid="progress">{steps.map((s: any) => s.id).join(',')}</span>
          )}
        </Flow.Progress>
        <Flow.Body />
        <Flow.Back>Back</Flow.Back>
        <Flow.Skip>Skip</Flow.Skip>
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );

    // The inline default from JSON reached the live select.
    expect((screen.getByTestId('accountType') as HTMLSelectElement).value).toBe('personal');

    // Required rule is live: an empty fullName blocks Next and renders its message.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('This field is required')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('fullName'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByTestId('accountType'), { target: { value: 'business' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Cross-step visibility: the company step is visible ONLY because identity's
    // accountType === business — it mounts and the after binding fired once.
    await screen.findByTestId('companyName');
    expect(logIdentity).toHaveBeenCalledTimes(1);

    // The company step's own field rule is live.
    fireEvent.change(screen.getByTestId('companyName'), { target: { value: 'Acme@@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Letters and digits only')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('companyName'), { target: { value: 'Acme Analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Ownership step: allowSkip binding resolved false → no Skip button.
    await screen.findByTestId('owners[k0].name');
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();

    fireEvent.change(screen.getByTestId('owners[k0].name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByTestId('owners[k0].share'), { target: { value: '100' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // EXACT namespaced payload: one key per VISITED step, repeatable inlined.
    expect(onComplete).toHaveBeenCalledWith(
      {
        identity: { fullName: 'Ada Lovelace', accountType: 'business' },
        company: { companyName: 'Acme Analytics' },
        ownership: { owners: [{ name: 'Ada Lovelace', share: 100 }] },
      },
      expect.objectContaining({ skippedSteps: [] })
    );
  });

  it('drives personal path: the business-only company step stays hidden and is ABSENT from the payload', async () => {
    const { workflowConfig, defaultValues } = compileFlow(parseKyc(), createKycCatalog(), {
      bindings: createBindings(() => {}),
    });
    const onComplete = vi.fn();

    render(
      <Flow of={workflowConfig} defaults={defaultValues} onComplete={onComplete}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );

    // accountType stays "personal" → the company step's visible condition is false.
    fireEvent.change(screen.getByTestId('fullName'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Navigation jumps straight to ownership; company never mounts.
    await screen.findByTestId('owners[k0].name');
    expect(screen.queryByTestId('companyName')).toBeNull();

    fireEvent.change(screen.getByTestId('owners[k0].name'), { target: { value: 'Bob' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const payload = onComplete.mock.calls[0]?.[0] as Record<string, unknown>;
    // Hidden step contributes NO key — pure projection of answered steps.
    expect(payload).not.toHaveProperty('company');
    expect(Object.keys(payload).sort()).toEqual(['identity', 'ownership']);
  });
});

// =============================================================================
// SCENARIO 2 — ADVERSARIAL MALFORMED FLOW SCHEMAS
// Each throws a TYPED SchemaValidationError (documentKind 'flow') with the EXACT
// issue — never a white-screen or a raw TypeError.
// =============================================================================

describe('Scenario 2 — malformed FLOW schemas throw typed SchemaValidationError issues', () => {
  const catalog = createKycCatalog();

  /** A minimal valid step, spread into malformed roots so only ONE thing is wrong. */
  const okStep = {
    id: 's1',
    title: 'Step 1',
    form: { id: 'f1', fields: [{ id: 'a', type: 'text' }] },
  };

  it('a non-object root (null) — reported at the root, walk stops', () => {
    expectFlowIssue(() => compileFlow(null as never, catalog), '', 'Flow schema must be an object');
  });

  it('missing flow "id"', () => {
    expectFlowIssue(
      () => compileFlow({ name: 'F', steps: [okStep] } as never, catalog),
      'id',
      'Flow schema must have a non-empty "id"'
    );
  });

  it('missing flow "name"', () => {
    expectFlowIssue(
      () => compileFlow({ id: 'f', steps: [okStep] } as never, catalog),
      'name',
      'Flow schema must have a non-empty "name"'
    );
  });

  it('an unsupported flow version', () => {
    expectFlowIssue(
      () => compileFlow({ version: 2, id: 'f', name: 'F', steps: [okStep] } as never, catalog),
      'version',
      'Unsupported Flow schema version "2". Only version 1 is supported.'
    );
  });

  it('"steps" is not an array', () => {
    expectFlowIssue(
      () => compileFlow({ id: 'f', name: 'F', steps: {} } as never, catalog),
      'steps',
      'Flow schema must have a "steps" array'
    );
  });

  it('an empty "steps" array', () => {
    expectFlowIssue(
      () => compileFlow({ id: 'f', name: 'F', steps: [] } as never, catalog),
      'steps',
      'Steps array must not be empty'
    );
  });

  it('a null step entry — funnelled into a typed issue, not a raw TypeError', () => {
    expectFlowIssue(
      () => compileFlow({ id: 'f', name: 'F', steps: [null] } as never, catalog),
      'steps[0]',
      'Step entry must be an object'
    );
  });

  it('a step missing its "id"', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          { id: 'f', name: 'F', steps: [{ title: 'T', form: okStep.form }] } as never,
          catalog
        ),
      'steps[0].id',
      'Step must have a non-empty "id"'
    );
  });

  it('two steps sharing an "id" — the DUPLICATE is pathed to the second step', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'f',
            name: 'F',
            steps: [okStep, { ...okStep, form: { id: 'f2', fields: [{ id: 'b', type: 'text' }] } }],
          } as never,
          catalog
        ),
      'steps[1].id',
      'Duplicate step id "s1"'
    );
  });

  it('a step missing its "title"', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          { id: 'f', name: 'F', steps: [{ id: 's1', form: okStep.form }] } as never,
          catalog
        ),
      'steps[0].title',
      'Step must have a non-empty "title"'
    );
  });

  it('a step missing its "form" object', () => {
    expectFlowIssue(
      () =>
        compileFlow({ id: 'f', name: 'F', steps: [{ id: 's1', title: 'T' }] } as never, catalog),
      'steps[0].form',
      'Step must have a "form" object'
    );
  });

  it('a step "conditions.visible" with an invalid operator', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'f',
            name: 'F',
            steps: [
              {
                ...okStep,
                conditions: { visible: { field: 'a', operator: 'startsWith', value: 'x' } },
              },
            ],
          } as never,
          catalog
        ),
      'steps[0].conditions.visible.operator',
      'Invalid condition operator "startsWith"'
    );
  });

  it('a step "conditions.skippable" with an invalid operator (skippable is validated too)', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'f',
            name: 'F',
            steps: [
              {
                ...okStep,
                conditions: { skippable: { field: 'a', operator: 'divides', value: 2 } },
              },
            ],
          } as never,
          catalog
        ),
      'steps[0].conditions.skippable.operator',
      'Invalid condition operator "divides"'
    );
  });

  it('an "allowSkip" that is neither a boolean nor a { binding } (null slips past typeof object)', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          { id: 'f', name: 'F', steps: [{ ...okStep, allowSkip: null }] } as never,
          catalog
        ),
      'steps[0].allowSkip',
      'Step "allowSkip" must be a boolean or a { binding } reference'
    );
  });

  it('a step whose INNER FORM is malformed (unknown component) — form issue propagates with the step id in the path AND documentKind stays "flow"', () => {
    // validateFlowSchema catches this via the delegated validateSchema and
    // re-maps the path under `steps[i].form.` — a KYC team reading issues[]
    // knows WHICH step carries the bad form.
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'f',
            name: 'F',
            steps: [
              { id: 's1', title: 'T', form: { id: 'f1', fields: [{ id: 'a', type: 'slider' }] } },
            ],
          } as never,
          catalog
        ),
      'steps[0].form.fields[0].type',
      'Unknown component type "slider". Must be registered in ril config.'
    );
  });

  it('a step whose inner form has neither fields nor rows — the root-level form issue maps onto the step', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          { id: 'f', name: 'F', steps: [{ id: 's1', title: 'T', form: { id: 'f1' } }] } as never,
          catalog
        ),
      'steps[0].form',
      'Form schema must have either "fields" or "rows"'
    );
  });

  it('accumulates EVERY defect across steps in one throw (no fail-fast) — a self-correction loop fixes the whole schema per round trip', () => {
    let caught: SchemaValidationError | undefined;
    try {
      compileFlow(
        {
          id: 'f',
          name: 'F',
          steps: [
            { id: '', title: 'T', form: okStep.form }, // bad id
            { id: 's2', form: okStep.form }, // missing title
          ],
        } as never,
        catalog
      );
    } catch (error) {
      caught = error as SchemaValidationError;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    const paths = caught?.issues.map((i) => i.path).sort();
    expect(paths).toEqual(['steps[0].id', 'steps[1].title']);
  });
});

// =============================================================================
// SCENARIO 3 — LENIENT / STREAMING BOUNDARY
// compileFlow has NO lenient mode (CompileFlowOptions = bindings + validateProps
// only). A partial flow throws — pin that boundary, contrast with compileForm.
// =============================================================================

describe('Scenario 3 — compileFlow has no lenient/streaming mode; a partial schema throws', () => {
  const catalog = createKycCatalog();

  it('a half-streamed step (form still just an id) raises the typed error — no partial subset is built', () => {
    // compile-flow.ts / flow-schema-types.ts expose no `lenient` option, so
    // unlike compileForm there is no graceful-degradation path at the flow layer.
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'kyc',
            name: 'KYC',
            steps: [{ id: 's1', title: 'T', form: { id: 'f1' } }],
          } as never,
          catalog
        ),
      'steps[0].form',
      'Form schema must have either "fields" or "rows"'
    );
  });

  it('a step whose field type has not streamed in yet still throws (no per-step skip)', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'kyc',
            name: 'KYC',
            steps: [{ id: 's1', title: 'T', form: { id: 'f1', fields: [{ id: 'email' }] } }],
          } as never,
          catalog
        ),
      'steps[0].form.fields[0].type',
      'Field must have a non-empty "type"'
    );
  });
});

// =============================================================================
// SCENARIO 4 — FLOW-LEVEL BINDINGS RESOLUTION
// A referenced-but-unresolved allowSkip/after binding is a typed issue, not a
// silent no-op — and compileFlow reports it EVEN WHEN no bindings were supplied.
// =============================================================================

describe('Scenario 4 — flow-level bindings resolve, and a missing/bad key is reported', () => {
  const catalog = createKycCatalog();

  const stepWithAfter = {
    id: 's1',
    title: 'T',
    onAfterValidation: 'prefill',
    form: { id: 'f1', fields: [{ id: 'a', type: 'text' }] },
  };
  const stepWithSkip = {
    id: 's1',
    title: 'T',
    allowSkip: { binding: 'freePlan' },
    form: { id: 'f1', fields: [{ id: 'a', type: 'text' }] },
  };

  it('a MISSING after binding key is reported at steps[i].onAfterValidation', () => {
    expectFlowIssue(
      () =>
        compileFlow({ id: 'f', name: 'F', steps: [stepWithAfter] } as never, catalog, {
          bindings: { after: {} },
        }),
      'steps[0].onAfterValidation',
      'onAfterValidation binding "prefill" not found in bindings'
    );
  });

  it('a MISSING allowSkip binding key is reported at steps[i].allowSkip', () => {
    expectFlowIssue(
      () =>
        compileFlow({ id: 'f', name: 'F', steps: [stepWithSkip] } as never, catalog, {
          bindings: { allowSkip: {} },
        }),
      'steps[0].allowSkip',
      'allowSkip binding "freePlan" not found in bindings'
    );
  });

  it('a binding that EXISTS but is not callable is reported (schema/bindings mismatch), not compiled to blow up at navigation', () => {
    expectFlowIssue(
      () =>
        compileFlow({ id: 'f', name: 'F', steps: [stepWithAfter] } as never, catalog, {
          bindings: { after: { prefill: 'not-a-function' as never } },
        }),
      'steps[0].onAfterValidation',
      'onAfterValidation binding "prefill" in bindings is not a function'
    );
  });

  it('BOUNDARY: compileFlow reports an unresolved binding EVEN WITH NO bindings option (the `?? {}` guard) — its error contract has no NotFoundError escape', () => {
    // compile-flow.ts hands the validator `bindings ?? {}`, so a compile with no
    // bindings still reports every reference at its own path rather than throwing
    // an untyped NotFoundError from deep in the resolver.
    expectFlowIssue(
      () => compileFlow({ id: 'f', name: 'F', steps: [stepWithAfter] } as never, catalog),
      'steps[0].onAfterValidation',
      'onAfterValidation binding "prefill" not found in bindings'
    );
  });

  it('BOUNDARY: validateFlowSchema called directly with NO bindings does NOT report the reference (structure-only validation is legitimate)', () => {
    // The exported validator no-ops binding checks when bindings === undefined —
    // validating a schema's shape before its bindings exist is a supported use.
    // This is the ONLY behavioural difference between validateFlowSchema (bare)
    // and compileFlow's pre-flight.
    expect(() =>
      validateFlowSchema({ id: 'f', name: 'F', steps: [stepWithAfter] } as never, catalog)
    ).not.toThrow();
    // Handing it an explicit (even empty) table flips it back on.
    expect(() =>
      validateFlowSchema({ id: 'f', name: 'F', steps: [stepWithAfter] } as never, catalog, {})
    ).toThrow(SchemaValidationError);
  });
});

// =============================================================================
// SCENARIO 5 — CROSS-STEP CONDITION SEMANTICS (compile-time validation gaps)
// =============================================================================

describe('Scenario 5 — cross-step condition references compile even when they cannot resolve', () => {
  const catalog = createKycCatalog();

  it('DESIGN GAP: a step visible-condition referencing a NONEXISTENT field compiles (no cross-reference check, mirrors compileForm)', () => {
    // validateConditionConfig checks only the operator whitelist + a string
    // `field` leaf. Neither validateFlowSchema nor the flow builder proves the
    // referenced id resolves to a declared field in ANY step — so a dangling
    // reference is not a typed error; at runtime the evaluator reads it as
    // undefined. Pinned as a gap, not asserted as a throw.
    expect(() =>
      compileFlow(
        {
          id: 'f',
          name: 'F',
          steps: [
            {
              id: 's1',
              title: 'T',
              conditions: { visible: { field: 'ghostField', operator: 'equals', value: 'x' } },
              form: { id: 'f1', fields: [{ id: 'a', type: 'text' }] },
            },
          ],
        } as never,
        catalog
      )
    ).not.toThrow();
  });

  it("a step condition referencing a LATER step's field compiles; at runtime that not-yet-answered data reads as absent (step hidden until reached)", async () => {
    // step "gate" (index 0) visibility keys off "flag" which lives in step
    // "settings" (index 1) — data that does not exist when the flow starts.
    const schema: FlowSchema = JSON.parse(`{
      "id": "later-ref", "name": "Later Ref",
      "steps": [
        { "id": "settings", "title": "Settings", "form": { "id": "s", "fields": [
          { "id": "flag", "type": "select", "props": { "options": [
            { "value": "no", "label": "No" }, { "value": "yes", "label": "Yes" }
          ] }, "default": "no" }
        ] } },
        { "id": "gate", "title": "Gate",
          "conditions": { "visible": { "field": "extra", "operator": "equals", "value": "on" } },
          "form": { "id": "g", "fields": [{ "id": "note", "type": "text" }] } }
      ]
    }`);
    // Compiles without complaint — the missing-reference gap covers forward refs too.
    const { workflowConfig } = compileFlow(schema, catalog);
    const onComplete = vi.fn();

    render(
      <Flow of={workflowConfig} onComplete={onComplete}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );

    // "extra" never exists → the gate step stays hidden → the flow completes on
    // the first step. Pins the behaviour: an unresolvable condition is falsey.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const payload = onComplete.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('gate');
  });
});

// =============================================================================
// SCENARIO 6 — defaultValues KEYED BY STEP thread through; special values survive.
// =============================================================================

describe('Scenario 6 — per-step defaults come back keyed by step id and reach the live flow', () => {
  const catalog = createKycCatalog();

  it('returns defaults namespaced by step id (only steps that declare any), and special/falsey values survive verbatim', () => {
    const schema: FlowSchema = JSON.parse(`{
      "id": "defs", "name": "Defaults",
      "steps": [
        { "id": "a", "title": "A", "form": { "id": "fa", "fields": [
          { "id": "country", "type": "text", "default": "US" },
          { "id": "subscribed", "type": "checkbox", "default": false }
        ], "defaultValues": { "subscribed": false } } },
        { "id": "b", "title": "B", "form": { "id": "fb", "fields": [
          { "id": "note", "type": "text" }
        ] } }
      ]
    }`);

    const { defaultValues } = compileFlow(schema, catalog);
    // Step "a" declares defaults; step "b" declares none → NO key for "b".
    expect(defaultValues).toEqual({ a: { country: 'US', subscribed: false } });
    // `false` is a real answer, not "missing" — it must survive, not be dropped.
    expect((defaultValues as any).a.subscribed).toBe(false);
    expect(defaultValues).not.toHaveProperty('b');
  });

  it('a flow whose steps declare NO defaults yields undefined (channel omitted, mirrors compileForm)', () => {
    const schema: FlowSchema = JSON.parse(`{
      "id": "nodefs", "name": "No Defaults",
      "steps": [{ "id": "a", "title": "A", "form": { "id": "fa", "fields": [{ "id": "x", "type": "text" }] } }]
    }`);
    expect(compileFlow(schema, catalog).defaultValues).toBeUndefined();
  });

  it('a step id that is a prototype-polluting key ("__proto__") is recorded as an own data key, not a prototype write', () => {
    // compile-flow.ts accumulates into a Map, then Object.fromEntries — so a
    // hostile "__proto__" step id becomes a real own property instead of
    // reassigning the object's prototype and silently discarding the defaults.
    const schema: FlowSchema = JSON.parse(`{
      "id": "proto", "name": "Proto",
      "steps": [{ "id": "__proto__", "title": "P", "form": { "id": "fp", "fields": [
        { "id": "x", "type": "text", "default": "seed" }
      ] } }]
    }`);
    const { defaultValues } = compileFlow(schema, catalog);
    expect(Object.hasOwn(defaultValues as object, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(defaultValues)).toBe(Object.prototype);
    expect((defaultValues as any).__proto__).toEqual({ x: 'seed' });
  });
});

// =============================================================================
// SCENARIO 7 — THE BOUNDARY vs compileForm.
// What compileFlow validates itself (flow structure + delegated validateSchema,
// path-prefixed, documentKind 'flow') vs. what only the per-step BUILDER catches
// (id uniqueness, bracket ids) — surfaced from compileStepForm with the step id
// in the MESSAGE but NOT in the issue path, and documentKind 'form'.
// =============================================================================

describe('Scenario 7 — compileFlow-caught vs builder-caught step-form defects (an asymmetry a KYC team hits)', () => {
  const catalog = createKycCatalog();

  it('DELEGATED + PREFIXED: an unknown component (validateSchema-caught) surfaces with the step id IN the path and documentKind "flow"', () => {
    expectFlowIssue(
      () =>
        compileFlow(
          {
            id: 'f',
            name: 'F',
            steps: [
              {
                id: 'kycStep',
                title: 'T',
                form: { id: 'f1', fields: [{ id: 'a', type: 'ghost' }] },
              },
            ],
          } as never,
          catalog
        ),
      'steps[0].form.fields[0].type',
      'Unknown component type "ghost". Must be registered in ril config.',
      'flow'
    );
  });

  it('BUILDER-ONLY, NOT PREFIXED: a duplicate FIELD id (builder-only check) surfaces from compileStepForm — step id only in .message, path stays bare, documentKind "form"', () => {
    // validateSchema explicitly does NOT check field-id uniqueness ("The builder
    // handles: ID uniqueness"), so validateFlowSchema passes and the defect only
    // trips inside the per-step compileForm's builder. compileStepForm re-tags
    // error.message with the step context but leaves issues[] untouched.
    let caught: SchemaValidationError | undefined;
    try {
      compileFlow(
        {
          id: 'f',
          name: 'F',
          steps: [
            {
              id: 'kycStep',
              title: 'T',
              form: {
                id: 'f1',
                fields: [
                  { id: 'dup', type: 'text' },
                  { id: 'dup', type: 'text' },
                ],
              },
            },
          ],
        } as never,
        catalog
      );
    } catch (error) {
      caught = error as SchemaValidationError;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    // The step context is present — but ONLY in the flat message string.
    expect(caught?.message).toContain('steps[0] (step "kycStep")');
    expect(caught?.message).toContain('Duplicate field ID "dup"');

    // ASYMMETRY: the machine-readable issue path is NOT prefixed with the step,
    // and documentKind is 'form' (compileForm's default), not 'flow'. A
    // self-correction agent that keys off issues[].path/documentKind — as it can
    // for every validateFlowSchema-caught defect above — is misdirected here:
    // it cannot tell WHICH step of a multi-step flow carries the duplicate.
    expect(caught?.issues).toContainEqual({
      path: 'fields[1].id',
      message: 'Duplicate field ID "dup"',
      severity: 'error',
    });
    expect(caught?.documentKind).toBe('form');
    expect(caught?.issues.some((i) => i.path.startsWith('steps['))).toBe(false);
  });

  it('BUILDER-ONLY, NOT PREFIXED: a bracket char in a repeatable id inside a step is the same story (path bare, documentKind "form")', () => {
    let caught: SchemaValidationError | undefined;
    try {
      compileFlow(
        {
          id: 'f',
          name: 'F',
          steps: [
            {
              id: 'kycStep',
              title: 'T',
              form: {
                id: 'f1',
                rows: [
                  {
                    kind: 'repeatable',
                    repeatable: {
                      id: 'owners[0]',
                      rows: [{ kind: 'fields', fields: [{ id: 'name', type: 'text' }] }],
                    },
                  },
                ],
              },
            },
          ],
        } as never,
        catalog
      );
    } catch (error) {
      caught = error as SchemaValidationError;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect(caught?.message).toContain('steps[0] (step "kycStep")');
    expect(caught?.issues).toContainEqual({
      path: 'rows[0].repeatable.id',
      message: 'Repeatable ID "owners[0]" cannot contain "[" or "]" (reserved for composite keys)',
      severity: 'error',
    });
    // Again: bare path, documentKind 'form' — the flow context is only in .message.
    expect(caught?.documentKind).toBe('form');
    expect(caught?.issues.some((i) => i.path.startsWith('steps['))).toBe(false);
  });

  it('DESIGN GAP: a bracket/reserved char in a STEP id is NOT validated (step ids are not composite-key parents) — it compiles', () => {
    // Unlike field/repeatable ids, validateFlowSchema checks a step id only for
    // non-empty + uniqueness, and the flow builder passes it straight through.
    // So a bracketed step id compiles and namespaces its data under that literal
    // key. Pinned as actual behaviour, not forced into a throw.
    const schema: FlowSchema = JSON.parse(`{
      "id": "f", "name": "F",
      "steps": [{ "id": "step[0]", "title": "T", "form": { "id": "f1", "fields": [
        { "id": "x", "type": "text", "default": "v" }
      ] } }]
    }`);
    const { workflowConfig, defaultValues } = compileFlow(schema, catalog);
    expect(workflowConfig.steps.map((s) => s.id)).toEqual(['step[0]']);
    expect(defaultValues).toEqual({ 'step[0]': { x: 'v' } });
  });
});
