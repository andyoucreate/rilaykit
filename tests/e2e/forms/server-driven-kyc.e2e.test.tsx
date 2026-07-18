/**
 * =============================================================================
 * E2E — SERVER-DRIVEN KYC: a backend sends pure JSON, `compileForm` turns it
 * into a live, validated, submittable KYC form.
 *
 * Every schema here is authored as a JSON STRING and `JSON.parse`d, so the
 * payload is provably data-only (no functions, no closures) — exactly what a
 * form-definition service emits. Non-serializable logic (a server uniqueness
 * check, a derive-on-change effect, a cross-field rule) is resolved by name
 * through `bindings`.
 *
 * The validation-timing API is the NEW one: a form schema's `validation` carries
 * `mode` / `reValidateMode` (RHF names); a field's `validation` carries `rules`
 * (+ optional `debounceMs`). There is no `validateOnSubmit` / `validateOnChange`.
 *
 * Contracts are verified against packages/forms/src/schema/compile-form.ts and
 * types.ts. Malformed-schema assertions pin the EXACT SchemaValidationError
 * issue (path + message + severity), never merely "it throws".
 * =============================================================================
 */
import { async as asyncValidator } from '@rilaykit/core';
import type { FieldEffectContext, StandardSchema } from '@rilaykit/core';
import { SchemaValidationError, compileForm } from '@rilaykit/forms';
import type { Bindings, FormSchema } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ril } from 'rilaykit';
import { Form, useFormErrors, useFormValid, useRepeatableField } from 'rilaykit/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// =============================================================================
// RENDERERS — paint data-testid={id} and each field error as role="alert".
// Composite repeatable keys (`owners[k0].name`) become the input's testid.
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

/** A catalog whose `text` component declares a propsSchema (for validateProps). */
function createPropsCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    propsSchema: z.object({ label: z.string(), maxLength: z.number() }),
    renderer: TextRenderer,
  });
}

/** A real (non-mocked) async delay so uniqueness exercises the genuine path. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Add/remove controls for a repeatable, driven only by the public hook. */
function RepeatableControls({ id }: { id: string }): ReactElement {
  const { append, remove, count, canAdd, canRemove, items } = useRepeatableField(id);
  return (
    <div>
      <span data-testid={`count-${id}`}>{count}</span>
      <button type="button" data-testid={`add-${id}`} onClick={() => append()} disabled={!canAdd}>
        Add
      </button>
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          data-testid={`remove-${id}-${item.key}`}
          onClick={() => remove(item.key)}
          disabled={!canRemove}
        >
          Remove
        </button>
      ))}
    </div>
  );
}

/** Live mirror of the form's isValid flag. */
function ValidFlag(): ReactElement {
  const isValid = useFormValid();
  return <span data-testid="is-valid">{isValid ? 'true' : 'false'}</span>;
}

/**
 * Renders the reserved `__form__` bucket — whole-form / unmatched cross-field
 * messages that carry no field path. Field-routed issues paint on their field;
 * these need their own banner (see form-level-error-routing.e2e.test.tsx).
 */
function FormErrorsBanner(): ReactElement | null {
  const errors = useFormErrors();
  if (errors.length === 0) return null;
  return (
    <div data-testid="form-errors">
      {errors.map((err) => (
        <p key={err.message}>{err.message}</p>
      ))}
    </div>
  );
}

/**
 * Renders a compiled form with the standard chrome (body + a submit button)
 * plus any extra children (repeatable controls, valid flag).
 */
function renderForm(
  schema: FormSchema,
  catalog: ReturnType<typeof createKycCatalog>,
  options: { bindings?: Bindings; onSubmit?: (v: unknown) => void; extra?: ReactElement } = {}
) {
  const { formConfig, defaultValues } = compileForm(schema, catalog, {
    ...(options.bindings ? { bindings: options.bindings } : {}),
  });
  const onSubmit = options.onSubmit ?? vi.fn();
  render(
    <Form of={formConfig} defaults={defaultValues} onSubmit={onSubmit}>
      <Form.Body />
      <FormErrorsBanner />
      {options.extra}
      <Form.Submit>
        {({ submit }) => (
          <button type="button" data-testid="submit" onClick={submit}>
            Submit
          </button>
        )}
      </Form.Submit>
    </Form>
  );
  return { onSubmit, defaultValues };
}

