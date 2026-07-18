import { manifest } from '@rilaykit/agent';
import { tools as aiSdkTools } from '@rilaykit/agent/ai-sdk';
import { tools as anthropicTools } from '@rilaykit/agent/anthropic';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { FormBody, FormProvider, useFormErrors } from '@rilaykit/forms/react';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FieldErrorDisplay, FormStateDisplay, SubmitButton } from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// WHY THIS FILE EXISTS
// ----------------------------------------------------------------------------
// Every other suite validates with zod. Standard Schema is vendor-neutral by
// spec — RilayKit must honour ANY vendor's `~standard` carrier for field
// validation, form-level validation, AND tool/manifest projection. Valibot and
// ArkType are NOT installed anywhere in this repo, so instead of adding deps we
// hand-author spec-compliant `~standard` carriers for NON-zod vendors:
//
//   • object carriers (the valibot/most-vendors shape)
//   • a CALLABLE carrier — a function that ALSO carries `~standard`, mimicking
//     ArkType (an ArkType schema is a callable you invoke to validate). This
//     pins commit b414838: `isStandardSchema` gates on
//     `typeof value === 'object' || typeof value === 'function'`
//     (packages/core/src/validation/unified-utils.ts:32). Before b414838 the
//     object-only gate silently rejected every callable carrier, so the field
//     fell back to "no schema" and NEVER errored — the regression this file
//     guards is precisely a callable carrier that must reject invalid input.
//
// A Standard Schema `validate` returns `{ value }` on success or
// `{ issues: [{ message, path? }] }` on failure (sync or via Promise).
// ============================================================================

// ---------------------------------------------------------------------------
// NON-ZOD CARRIERS (hand-authored, spec-compliant)
// ---------------------------------------------------------------------------

/** Object carrier (valibot-shaped), SYNC. Vendor deliberately not "zod". */
function customMinLength(min: number, message: string): StandardSchemaV1<string, string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'custom-sync',
      validate: (value) =>
        typeof value === 'string' && value.length >= min
          ? { value: value as string }
          : { issues: [{ message }] },
    },
  } as StandardSchemaV1<string, string>;
}

/** A second distinct vendor name, so a "mixed vendors" form is genuinely mixed. */
function valibotStyleContains(needle: string, message: string): StandardSchemaV1<string, string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'valibot',
      validate: (value) =>
        typeof value === 'string' && value.includes(needle)
          ? { value: value as string }
          : { issues: [{ message }] },
    },
  } as StandardSchemaV1<string, string>;
}

/**
 * CALLABLE carrier — a FUNCTION that also carries `~standard`, exactly the shape
 * an ArkType schema takes. Pins b414838: it must be accepted by
 * `isStandardSchema` and must reject invalid input (NOT error/pass on every
 * value). The callable body is irrelevant to RilayKit — only `~standard.validate`
 * is consulted — but its presence is what broke the pre-b414838 object-only gate.
 */
function arktypeCallableExact(expected: string, message: string): StandardSchemaV1<string, string> {
  const callable = (v: unknown) => v; // ArkType schemas are invokable
  return Object.assign(callable, {
    '~standard': {
      version: 1,
      vendor: 'arktype',
      validate: (value: unknown) =>
        value === expected ? { value: value as string } : { issues: [{ message }] },
    },
  }) as unknown as StandardSchemaV1<string, string>;
}

/** Object carrier, ASYNC. Vendor "custom-async". Rejects a reserved value. */
function asyncNotReserved(
  reserved: string,
  message: string,
  delayMs = 5
): StandardSchemaV1<string, string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'custom-async',
      validate: async (value) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return value === reserved ? { issues: [{ message }] } : { value: value as string };
      },
    },
  } as StandardSchemaV1<string, string>;
}

/**
 * Cross-field form schema (non-zod, vendor "valibot"). Emits BOTH a
 * path-targeted issue (→ the field) and a whole-form issue (→ `__form__`) when
 * the two fields disagree, so we prove issue routing is vendor-neutral.
 */
