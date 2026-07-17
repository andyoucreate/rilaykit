// @ts-nocheck — generic constraints bypass for e2e flexibility (matches the
// sibling from-schema.e2e.test.tsx). Types are exercised by the package suites;
// these e2e files drive real runtime behaviour through the public surfaces.
/**
 * =============================================================================
 * COMPLEX STREAMING / AGENT-DRIVEN FORMS — the under-tested intersections.
 *
 * Everything here composes surfaces that are individually covered but rarely
 * exercised TOGETHER under adversarial timing:
 *
 *   1. A complex FormSchema (nested rows + conditions + registry effects +
 *      multi-rule validation + repeatable) compiled via fromSchema and driven
 *      end-to-end; the submitted payload is asserted, hidden fields excluded.
 *   2. LENIENT / streaming compilation: torn chunk → completed chunk, a field
 *      whose `id` or `type` completes mid-stream (in-place rename / retype) must
 *      carry its value and never strand a ghost validation error.
 *   3. An async validation in-flight when the field id completes: its late
 *      verdict must not wedge the form.
 *   4. The AGENT path: a hand-authored Part[] carrying a complex show_form /
 *      show_flow schema, rendered through <Catalog><Parts onResolve>; the
 *      engine-validated payload flows back exactly once.
 *   5. manifest()/tools() reflect the registered, EMITTABLE surface.
 *
 * Nothing of rilaykit is mocked — real catalog, real compile, real stores.
 * =============================================================================
 */
import { async as asyncValidator, custom } from '@rilaykit/core';
import type { ComponentRenderContext, FieldEffectContext } from '@rilaykit/core';
import { compileForm, fromSchema } from '@rilaykit/forms';
import type { FormSchema, SchemaRegistry } from '@rilaykit/forms';
import { FormBody, FormProvider, useFormStoreApi, useFormValid } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { manifest, ril, uiTools } from 'rilaykit';
import { toParts, tools } from 'rilaykit/ai-sdk';
import { Catalog, Parts } from 'rilaykit/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  FieldErrorDisplay,
  FormValuesDisplay,
  RepeatableControls,
  SubmitButton,
  ValidationTrigger,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// =================================================================
// SHARED HELPERS
// =================================================================

/** Reactive probe: exposes live isValid + a captured store ref for assertions
 * on the raw error map (StoreInspector is NOT reactive — see MEMORY.md). */
let capturedStore: ReturnType<typeof useFormStoreApi> | null = null;
function Probe() {
  capturedStore = useFormStoreApi();
  const isValid = useFormValid();
  return <output data-testid="isValid">{String(isValid)}</output>;
}

function renderSchema(
  schema: FormSchema,
  options: {
    registry?: SchemaRegistry;
    onSubmit?: (data: unknown) => void | Promise<void>;
    extraChildren?: React.ReactNode;
  } = {}
) {
  const rilConfig = createTestRilConfig();
  const { formConfig, defaultValues } = fromSchema(schema, rilConfig, options.registry);
  return render(
    <FormProvider formConfig={formConfig} defaultValues={defaultValues} onSubmit={options.onSubmit}>
      <FormBody />
      {options.extraChildren}
    </FormProvider>
  );
}

// =================================================================
// 1. COMPLEX fromSchema — end-to-end drive + payload
// =================================================================