/**
 * Asserts `fn` throws a SchemaValidationError whose `issues` CONTAIN exactly the
 * given {path, message, severity: 'error'} tuple. Calls `fn` twice (toThrow +
 * the manual catch) so both the class and the exact issue are pinned.
 */
function expectIssue(fn: () => unknown, path: string, message: string): void {
  expect(fn).toThrow(SchemaValidationError);
  try {
    fn();
    throw new Error('compileForm did not throw');
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect((error as SchemaValidationError).issues).toContainEqual({
      path,
      message,
      severity: 'error',
    });
  }
}

// =============================================================================
// SCENARIO 1 — FULL HAPPY PATH
// =============================================================================

describe('Scenario 1 — full KYC happy path from pure JSON', () => {
  const HAPPY_JSON = `{
    "version": 1,
    "id": "kyc-onboarding",
    "validation": { "mode": "onChange", "rules": [{ "type": "emailsMatch" }] },
    "rows": [
      { "kind": "fields", "fields": [
        { "id": "fullName", "type": "text", "props": { "label": "Full name" },
          "validation": { "rules": ["required", { "type": "minLength", "params": { "min": 2 } }] } },
        { "id": "email", "type": "text", "props": { "label": "Email" },
          "validation": { "rules": ["required", "email"] } },
        { "id": "confirmEmail", "type": "text", "props": { "label": "Confirm email" },
          "validation": { "rules": ["required"] } }
      ] },
      { "kind": "fields", "fields": [
        { "id": "accountType", "type": "select", "props": { "label": "Account type", "options": [
          { "value": "personal", "label": "Personal" },
          { "value": "business", "label": "Business" }
        ] } },
        { "id": "companyName", "type": "text", "props": { "label": "Company name" },
          "conditions": { "visible": { "field": "accountType", "operator": "equals", "value": "business" } },
          "validation": { "rules": [{ "type": "pattern", "params": { "pattern": "^[A-Za-z0-9 ]+$" }, "message": "Letters and digits only" }] } }
      ] },
      { "kind": "fields", "fields": [
        { "id": "postalCode", "type": "text", "props": { "label": "Postal code" },
          "validation": { "rules": [{ "type": "pattern", "params": { "pattern": "^[0-9]{5}$" }, "message": "Enter 5 digits" }] } }
      ] },
      { "kind": "repeatable", "repeatable": { "id": "owners", "min": 1, "rows": [
        { "kind": "fields", "fields": [
          { "id": "name", "type": "text", "props": { "label": "Owner name" }, "validation": { "rules": ["required"] } },
          { "id": "share", "type": "number", "props": { "label": "Share %" } }
        ] }
      ], "defaultValue": { "name": "", "share": 0 } } }
    ],
    "defaultValues": {
      "fullName": "", "email": "", "confirmEmail": "",
      "accountType": "personal", "companyName": "", "postalCode": "",
      "owners": [{ "name": "", "share": 0 }]
    }
  }`;

  /** Cross-field: confirmEmail must equal email; emits a field-routed AND a
   *  whole-form issue on mismatch (mirrors the proven password pattern). */
  function emailsMatchBinding(): Bindings {
    return {
      validators: {
        emailsMatch: (): StandardSchema => ({
          '~standard': {
            version: 1,
            vendor: 'kyc',
            validate: (value: unknown) => {
              const v = value as Record<string, unknown>;
              if (v.email !== v.confirmEmail) {
                return {
                  issues: [
                    { message: 'Emails do not match', path: ['confirmEmail'] },
                    { message: 'Please correct the highlighted fields' },
                  ],
                };
              }
              return { value };
            },
          },
        }),
      },
    };
  }

  it('compiles a data-only JSON schema, enforces string + parameterized rules live, and submits the exact payload', async () => {
    const schema: FormSchema = JSON.parse(HAPPY_JSON);
    // Data-only authorship: the parsed payload round-trips through JSON unchanged.
    expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(HAPPY_JSON)));

    const onSubmit = vi.fn();
    renderForm(schema, createKycCatalog(), { bindings: emailsMatchBinding(), onSubmit });

    // ---- Parameterized rule {type:minLength, min:2}: 1 char fails, 2 clears.
    fireEvent.change(screen.getByTestId('fullName'), { target: { value: 'A' } });
    await waitFor(() =>
      expect(screen.getByText('Must be at least 2 characters long')).toBeInTheDocument()
    );
    fireEvent.change(screen.getByTestId('fullName'), { target: { value: 'Ada Lovelace' } });
    await waitFor(() =>
      expect(screen.queryByText('Must be at least 2 characters long')).not.toBeInTheDocument()
    );

    // ---- String shortcut "email": invalid fails with the built-in message, clears.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'not-an-email' } });
    await waitFor(() =>
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument()
    );
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'ada@corp.test' } });
    await waitFor(() =>
      expect(screen.queryByText('Please enter a valid email address')).not.toBeInTheDocument()
    );

    // ---- Conditional field: companyName hidden while Personal, shown for Business.
    expect(screen.queryByTestId('companyName')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('accountType'), { target: { value: 'business' } });
    await waitFor(() => expect(screen.getByTestId('companyName')).toBeInTheDocument());

    // ---- Parameterized pattern rule with a custom message on the shown field.
    fireEvent.change(screen.getByTestId('companyName'), { target: { value: 'Acme@@' } });
    await waitFor(() => expect(screen.getByText('Letters and digits only')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('companyName'), { target: { value: 'Acme Analytics' } });
    await waitFor(() =>
      expect(screen.queryByText('Letters and digits only')).not.toBeInTheDocument()
    );

    // ---- Postal code pattern (custom message).
    fireEvent.change(screen.getByTestId('postalCode'), { target: { value: '75001' } });

    // ---- Cross-field emailsMatch (form-level, mode onChange): mismatch shows,
    //      matching value clears it live.
    fireEvent.change(screen.getByTestId('confirmEmail'), { target: { value: 'typo@corp.test' } });
    await waitFor(() => expect(screen.getByText('Emails do not match')).toBeInTheDocument());
    expect(screen.getByText('Please correct the highlighted fields')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('confirmEmail'), { target: { value: 'ada@corp.test' } });
    await waitFor(() => expect(screen.queryByText('Emails do not match')).not.toBeInTheDocument());

    // ---- Repeatable owner (min:1) — fill the required name.
    fireEvent.change(screen.getByTestId('owners[k0].name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByTestId('owners[k0].share'), { target: { value: '100' } });

    // ---- Submit → EXACT structured payload.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      fullName: 'Ada Lovelace',
      email: 'ada@corp.test',
      confirmEmail: 'ada@corp.test',
      accountType: 'business',
      companyName: 'Acme Analytics',
      postalCode: '75001',
      owners: [{ name: 'Ada Lovelace', share: 100 }],
    });
  });

  it('blocks submit when a required repeatable owner name is empty (rule enforced from JSON)', async () => {
    const schema: FormSchema = JSON.parse(HAPPY_JSON);
    const onSubmit = vi.fn();
    renderForm(schema, createKycCatalog(), { bindings: emailsMatchBinding(), onSubmit });

    fireEvent.change(screen.getByTestId('fullName'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'ada@corp.test' } });
    fireEvent.change(screen.getByTestId('confirmEmail'), { target: { value: 'ada@corp.test' } });
    fireEvent.change(screen.getByTestId('postalCode'), { target: { value: '75001' } });
    // owner name left empty → required must block.

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => expect(screen.getByText('This field is required')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// =============================================================================
// SCENARIO 2 — ADVERSARIAL MALFORMED SCHEMAS (strict mode)
// Each must throw a TYPED SchemaValidationError with the EXACT issue.
// =============================================================================

describe('Scenario 2 — malformed schemas throw typed SchemaValidationError issues', () => {
  const catalog = createKycCatalog();

  it('field with no id', () => {
    expectIssue(
      () => compileForm({ id: 'f', fields: [{ type: 'text' }] } as never, catalog),
      'fields[0].id',
      'Field must have a non-empty "id"'
    );
  });

  it('field with an unknown component type', () => {
    expectIssue(
      () => compileForm({ id: 'f', fields: [{ id: 'a', type: 'slider' }] } as never, catalog),
      'fields[0].type',
      'Unknown component type "slider". Must be registered in ril config.'
    );
  });

  it('two fields sharing an id (builder ValidationError → issue)', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [
              { id: 'dup', type: 'text' },
              { id: 'dup', type: 'text' },
            ],
          } as never,
          catalog
        ),
      'fields[1].id',
      'Duplicate field ID "dup"'
    );
  });

  it('a bracket char in a repeatable id (builder ConfigurationError → issue)', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            rows: [
              {
                kind: 'repeatable',
                repeatable: {
                  id: 'owners[0]',
                  rows: [{ kind: 'fields', fields: [{ id: 'name', type: 'text' }] }],
                },
              },
            ],
          } as never,
          catalog
        ),
      'rows[0].repeatable.id',
      'Repeatable ID "owners[0]" cannot contain "[" or "]" (reserved for composite keys)'
    );
  });

  it('a repeatable with a bad template (template field missing its type)', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            rows: [
              {
                kind: 'repeatable',
                repeatable: {
                  id: 'owners',
                  rows: [{ kind: 'fields', fields: [{ id: 'name' }] }],
                },
              },
            ],
          } as never,
          catalog
        ),
      'rows[0].repeatable.rows[0].fields[0].type',
      'Field must have a non-empty "type"'
    );
  });

  it('a rule with an unknown validator name', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [{ id: 'a', type: 'text', validation: { rules: [{ type: 'iban' }] } }],
          } as never,
          catalog
        ),
      'fields[0].validation.rules[0]',
      'Unknown validator type "iban". Not a built-in and not found in registry.'
    );
  });

  it('an unknown validation string shortcut', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [{ id: 'a', type: 'text', validation: { rules: ['phone'] } }],
          } as never,
          catalog
        ),
      'fields[0].validation.rules[0]',
      'Unknown validation shortcut "phone". Valid shortcuts: required, email, url, number'
    );
  });

  it('both "fields" and "rows" present', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [{ id: 'a', type: 'text' }],
            rows: [{ kind: 'fields', fields: [{ id: 'b', type: 'text' }] }],
          } as never,
          catalog
        ),
      '',
      'Form schema cannot have both "fields" and "rows". Use one or the other.'
    );
  });

  it('neither "fields" nor "rows" present', () => {
    expectIssue(
      () => compileForm({ id: 'f' } as never, catalog),
      '',
      'Form schema must have either "fields" or "rows"'
    );
  });

  it('an invalid condition operator', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [
              { id: 'a', type: 'text' },
              {
                id: 'b',
                type: 'text',
                conditions: { visible: { field: 'a', operator: 'startsWith', value: 'x' } },
              },
            ],
          } as never,
          catalog
        ),
      'fields[1].conditions.visible.operator',
      'Invalid condition operator "startsWith"'
    );
  });

  it('DESIGN OBSERVATION: a condition referencing a NONEXISTENT field compiles (no cross-reference check)', () => {
    // validateConditionConfig (compile-form.ts:859) checks only the operator
    // whitelist and that a leaf carries a string `field`. It never proves the
    // referenced id resolves to a declared field, and neither does the builder.
    // So a dangling reference is NOT a typed error — it compiles, and at runtime
    // the evaluator reads the missing field's value as undefined. Documented as a
    // design gap, not asserted as a throw (asserting a throw would be inventing
    // behavior the source does not have).
    expect(() =>
      compileForm(
        {
          id: 'f',
          fields: [
            { id: 'a', type: 'text' },
            {
              id: 'b',
              type: 'text',
              conditions: { visible: { field: 'ghostField', operator: 'equals', value: 'x' } },
            },
          ],
        } as never,
        catalog
      )
    ).not.toThrow();
  });
});