const nonZodCrossField = {
  '~standard': {
    version: 1 as const,
    vendor: 'valibot',
    validate: (value: unknown) => {
      const data = value as Record<string, unknown>;
      if (data.a !== data.b) {
        return {
          issues: [
            { message: 'Fields must match', path: ['b'] },
            { message: 'Please align both fields' },
          ],
        };
      }
      return { value };
    },
  },
} as unknown as StandardSchemaV1;

/**
 * Non-zod tool/props carrier that DOES expose the optional Standard Schema
 * `~standard.jsonSchema.output` extension (ArkType-shaped). This is what
 * `projectToJsonSchema` (packages/agent/src/manifest/manifest.ts:43) reads —
 * the vendor-neutral projection path, NOT a zod-only path.
 */
const arkLikeCitySchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'arktype',
    validate: (v: unknown) =>
      typeof (v as Record<string, unknown>)?.city === 'string'
        ? { value: v }
        : { issues: [{ message: 'city is required' }] },
    jsonSchema: {
      output: () => ({
        type: 'object',
        properties: { city: { type: 'string', description: 'The city to look up' } },
        required: ['city'],
      }),
    },
  },
} as unknown as StandardSchemaV1;

/**
 * Non-zod tool carrier that does NOT expose the jsonSchema extension (the
 * valibot situation). The catalog supplies `inputJsonSchema` manually — the
 * documented escape hatch (anthropic/index.ts:85, ai-sdk via
 * `emittableToolSchema`).
 */
const valibotToolSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'valibot',
    validate: (v: unknown) =>
      typeof (v as Record<string, unknown>)?.q === 'string'
        ? { value: v }
        : { issues: [{ message: 'q is required' }] },
  },
} as unknown as StandardSchemaV1;

const valibotToolJsonSchema = {
  type: 'object',
  properties: { q: { type: 'string' } },
  required: ['q'],
};

let rilConfig: ReturnType<typeof createTestRilConfig>;

beforeEach(() => {
  vi.clearAllMocks();
  rilConfig = createTestRilConfig();
});