describe('complex fromSchema — nested rows + conditions + effects + multi-rule validation', () => {
  it('drives conditional show/hide, an effect cascade, multi-rule validation, and submits the visible payload', async () => {
    const onSubmit = vi.fn();

    // Effect: choosing an account type derives a suggested plan tier value AND
    // repopulates the plan <select>'s options (setValue + setProps in one).
    const applyAccountType = vi.fn((value: unknown, ctx: FieldEffectContext) => {
      const plans =
        value === 'business'
          ? [
              { value: 'team', label: 'Team' },
              { value: 'enterprise', label: 'Enterprise' },
            ]
          : [
              { value: 'free', label: 'Free' },
              { value: 'pro', label: 'Pro' },
            ];
      ctx.setProps('plan', { label: 'Plan', options: plans });
      ctx.setValue('plan', plans[0].value);
    });

    // Registry validator: a business account must not use a free-mail domain.
    const corporateEmail = (_params: unknown, message?: string) =>
      custom(
        (v: string) => !!v && !/@(gmail|yahoo|hotmail)\./i.test(v),
        message || 'Use a corporate email'
      );

    const registry: SchemaRegistry = {
      effects: { applyAccountType },
      validators: { corporateEmail },
    };

    const schema: FormSchema = {
      id: 'org-signup',
      defaultValues: { accountType: 'personal' },
      rows: [
        {
          kind: 'fields',
          fields: [
            {
              id: 'accountType',
              type: 'select',
              props: {
                label: 'Account type',
                options: [
                  { value: 'personal', label: 'Personal' },
                  { value: 'business', label: 'Business' },
                ],
              },
            },
            {
              id: 'plan',
              type: 'select',
              props: { label: 'Plan', options: [] },
              effects: [{ trigger: 'change', watch: 'accountType', handler: 'applyAccountType' }],
            },
          ],
        },
        {
          kind: 'fields',
          fields: [
            {
              // Only relevant for business accounts — hidden AND its required
              // rule must not block a personal submit.
              id: 'companyName',
              type: 'text',
              props: { label: 'Company name' },
              validation: { rules: 'required' },
              conditions: {
                visible: { field: 'accountType', operator: 'equals', value: 'business' },
              },
            },
          ],
        },
        {
          kind: 'fields',
          fields: [
            {
              id: 'email',
              type: 'text',
              props: { label: 'Email' },
              // Three rules on one field: required, email-shape, corporate-domain.
              validation: {
                rules: ['required', 'email', { type: 'corporateEmail', message: 'Corporate only' }],
              },
            },
          ],
        },
        {
          kind: 'repeatable',
          repeatable: {
            id: 'members',
            min: 1,
            max: 3,
            defaultValue: { memberEmail: '' },
            rows: [
              {
                fields: [
                  {
                    id: 'memberEmail',
                    type: 'text',
                    props: { label: 'Member email' },
                    validation: { rules: ['required', 'email'] },
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    renderSchema(schema, {
      registry,
      onSubmit,
      extraChildren: (
        <>
          <SubmitButton />
          <ValidationTrigger />
          <FieldErrorDisplay id="email" />
          <RepeatableControls repeatableId="members" />
          <FormValuesDisplay />
        </>
      ),
    });

    // companyName hidden while personal.
    expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();

    // Switch to business → effect repopulates plan + derives a value, and the
    // conditional companyName appears.
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'business' } });
    await waitFor(() => {
      expect(screen.getByTestId('field-companyName')).toBeInTheDocument();
      const opts = screen.getByTestId('input-plan').querySelectorAll('option');
      expect(Array.from(opts).map((o) => o.textContent)).toEqual(['Team', 'Enterprise']);
      expect(screen.getByTestId('input-plan')).toHaveValue('team');
    });

    // A gmail address trips the registry corporate-domain rule.
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'ceo@gmail.com' } });
    fireEvent.click(screen.getByTestId('validate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      expect(screen.getByTestId('error-email-0')).toHaveTextContent('Corporate only');
    });

    // Fix everything.
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'ceo@acme.co' } });
    fireEvent.change(screen.getByTestId('input-companyName'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByTestId('input-members[k0].memberEmail'), {
      target: { value: 'a@acme.co' },
    });

    fireEvent.click(screen.getByTestId('validate-btn'));
    await waitFor(() => expect(screen.getByTestId('validation-valid')).toHaveTextContent('true'));

    fireEvent.click(screen.getByTestId('submit-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const data = onSubmit.mock.calls[0][0];
    expect(data).toMatchObject({
      accountType: 'business',
      plan: 'team',
      companyName: 'Acme',
      email: 'ceo@acme.co',
      members: [{ memberEmail: 'a@acme.co' }],
    });
  });

  it('a hidden conditionally-required field neither blocks validation nor ships its value', async () => {
    const onSubmit = vi.fn();
    renderSchema(
      {
        id: 'hidden-required',
        fields: [
          { id: 'wantsGift', type: 'checkbox', props: { label: 'Wants gift' } },
          {
            id: 'giftNote',
            type: 'text',
            props: { label: 'Gift note' },
            validation: { rules: 'required' },
            conditions: { visible: { field: 'wantsGift', operator: 'equals', value: true } },
          },
          { id: 'name', type: 'text', props: { label: 'Name' } },
        ],
        defaultValues: { wantsGift: false, giftNote: 'STALE', name: 'Karl' },
      },
      { onSubmit, extraChildren: <SubmitButton /> }
    );

    // Hidden required field must not block, and its stale default must not ship.
    expect(screen.queryByTestId('field-giftNote')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const data = onSubmit.mock.calls[0][0];
    expect(data.name).toBe('Karl');
    expect(data).not.toHaveProperty('giftNote');
  });
});

// =================================================================
// 2. LENIENT / STREAMING COMPILATION — progressive mounting
// =================================================================

/** Drives two compiled snapshots through ONE FormProvider (config swap = the
 * streamed schema growing chunk-to-chunk). */
function StreamHost({
  first,
  second,
  onSubmit,
}: {
  first: ReturnType<typeof compileForm>;
  second: ReturnType<typeof compileForm>;
  onSubmit?: (values: unknown) => void;
}) {
  const [compiled, setCompiled] = useState(first);
  return (
    <>
      <button type="button" data-testid="advance" onClick={() => setCompiled(second)}>
        advance
      </button>
      <FormProvider
        formConfig={compiled.formConfig}
        defaultValues={compiled.defaultValues}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <Probe />
      </FormProvider>
    </>
  );
}

describe('lenient streaming compilation — progressive mounting', () => {
  it('skips a torn field (missing type), mounts it when the type arrives, and preserves the sibling value typed meanwhile', async () => {
    const config = createTestRilConfig();

    // Chunk 1: `first` is complete, `second` is torn (no type yet).
    const torn: FormSchema = {
      id: 'contact',
      fields: [
        { id: 'first', type: 'text', props: { label: 'First' } },
        { id: 'second', props: { label: 'Second' } },
      ],
    };
    // Chunk 2: `second` completes.
    const completed: FormSchema = {
      id: 'contact',
      fields: [
        { id: 'first', type: 'text', props: { label: 'First' } },
        { id: 'second', type: 'text', props: { label: 'Second' } },
      ],
    };

    const a = compileForm(torn, config, { lenient: true });
    const b = compileForm(completed, config, { lenient: true });

    render(<StreamHost first={a} second={b} />);

    // Torn field is absent this render.
    expect(screen.getByTestId('input-first')).toBeInTheDocument();
    expect(screen.queryByTestId('input-second')).not.toBeInTheDocument();

    // User types into the already-mounted field.
    fireEvent.change(screen.getByTestId('input-first'), { target: { value: 'Ada' } });

    // Next chunk completes the torn field.
    fireEvent.click(screen.getByTestId('advance'));
    await waitFor(() => expect(screen.getByTestId('input-second')).toBeInTheDocument());

    // Growth, not reset: the earlier value survives the mount of a new field.
    expect(screen.getByTestId('input-first')).toHaveValue('Ada');
  });

  it('an in-place id rename (na → name) carries the typed value and strands no ghost error', async () => {
    const config = createTestRilConfig();
    const validation = { rules: 'required' as const };

    const tornChunk: FormSchema = {
      id: 'renamer',
      fields: [{ id: 'na', type: 'text', props: { label: 'Name' }, validation }],
    };
    const completedChunk: FormSchema = {
      id: 'renamer',
      fields: [{ id: 'name', type: 'text', props: { label: 'Name' }, validation }],
    };

    const a = compileForm(tornChunk, config, { lenient: true });
    const b = compileForm(completedChunk, config, { lenient: true });

    render(<StreamHost first={a} second={b} />);

    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByTestId('advance'));

    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());
    // The completed id inherits the value (same field growing, not a swap).
    expect(screen.getByTestId('input-name')).toHaveValue('Grace');

    // No ghost key for the renamed-away id, and the form is valid (required met).
    const state = capturedStore?.getState();
    expect(state?.errors?.na ?? []).toEqual([]);
    expect(screen.getByTestId('isValid').textContent).toBe('true');
  });

  it('an in-place type completion (retype) orphans only the retyped field, sparing every sibling', async () => {
    const config = createTestRilConfig();

    // Per the documented RETYPE contract (FormProvider ConfigShape): a field
    // whose `componentId` changes under a stable id has its OWN value orphaned
    // (the stored string no longer fits the new kind), but siblings the retype
    // never touched keep every keystroke. This is the campaign-era data-loss
    // guard: a torn `type` completing mid-stream must not nuke the whole form.
    const asText: FormSchema = {
      id: 'retyper',
      fields: [
        { id: 'keep', type: 'text', props: { label: 'Keep' } },
        { id: 'age', type: 'text', props: { label: 'Age' } },
      ],
    };
    const asNumber: FormSchema = {
      id: 'retyper',
      fields: [
        { id: 'keep', type: 'text', props: { label: 'Keep' } },
        { id: 'age', type: 'number', props: { label: 'Age' } },
      ],
    };

    const a = compileForm(asText, config, { lenient: true });
    const b = compileForm(asNumber, config, { lenient: true });

    render(<StreamHost first={a} second={b} />);
    fireEvent.change(screen.getByTestId('input-keep'), { target: { value: 'survivor' } });
    fireEvent.change(screen.getByTestId('input-age'), { target: { value: '42' } });
    fireEvent.click(screen.getByTestId('advance'));

    await waitFor(() => {
      expect(screen.getByTestId('input-age')).toHaveAttribute('type', 'number');
    });
    // Sibling untouched by the retype keeps its value; the retyped field is
    // surgically orphaned (its incompatible string is dropped, not carried).
    expect(screen.getByTestId('input-keep')).toHaveValue('survivor');
    expect(screen.getByTestId('input-age')).toHaveValue(null);
  });

  it('strips a half-arrived validation block without unmounting the field or losing its value', async () => {
    const config = createTestRilConfig();

    // Chunk 1: a bogus/unknown validator descriptor (still streaming) — the
    // block is stripped, the field stays mounted.
    const withBadValidation: FormSchema = {
      id: 'strip',
      fields: [
        {
          id: 'code',
          type: 'text',
          props: { label: 'Code' },
          validation: { rules: [{ type: 'notARealValidatorYet' }] },
        },
      ],
    };
    // Chunk 2: the validator name completes to a real built-in.
    const withGoodValidation: FormSchema = {
      id: 'strip',
      fields: [
        {
          id: 'code',
          type: 'text',
          props: { label: 'Code' },
          validation: { rules: [{ type: 'minLength', params: { min: 3 } }] },
        },
      ],
    };

    const a = compileForm(withBadValidation, config, { lenient: true });
    const b = compileForm(withGoodValidation, config, { lenient: true });

    render(<StreamHost first={a} second={b} />);

    // Field mounted despite the invalid validation block; value accepted.
    fireEvent.change(screen.getByTestId('input-code'), { target: { value: 'ab' } });
    expect(screen.getByTestId('input-code')).toHaveValue('ab');

    // Once the real rule arrives, it applies: 'ab' (<3) is now invalid.
    fireEvent.click(screen.getByTestId('advance'));
    await waitFor(() => {
      expect(screen.getByTestId('input-code')).toHaveValue('ab');
    });
    // Trigger validation via submit and confirm the rule is now enforced.
    fireEvent.click(screen.getByTestId('submit-btn'));
    await waitFor(() => expect(screen.getByTestId('isValid').textContent).toBe('false'));
  });

  it('lenient never raises on a not-yet-an-object schema chunk', () => {
    const config = createTestRilConfig();
    // The earliest streamed states: not an object, empty, id-only.
    expect(() =>
      compileForm(undefined as unknown as FormSchema, config, { lenient: true })
    ).not.toThrow();
    expect(() => compileForm({} as FormSchema, config, { lenient: true })).not.toThrow();
    const idOnly = compileForm({ id: 'x' } as FormSchema, config, { lenient: true });
    expect(idOnly.formConfig).toBeDefined();
  });
});

// =================================================================
// 3. ASYNC VALIDATION racing a rename
// =================================================================

describe('async validation in-flight when the field id completes', () => {
  it('drops the renamed-away id late verdict and keeps the form recoverable', async () => {
    const config = createTestRilConfig();

    let resolveValidation: ((ok: boolean) => void) | undefined;
    const registry: SchemaRegistry = {
      validators: {
        slowUnique: (_params, message) =>
          asyncValidator<string>(
            (_v) =>
              new Promise<boolean>((res) => {
                resolveValidation = res;
              }),
            message ?? 'Not unique'
          ),
      },
    };

    const validation = { rules: [{ type: 'slowUnique' }] };
    const tornChunk: FormSchema = {
      id: 'async-rename',
      validation: { mode: 'onChange' },
      fields: [{ id: 'na', type: 'text', props: { label: 'Name' }, validation }],
    };
    const completedChunk: FormSchema = {
      id: 'async-rename',
      validation: { mode: 'onChange' },
      fields: [{ id: 'name', type: 'text', props: { label: 'Name' }, validation }],
    };

    const a = compileForm(tornChunk, config, { lenient: true, bindings: registry });
    const b = compileForm(completedChunk, config, { lenient: true, bindings: registry });

    render(<StreamHost first={a} second={b} />);

    // Kick the async validation on the torn id.
    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'ab' } });
    await waitFor(() => expect(resolveValidation).toBeDefined());

    // Complete the rename BEFORE the verdict lands.
    fireEvent.click(screen.getByTestId('advance'));
    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());
    expect(screen.getByTestId('input-name')).toHaveValue('ab');

    // The stale verdict (rejection) resolves for a field id no longer present.
    await act(async () => {
      resolveValidation?.(false);
      await Promise.resolve();
    });

    // No ghost error under the old id; the form is not permanently wedged.
    const state = capturedStore?.getState();
    expect(state?.errors?.na ?? []).toEqual([]);
    expect(screen.getByTestId('isValid').textContent).toBe('true');
  });
});