// =============================================================================
// SCENARIO 3 — LENIENT / STREAMING MODE
// =============================================================================

describe('Scenario 3 — lenient mode tolerates a partial (streaming) schema', () => {
  const catalog = createKycCatalog();

  it('skips an incomplete field (no type yet) without raising, then compiles it once complete', () => {
    // Mid-stream: `email` has arrived only as an id; its type is still en route.
    const partial: FormSchema = {
      id: 'kyc',
      fields: [{ id: 'fullName', type: 'text', props: { label: 'Full name' } }, { id: 'email' }],
    } as never;

    const { formConfig: partialConfig } = compileForm(partial, catalog, { lenient: true });
    // The incomplete field is filtered out; the complete one mounts.
    expect(partialConfig.allFields.map((f) => f.id)).toEqual(['fullName']);

    // Render proves no white-screen — the compilable subset is a real form.
    render(
      <Form of={partialConfig}>
        <Form.Body />
      </Form>
    );
    expect(screen.getByTestId('fullName')).toBeInTheDocument();
    expect(screen.queryByTestId('email')).not.toBeInTheDocument();

    // Next chunk completes the field → the full schema compiles both.
    const complete: FormSchema = {
      id: 'kyc',
      fields: [
        { id: 'fullName', type: 'text', props: { label: 'Full name' } },
        { id: 'email', type: 'text', props: { label: 'Email' } },
      ],
    } as never;
    const { formConfig: fullConfig } = compileForm(complete, catalog, { lenient: true });
    expect(fullConfig.allFields.map((f) => f.id)).toEqual(['fullName', 'email']);
  });

  it('mounts a complete field but STRIPS its half-arrived validation block (never unmounts the field)', () => {
    // The minLength rule streamed in without its `min` param this render.
    const partial: FormSchema = {
      id: 'kyc',
      fields: [
        {
          id: 'fullName',
          type: 'text',
          props: { label: 'Full name' },
          validation: { rules: [{ type: 'minLength' }] },
        },
      ],
    } as never;
    const { formConfig } = compileForm(partial, catalog, { lenient: true });
    expect(formConfig.allFields.map((f) => f.id)).toEqual(['fullName']);
    // The invalid validation block was stripped, not fatal.
    expect(formConfig.allFields[0].validation?.validate).toBeUndefined();
  });

  it('never throws on a partial schema — the same shape raises in strict mode', () => {
    const partial = { id: 'kyc', fields: [{ id: 'x', type: 'nope' }] } as never;
    expect(() => compileForm(partial, catalog, { lenient: true })).not.toThrow();
    expect(() => compileForm(partial, catalog)).toThrow(SchemaValidationError);
  });
});