/** Renders the reserved `__form__` bucket — the form-level banner. */
function FormErrorsBanner() {
  const errors = useFormErrors();
  if (errors.length === 0) return null;
  return (
    <div data-testid="form-errors">
      {errors.map((err, index) => (
        <span key={err.message} data-testid={`form-error-${index}`}>
          {err.message}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// 1. FIELD VALIDATION IS VENDOR-NEUTRAL (sync object carrier)
// ============================================================================

describe('Non-zod field validation — sync object carrier (vendor: custom-sync)', () => {
  function buildForm() {
    return form
      .create(rilConfig, 'sync-vendor-form')
      .add({
        id: 'name',
        type: 'text',
        props: { label: 'Name' },
        validation: { validate: customMinLength(3, 'Must be at least 3 characters') },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('shows the vendor error for an invalid value the user sees', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="name" />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'ab' } });

    await waitFor(() => {
      expect(screen.getByTestId('error-name-0')).toHaveTextContent('Must be at least 3 characters');
    });
  });

  it('passes (no error) for a valid value', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="name" />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'abcd' } });

    // Give the (sync) validation a tick, then assert no error ever painted.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('errors-name')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 2. CALLABLE CARRIER (ArkType-shaped) — pins b414838
// ============================================================================

describe('Non-zod field validation — CALLABLE carrier (vendor: arktype, pins b414838)', () => {
  function buildForm() {
    return form
      .create(rilConfig, 'callable-vendor-form')
      .add({
        id: 'code',
        type: 'text',
        props: { label: 'Code' },
        validation: { validate: arktypeCallableExact('OPEN', 'Code must be exactly OPEN') },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('does NOT error on a valid value (b414838: callable carrier is recognised, not ignored)', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="code" />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-code'), { target: { value: 'OPEN' } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('errors-code')).not.toBeInTheDocument();
  });

  it('DOES error on an invalid value (proves the callable carrier is actually enforced)', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="code" />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-code'), { target: { value: 'SHUT' } });
    await waitFor(() => {
      expect(screen.getByTestId('error-code-0')).toHaveTextContent('Code must be exactly OPEN');
    });
  });
});

// ============================================================================
// 3. ASYNC NON-ZOD FIELD VALIDATION + debounceMs
// ============================================================================

describe('Non-zod field validation — ASYNC carrier + debounceMs (vendor: custom-async)', () => {
  function buildForm() {
    return form
      .create(rilConfig, 'async-vendor-form')
      .add({
        id: 'handle',
        type: 'text',
        props: { label: 'Handle' },
        validation: {
          validate: asyncNotReserved('admin', '"admin" is reserved'),
          debounceMs: 20,
        },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('settles to an error for the reserved value (debounced async, no crash)', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="handle" />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-handle'), { target: { value: 'admin' } });
    await waitFor(() => {
      expect(screen.getByTestId('error-handle-0')).toHaveTextContent('"admin" is reserved');
    });
  });

  it('clears the async error live when the user types an allowed value', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="handle" />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-handle'), { target: { value: 'admin' } });
    await waitFor(() => {
      expect(screen.getByTestId('error-handle-0')).toHaveTextContent('"admin" is reserved');
    });

    fireEvent.change(screen.getByTestId('input-handle'), { target: { value: 'karl' } });
    await waitFor(() => {
      expect(screen.queryByTestId('errors-handle')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// 4. FORM-LEVEL (CROSS-FIELD) VALIDATION IS VENDOR-NEUTRAL
// ============================================================================

describe('Non-zod FORM-level validation routes issues by path and to __form__', () => {
  function buildForm() {
    return form
      .create(rilConfig, 'xfield-vendor-form')
      .add({ id: 'a', type: 'text', props: { label: 'A' } })
      .add({ id: 'b', type: 'text', props: { label: 'B' } })
      .setValidation({ validate: nonZodCrossField })
      .build();
  }

  it('routes the path-targeted issue to the field and the no-path issue to __form__', async () => {
    const onSubmit = vi.fn();
    render(
      <FormProvider formConfig={buildForm()} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrorDisplay id="b" />
        <FormErrorsBanner />
        <FormStateDisplay />
        <SubmitButton />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'left' } });
    fireEvent.change(screen.getByTestId('input-b'), { target: { value: 'right' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-b-0')).toHaveTextContent('Fields must match');
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('Please align both fields');
      expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears both routed issues live once the fields agree', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="b" />
        <FormErrorsBanner />
        <FormStateDisplay />
        <SubmitButton />
      </FormProvider>
    );

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'match' } });
    fireEvent.change(screen.getByTestId('input-b'), { target: { value: 'nope' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('error-b-0')).toHaveTextContent('Fields must match');
    });

    fireEvent.change(screen.getByTestId('input-b'), { target: { value: 'match' } });
    await waitFor(() => {
      expect(screen.queryByTestId('errors-b')).not.toBeInTheDocument();
      expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument();
      expect(screen.getByTestId('is-valid')).toHaveTextContent('true');
    });
  });
});

// ============================================================================
// 5. MIXED VENDORS IN ONE FORM — each validates independently
// ============================================================================

describe('Mixed vendors in one form (zod + custom-sync + valibot + arktype-callable)', () => {
  function buildForm() {
    return form
      .create(rilConfig, 'mixed-vendor-form')
      .add({
        id: 'zodField',
        type: 'text',
        props: { label: 'Zod' },
        // Genuine zod, alongside the hand-authored non-zod vendors.
        validation: { validate: z.string().min(2, 'zod: too short') },
      })
      .add({
        id: 'syncField',
        type: 'text',
        props: { label: 'Sync' },
        validation: { validate: customMinLength(4, 'custom-sync: need 4+') },
      })
      .add({
        id: 'valibotField',
        type: 'text',
        props: { label: 'Valibot' },
        validation: { validate: valibotStyleContains('@', 'valibot: must contain @') },
      })
      .add({
        id: 'arkField',
        type: 'text',
        props: { label: 'Ark' },
        validation: { validate: arktypeCallableExact('YES', 'arktype: must be YES') },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('each vendor field surfaces ONLY its own error, independently', async () => {
    render(
      <FormProvider formConfig={buildForm()}>
        <FormBody />
        <FieldErrorDisplay id="zodField" />
        <FieldErrorDisplay id="syncField" />
        <FieldErrorDisplay id="valibotField" />
        <FieldErrorDisplay id="arkField" />
      </FormProvider>
    );

    // All four invalid at once.
    fireEvent.change(screen.getByTestId('input-zodField'), { target: { value: 'x' } });
    fireEvent.change(screen.getByTestId('input-syncField'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByTestId('input-valibotField'), { target: { value: 'plain' } });
    fireEvent.change(screen.getByTestId('input-arkField'), { target: { value: 'NO' } });

    await waitFor(() => {
      expect(screen.getByTestId('error-zodField-0')).toHaveTextContent('zod: too short');
      expect(screen.getByTestId('error-syncField-0')).toHaveTextContent('custom-sync: need 4+');
      expect(screen.getByTestId('error-valibotField-0')).toHaveTextContent(
        'valibot: must contain @'
      );
      expect(screen.getByTestId('error-arkField-0')).toHaveTextContent('arktype: must be YES');
    });

    // Fix ONLY the valibot field — the other three errors must persist, proving
    // independence (no vendor bleeds into another).
    fireEvent.change(screen.getByTestId('input-valibotField'), { target: { value: 'a@b' } });
    await waitFor(() => {
      expect(screen.queryByTestId('errors-valibotField')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('error-zodField-0')).toHaveTextContent('zod: too short');
    expect(screen.getByTestId('error-syncField-0')).toHaveTextContent('custom-sync: need 4+');
    expect(screen.getByTestId('error-arkField-0')).toHaveTextContent('arktype: must be YES');

    // Now satisfy all four; every error clears.
    fireEvent.change(screen.getByTestId('input-zodField'), { target: { value: 'ok' } });
    fireEvent.change(screen.getByTestId('input-syncField'), { target: { value: 'abcd' } });
    fireEvent.change(screen.getByTestId('input-arkField'), { target: { value: 'YES' } });
    await waitFor(() => {
      expect(screen.queryByTestId('errors-zodField')).not.toBeInTheDocument();
      expect(screen.queryByTestId('errors-syncField')).not.toBeInTheDocument();
      expect(screen.queryByTestId('errors-arkField')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// 6. TOOL SCHEMAS / MANIFEST — vendor-neutral projection
// ----------------------------------------------------------------------------
// Contract verified in source BEFORE asserting:
//   • manifest.projectToJsonSchema (manifest.ts:43-57) reads the vendor-neutral
//     `~standard.jsonSchema.output` — NOT zod internals.
//   • ai-sdk tools() (ai-sdk/index.ts:150-177) wraps the projected root with the
//     SDK's `jsonSchema(root, { validate: standardValidate(schema) })`, and
//     `standardValidate` (:120-131) calls the schema's OWN `~standard.validate`.
//     => the ai-sdk RUNTIME is vendor-neutral on this branch (see the note in
//        the final describe block — this contradicts the stale project memory
//        that claimed the ai-sdk path is zod-only).
//   • anthropic tools() (anthropic/index.ts:69-89) tries z.toJSONSchema first
//     (which THROWS on a non-zod carrier — verified), then falls back to the
//     `~standard.jsonSchema` projection, then to a manual `inputJsonSchema`.
// ============================================================================

describe('manifest() introspects a NON-zod propsSchema via the ~standard.jsonSchema projection', () => {
  it("lists a non-zod component's props (not a zod-only path)", () => {
    const catalog = ril.create().component('city_card', {
      description: 'Shows a city',
      // Non-zod (arktype-shaped) propsSchema carrying the jsonSchema extension.
      propsSchema: arkLikeCitySchema as never,
    });
    const output = manifest(catalog);
    expect(output).toContain('city_card');
    // describeProps -> projectToJsonSchema -> ~standard.jsonSchema.output
    expect(output).toContain('city');
    expect(output).toContain('The city to look up');
  });
});

describe('Tool schemas: a NON-zod tool is emittable across manifest + both adapters', () => {
  function buildCatalog() {
    return (
      ril
        .create()
        // (a) non-zod WITH the jsonSchema extension
        .tool('lookup_city', { description: 'Look up a city', inputSchema: arkLikeCitySchema })
        // (b) non-zod WITHOUT the extension, manual inputJsonSchema escape hatch
        .tool('search', {
          description: 'Search',
          inputSchema: valibotToolSchema,
          inputJsonSchema: valibotToolJsonSchema,
        })
    );
  }

  it('manifest() advertises both non-zod tools (projection gate, not zod-only)', () => {
    const output = manifest(buildCatalog());
    expect(output).toContain('lookup_city');
    expect(output).toContain('search');
  });

  it('ai-sdk tools() emits a USABLE ToolSet entry whose validator runs the non-zod vendor', async () => {
    const generated = aiSdkTools(buildCatalog());
    expect(Object.keys(generated).sort()).toEqual(['lookup_city', 'search']);

    const def = generated.lookup_city as {
      inputSchema: { jsonSchema?: unknown; validate?: (v: unknown) => unknown };
    };
    // The projected root the model sees == what the provider receives.
    expect(def.inputSchema.jsonSchema).toMatchObject({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });
    // The wrapped validator dispatches to the vendor's own ~standard.validate.
    const good = await def.inputSchema.validate?.({ city: 'Paris' });
    const bad = await def.inputSchema.validate?.({ notCity: 1 });
    expect(good).toEqual({ success: true, value: { city: 'Paris' } });
    expect((bad as { success: boolean }).success).toBe(false);
  });

  it('anthropic tools() emits both via the projection / inputJsonSchema fallback (z.toJSONSchema threw)', () => {
    const defs = anthropicTools(buildCatalog());
    const byName = Object.fromEntries(defs.map((d) => [d.name, d]));
    expect(byName.lookup_city.input_schema).toMatchObject({
      type: 'object',
      properties: { city: { type: 'string' } },
    });
    expect(byName.search.input_schema).toMatchObject({
      type: 'object',
      properties: { q: { type: 'string' } },
    });
  });
});

// ============================================================================
// 7. DOCUMENTED REALITY CHECK — the ai-sdk runtime is NOT zod-locked here
// ----------------------------------------------------------------------------
// Project memory recorded "ai-sdk asSchema zod-only, valibot dropped, arktype
// non-functional". That is STALE for this branch: commits b414838 (callable
// carriers) and 15425ac (projection fallback) plus the current
// ai-sdk/index.ts:150-177 `jsonSchema(root, { validate: standardValidate })`
// wiring make the ai-sdk adapter vendor-neutral. This test pins that REALITY:
// a non-zod tool is NOT dropped, and its emitted validator rejects bad input.
// ============================================================================

describe('REALITY: ai-sdk adapter is vendor-neutral (memory note about a zod-lock is stale)', () => {
  it('does not drop a non-zod tool and its validator enforces the vendor', async () => {
    const catalog = ril
      .create()
      .tool('lookup_city', { description: 'Look up a city', inputSchema: arkLikeCitySchema });
    const generated = aiSdkTools(catalog);
    // NOT dropped — a zod-locked adapter would have skipped it.
    expect(generated.lookup_city).toBeDefined();
    const def = generated.lookup_city as {
      inputSchema: { validate?: (v: unknown) => unknown };
    };
    const bad = await def.inputSchema.validate?.({});
    expect((bad as { success: boolean }).success).toBe(false);
  });
});