// =================================================================
// 4. AGENT PATH — Catalog / Parts / show_form / show_flow
// =================================================================

// --- An app catalog with propsSchema'd components, parts, the UI tools. -----

function TextInput({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div>
      <label htmlFor={id}>{String(props.label ?? '')}</label>
      <input
        id={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {errors.length > 0 ? <span role="alert">{errors[0].message}</span> : null}
    </div>
  );
}

function SelectInput({ id, props, field }: ComponentRenderContext) {
  const options = Array.isArray(props.options)
    ? (props.options as Array<{ value: string; label: string }>)
    : [];
  return (
    <div>
      <label htmlFor={id}>{String(props.label ?? '')}</label>
      <select
        id={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
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

const agentBindings = {
  effects: {
    deriveSlug: (value: unknown, ctx: FieldEffectContext) => {
      const base = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : '';
      ctx.setValue('slug', base ? `p-${base}` : '');
    },
  },
};

function makeAgentCatalog() {
  return ril
    .create()
    .component('text', {
      description: 'Single-line text input',
      propsSchema: z.object({ label: z.string() }),
      renderer: TextInput,
    })
    .component('select', {
      description: 'Dropdown selector',
      renderer: SelectInput,
    })
    .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
    .use(uiTools());
}

function sdkMessage(parts: unknown[]): unknown {
  return JSON.parse(JSON.stringify({ id: 'msg_1', role: 'assistant', parts }));
}

describe('agent path — manifest / tools reflect the emittable surface', () => {
  it('manifest lists components + tools and tools() emits only the emittable UI tools (no execute)', () => {
    const catalog = makeAgentCatalog();

    const prompt = manifest(catalog);
    expect(prompt).toContain('- **text** — Single-line text input');
    expect(prompt).toContain('- **select** — Dropdown selector');
    expect(prompt).toContain('- **show_form**');
    expect(prompt).toContain('- **show_flow**');

    const defs = tools(catalog);
    expect(Object.keys(defs).sort()).toEqual(['show_component', 'show_flow', 'show_form']);
    // Native HITL: the UI tools carry NO execute.
    expect(Object.hasOwn(defs.show_form, 'execute')).toBe(false);
    expect(typeof defs.show_form.inputSchema).toBe('object');
  });

  it('a renderer-only tool (no inputSchema) is registered but never advertised', () => {
    // A catalog whose only tool has no inputSchema — renderer-only, so it is
    // excluded from both the manifest tool list and tools().
    const catalog = ril
      .create()
      .component('text', { description: 'T', renderer: TextInput })
      .tool('display_only', { description: 'render only', renderer: () => <div /> });

    expect(manifest(catalog)).not.toContain('display_only');
    expect(Object.keys(tools(catalog))).not.toContain('display_only');
  });
});

describe('agent path — complex show_form through <Catalog><Parts>', () => {
  const complexFormSchema = {
    id: 'profile',
    rows: [
      {
        kind: 'fields',
        fields: [
          {
            id: 'displayName',
            type: 'text',
            props: { label: 'Display name' },
            validation: { rules: 'required' },
          },
          {
            id: 'slug',
            type: 'text',
            props: { label: 'Slug' },
            effects: [{ trigger: 'change', watch: 'displayName', handler: 'deriveSlug' }],
          },
        ],
      },
      {
        kind: 'fields',
        fields: [
          {
            id: 'email',
            type: 'text',
            props: { label: 'Email' },
            validation: { rules: ['required', 'email'] },
          },
        ],
      },
      {
        kind: 'fields',
        fields: [
          {
            id: 'visibility',
            type: 'select',
            props: {
              label: 'Visibility',
              options: [
                { value: 'public', label: 'Public' },
                { value: 'private', label: 'Private' },
              ],
            },
            default: 'public',
          },
          {
            id: 'inviteCode',
            type: 'text',
            props: { label: 'Invite code' },
            validation: { rules: 'required' },
            conditions: { visible: { field: 'visibility', operator: 'equals', value: 'private' } },
          },
        ],
      },
    ],
  };

  function showFormMessage(schema: unknown, toolCallId = 'call_profile'): unknown {
    return sdkMessage([
      { type: 'text', text: 'Please complete your profile.' },
      { type: 'tool-show_form', toolCallId, state: 'input-available', input: { schema } },
    ]);
  }

  // The built-in ShowForm compiles WITHOUT the app's effect bindings, so the
  // deriveSlug effect would fail to resolve. To exercise the effect through the
  // built-in renderer we register the binding on a catalog-level renderer
  // override is NOT available here; instead we host the effect via a custom
  // show_form renderer for the effect-bearing case, and use the built-in for
  // the validation/HITL cases (whose schema needs no bindings).

  it('a required-field violation blocks submit and does NOT resolve; correcting it then resolves once with validated values', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const catalog = makeAgentCatalog();

    // A schema needing no bindings (drop the effect field) so the built-in
    // renderer compiles it cleanly.
    const schema = {
      id: 'profile',
      rows: [
        {
          kind: 'fields',
          fields: [
            {
              id: 'displayName',
              type: 'text',
              props: { label: 'Display name' },
              validation: { rules: 'required' },
            },
            {
              id: 'email',
              type: 'text',
              props: { label: 'Email' },
              validation: { rules: ['required', 'email'] },
            },
          ],
        },
        {
          kind: 'fields',
          fields: [
            {
              id: 'visibility',
              type: 'select',
              props: {
                label: 'Visibility',
                options: [
                  { value: 'public', label: 'Public' },
                  { value: 'private', label: 'Private' },
                ],
              },
              default: 'public',
            },
            {
              id: 'inviteCode',
              type: 'text',
              props: { label: 'Invite code' },
              validation: { rules: 'required' },
              conditions: {
                visible: { field: 'visibility', operator: 'equals', value: 'private' },
              },
            },
          ],
        },
      ],
    };

    render(
      <Catalog value={catalog}>
        <Parts parts={toParts(showFormMessage(schema))} onResolve={onResolve} />
      </Catalog>
    );

    expect(screen.getByText('Please complete your profile.')).toBeInTheDocument();

    // Submit empty → required violations block on BOTH required fields; nothing
    // resolves (the engine refuses to hand invalid values back to the agent).
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1));
    expect(onResolve).not.toHaveBeenCalled();

    // Fill valid values. inviteCode stays hidden (visibility=public), so its
    // required rule must not block and its value must not ship.
    await user.type(screen.getByLabelText('Display name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_profile',
        {
          status: 'submitted',
          values: { displayName: 'Ada Lovelace', email: 'ada@example.com', visibility: 'public' },
        },
        'show_form'
      )
    );
  });

  it('an invalid emission delivers status:error once, then a corrected re-emission on the SAME toolCallId completes', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const catalog = makeAgentCatalog();

    // props.label must be a string (component propsSchema). validateProps (on in
    // the built-in) rejects a numeric label as a terminal emission error.
    const badSchema = { id: 'seat', fields: [{ id: 'seat', type: 'text', props: { label: 7 } }] };

    const view = render(
      <Catalog value={catalog}>
        <Parts parts={toParts(showFormMessage(badSchema, 'call_fix'))} onResolve={onResolve} />
      </Catalog>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-agent-error', 'emission');
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve.mock.calls[0][0]).toBe('call_fix');
    expect(onResolve.mock.calls[0][1].status).toBe('error');
    expect(onResolve.mock.calls[0][2]).toBe('show_form');

    // Corrected re-emission on the SAME toolCallId — recovers in place.
    const goodSchema = {
      id: 'seat',
      fields: [{ id: 'seat', type: 'text', props: { label: 'Seat' } }],
    };
    view.rerender(
      <Catalog value={catalog}>
        <Parts parts={toParts(showFormMessage(goodSchema, 'call_fix'))} onResolve={onResolve} />
      </Catalog>
    );

    const seat = await screen.findByLabelText('Seat');
    await user.type(seat, '14C');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenLastCalledWith(
      'call_fix',
      { status: 'submitted', values: { seat: '14C' } },
      'show_form'
    );
  });

  it('drives a complex show_form with a registry effect via a host renderer and resolves the derived + validated payload', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    // The effect needs bindings, which the built-in renderer does not supply, so
    // this app hosts its own show_form renderer wiring the bindings — the
    // documented .renderers({ tools }) extension point.
    const HostShowForm = ({ state, input, resolve }) => {
      const settledRef = useRef(false);
      if (state !== 'ready') return <div data-tool-state={state} />;
      const schema = (input as { schema?: unknown })?.schema;
      const { formConfig, defaultValues } = compileForm(schema as FormSchema, hostCatalog, {
        bindings: agentBindings,
        validateProps: true,
      });
      const settle = (output: unknown) => {
        if (settledRef.current) return;
        settledRef.current = true;
        resolve(output);
      };
      return (
        <FormProvider
          formConfig={formConfig}
          defaultValues={defaultValues}
          onSubmit={(values) => settle({ status: 'submitted', values })}
        >
          <FormBody />
          <SubmitButton />
        </FormProvider>
      );
    };

    const hostCatalog = makeAgentCatalog().renderers({ tools: { show_form: HostShowForm } });

    render(
      <Catalog value={hostCatalog}>
        <Parts parts={toParts(showFormMessage(complexFormSchema))} onResolve={onResolve} />
      </Catalog>
    );

    // Type a display name → the effect derives the slug live.
    await user.type(screen.getByLabelText('Display name'), 'Grace Hopper');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('p-grace-hopper');

    await user.type(screen.getByLabelText('Email'), 'grace@example.com');

    // Reveal the conditional invite code (visibility=private) and fill it.
    await user.selectOptions(screen.getByLabelText('Visibility'), 'private');
    await user.type(await screen.findByLabelText('Invite code'), 'VIP-1');

    await user.click(screen.getByTestId('submit-btn'));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_profile',
        {
          status: 'submitted',
          values: {
            displayName: 'Grace Hopper',
            slug: 'p-grace-hopper',
            email: 'grace@example.com',
            visibility: 'private',
            inviteCode: 'VIP-1',
          },
        },
        'show_form'
      )
    );
  });
});