// =============================================================================
// SCENARIO 4 — validateProps
// =============================================================================

describe('Scenario 4 — validateProps checks field props against the component propsSchema', () => {
  it('reports one issue per violated prop, pathed to the offending key, only when validateProps:true', () => {
    const schema = {
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 42 } }],
    } as never;

    // Without the flag → the wrong props are tolerated, the form compiles.
    expect(() => compileForm(schema, createPropsCatalog())).not.toThrow();

    // With the flag → SchemaValidationError, one issue per bad/missing prop,
    // each pathed to the exact prop key, each carrying the accepted key set.
    let caught: SchemaValidationError | undefined;
    try {
      compileForm(schema, createPropsCatalog(), { validateProps: true });
    } catch (error) {
      caught = error as SchemaValidationError;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect(caught?.issues).toEqual([
      {
        path: 'fields[0].props.label',
        message: 'Invalid input: expected string, received number',
        severity: 'error',
        expectedKeys: ['label', 'maxLength'],
      },
      {
        path: 'fields[0].props.maxLength',
        message: 'Invalid input: expected number, received undefined',
        severity: 'error',
        expectedKeys: ['label', 'maxLength'],
      },
    ]);
  });
});

// =============================================================================
// SCENARIO 5 — BINDINGS RESOLUTION
// =============================================================================

describe('Scenario 5 — bindings resolve named validators/effects; a missing key is reported', () => {
  const catalog = createKycCatalog();

  it('resolves a named custom validator and a named effect from bindings (both fire live)', async () => {
    const schema: FormSchema = JSON.parse(`{
      "id": "f",
      "validation": { "mode": "onChange" },
      "fields": [
        { "id": "handle", "type": "text", "props": { "label": "Handle" },
          "validation": { "rules": [{ "type": "noSpaces", "message": "No spaces allowed" }] } },
        { "id": "slug", "type": "text", "props": { "label": "Slug" },
          "effects": [{ "trigger": "change", "watch": "handle", "handler": "lower" }] }
      ],
      "defaultValues": { "handle": "", "slug": "" }
    }`);

    const lower = vi.fn((value: unknown, context: FieldEffectContext) => {
      context.setValue('slug', String(value ?? '').toLowerCase());
    });
    const bindings: Bindings = {
      validators: {
        noSpaces: (_params, message): StandardSchema => ({
          '~standard': {
            version: 1,
            vendor: 'kyc',
            validate: (value: unknown) =>
              typeof value === 'string' && value.includes(' ')
                ? { issues: [{ message: message ?? 'no spaces' }] }
                : { value },
          },
        }),
      },
      effects: { lower },
    };

    renderForm(schema, catalog, { bindings });

    fireEvent.change(screen.getByTestId('handle'), { target: { value: 'Ada Lovelace' } });
    // Named validator fired → its message renders.
    await waitFor(() => expect(screen.getByText('No spaces allowed')).toBeInTheDocument());
    // Named effect fired → slug derived from handle (lower-cased).
    expect(screen.getByTestId('slug')).toHaveValue('ada lovelace');
  });

  it('reports a MISSING validator binding key as a typed issue (not a silent no-op)', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [{ id: 'a', type: 'text', validation: { rules: [{ type: 'customCheck' }] } }],
          } as never,
          catalog,
          { bindings: { validators: {} } }
        ),
      'fields[0].validation.rules[0]',
      'Unknown validator type "customCheck". Not a built-in and not found in registry.'
    );
  });

  it('reports a MISSING effect handler binding key as a typed issue', () => {
    expectIssue(
      () =>
        compileForm(
          {
            id: 'f',
            fields: [
              { id: 'a', type: 'text' },
              {
                id: 'b',
                type: 'text',
                effects: [{ trigger: 'change', watch: 'a', handler: 'missingFx' }],
              },
            ],
          } as never,
          catalog,
          { bindings: { effects: {} } }
        ),
      'fields[1].effects[0].handler',
      'Effect handler "missingFx" not found in registry'
    );
  });
});