describe('agent path — complex show_flow through the built-in renderer', () => {
  const flowSchema = {
    id: 'onboarding',
    name: 'Onboarding',
    steps: [
      {
        id: 'who',
        title: 'Who',
        form: {
          id: 'who',
          fields: [
            {
              id: 'fullName',
              type: 'text',
              props: { label: 'Full name' },
              validation: { rules: 'required' },
            },
          ],
        },
      },
      {
        id: 'contact',
        title: 'Contact',
        form: {
          id: 'contact',
          fields: [
            {
              id: 'email',
              type: 'text',
              props: { label: 'Email' },
              validation: { rules: ['required', 'email'] },
            },
          ],
        },
      },
    ],
  };

  it('a bad email blocks step advance, then a valid multi-step fill resolves status:submitted once', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const catalog = makeAgentCatalog();

    const message = sdkMessage([
      {
        type: 'tool-show_flow',
        toolCallId: 'call_flow',
        state: 'input-available',
        input: { schema: flowSchema },
      },
    ]);

    render(
      <Catalog value={catalog}>
        <Parts parts={toParts(message)} onResolve={onResolve} />
      </Catalog>
    );

    // Step 1: required blocks an empty advance.
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Full name'), 'Ada');
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Step 2: a bad email blocks; the flow does not complete.
    const email = await screen.findByLabelText('Email');
    await user.type(email, 'nope');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onResolve).not.toHaveBeenCalled();

    // Correct and complete.
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_flow',
        {
          status: 'submitted',
          values: { who: { fullName: 'Ada' }, contact: { email: 'ada@example.com' } },
        },
        'show_flow'
      )
    );
  });
});