// =============================================================================
// SCENARIO 6 — defaultValues + inline field `default` precedence
// =============================================================================

describe('Scenario 6 — schema-level defaultValues wins over inline field default', () => {
  it('merges inline defaults under the schema-level block; both pre-fill and submit', async () => {
    const schema: FormSchema = JSON.parse(`{
      "id": "f",
      "fields": [
        { "id": "country", "type": "text", "default": "US" },
        { "id": "plan", "type": "text", "default": "starter" }
      ],
      "defaultValues": { "plan": "pro" }
    }`);

    const { formConfig, defaultValues } = compileForm(schema, createKycCatalog());
    // `country` keeps its inline default; `plan` is overridden by the top-level block.
    expect(defaultValues).toEqual({ country: 'US', plan: 'pro' });

    const onSubmit = vi.fn();
    render(
      <Form of={formConfig} defaults={defaultValues} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>
          {({ submit }) => (
            <button type="button" data-testid="submit" onClick={submit}>
              Submit
            </button>
          )}
        </Form.Submit>
      </Form>
    );

    // Merged defaults reach the live inputs.
    expect(screen.getByTestId('country')).toHaveValue('US');
    expect(screen.getByTestId('plan')).toHaveValue('pro');

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ country: 'US', plan: 'pro' });
  });
});

// =============================================================================
// SCENARIO 7 — form-level validation timing from JSON (mode)
// =============================================================================

describe('Scenario 7 — validation.mode from JSON drives live cross-field validation', () => {
  function crossFieldSchema(mode: 'onChange' | 'onSubmit'): FormSchema {
    return JSON.parse(`{
      "id": "f",
      "validation": { "mode": "${mode}", "rules": [{ "type": "totalsHundred" }] },
      "fields": [
        { "id": "equity", "type": "number", "props": { "label": "Equity %" } },
        { "id": "debt", "type": "number", "props": { "label": "Debt %" } }
      ],
      "defaultValues": { "equity": 0, "debt": 0 }
    }`);
  }

  function totalsBinding(): Bindings {
    return {
      validators: {
        totalsHundred: (): StandardSchema => ({
          '~standard': {
            version: 1,
            vendor: 'kyc',
            validate: (value: unknown) => {
              const v = value as Record<string, unknown>;
              const sum = Number(v.equity ?? 0) + Number(v.debt ?? 0);
              return sum === 100
                ? { value }
                : { issues: [{ message: 'Equity + debt must total 100%' }] };
            },
          },
        }),
      },
    };
  }

  it('mode:"onChange" — the cross-field error appears and clears live as the user types', async () => {
    renderForm(crossFieldSchema('onChange'), createKycCatalog(), {
      bindings: totalsBinding(),
      extra: <ValidFlag />,
    });

    // Typing a non-100 total surfaces the error live (no submit).
    fireEvent.change(screen.getByTestId('equity'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('debt'), { target: { value: '30' } });
    await waitFor(() =>
      expect(screen.getByText('Equity + debt must total 100%')).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByTestId('is-valid')).toHaveTextContent('false'));

    // Correcting to a 100 total clears it live.
    fireEvent.change(screen.getByTestId('debt'), { target: { value: '40' } });
    await waitFor(() =>
      expect(screen.queryByText('Equity + debt must total 100%')).not.toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByTestId('is-valid')).toHaveTextContent('true'));
  });
});

// =============================================================================
// SCENARIO 8 — ROUND-TRIP REALISM: async server uniqueness + repeatable + submit
// =============================================================================

describe('Scenario 8 — pure JSON threads a registry ASYNC uniqueness check and submits the exact payload', () => {
  const ROUNDTRIP_JSON = `{
    "version": 1,
    "id": "kyc-account",
    "validation": { "mode": "onChange" },
    "rows": [
      { "kind": "fields", "fields": [
        { "id": "email", "type": "text", "props": { "label": "Email" },
          "validation": { "rules": ["required", { "type": "uniqueEmail", "message": "Email already registered" }], "debounceMs": 0 } }
      ] },
      { "kind": "repeatable", "repeatable": { "id": "accounts", "min": 1, "rows": [
        { "kind": "fields", "fields": [
          { "id": "iban", "type": "text", "props": { "label": "IBAN" }, "validation": { "rules": ["required"] } }
        ] }
      ], "defaultValue": { "iban": "" } } }
    ],
    "defaultValues": { "email": "", "accounts": [{ "iban": "" }] }
  }`;

  it('a taken email surfaces the async error, a free one clears it, then submit yields the exact payload', async () => {
    const schema: FormSchema = JSON.parse(ROUNDTRIP_JSON);
    expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(ROUNDTRIP_JSON)));

    const bindings: Bindings = {
      validators: {
        uniqueEmail: (_params, message) =>
          asyncValidator<string>(async (value) => {
            await delay(40);
            return value !== 'taken@corp.test';
          }, message ?? 'Email taken'),
      },
    };

    const onSubmit = vi.fn();
    renderForm(schema, createKycCatalog(), {
      bindings,
      onSubmit,
      extra: <RepeatableControls id="accounts" />,
    });

    // Taken email → async validator rejects → its exact message renders.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'taken@corp.test' } });
    await waitFor(() => expect(screen.getByText('Email already registered')).toBeInTheDocument());

    // Free email → async validator passes → the error clears.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'free@corp.test' } });
    await waitFor(() =>
      expect(screen.queryByText('Email already registered')).not.toBeInTheDocument()
    );

    // Add a second account row via the public hook.
    fireEvent.change(screen.getByTestId('accounts[k0].iban'), { target: { value: 'FR7611' } });
    fireEvent.click(screen.getByTestId('add-accounts'));
    await waitFor(() => expect(screen.getByTestId('count-accounts')).toHaveTextContent('2'));
    fireEvent.change(screen.getByTestId('accounts[k1].iban'), { target: { value: 'DE8937' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'free@corp.test',
      accounts: [{ iban: 'FR7611' }, { iban: 'DE8937' }],
    });
  });
});
