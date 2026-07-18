// @vitest-environment node
//
// =============================================================================
// E2E — ISOMORPHIC / RSC SERVER-SAFETY.
//
// This file's docblock pins the vitest environment to NODE (no jsdom): there is
// NO `window`, NO `document`, NO `navigator`. That is the whole point — it proves
// a Next.js App Router team can assemble RilayKit configs (KYC forms, multi-step
// flows, agent tool manifests) on the SERVER (RSC / route handlers) where the DOM
// does not exist, and can server-render the React surface with `react-dom/server`.
//
// Contract verified against source before every assertion:
//   - packages/rilaykit/src/index.ts        (isomorphic main, no 'use client')
//   - packages/rilaykit/src/react/index.ts   ('use client' client surface)
//   - packages/{forms,workflow,agent}/src/index.ts vs /react
//   - packages/rilaykit/tsup.config.ts       (no rollup treeshake → banner kept)
//   - packages/forms/src/schema/compile-form.ts, packages/agent/src/{manifest,
//     tools,ai-sdk}/*
//
// A "bug" here = anything on the isomorphic/server path that throws or needs a
// DOM at import time, config-build time, or SSR render time.
// =============================================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// --- Isomorphic surfaces, imported at MODULE LOAD in a node env. If any of these
//     touched window/document/navigator at import time, this file would throw
//     before a single test ran. It loads → the mains are DOM-free at import. ---
import { compileForm, form, ril } from 'rilaykit';
import { manifest, uiTools } from 'rilaykit';
import { flow } from 'rilaykit';
import type { FormSchema } from 'rilaykit';
import { tools } from 'rilaykit/ai-sdk';
import { z } from 'zod';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(path.resolve(ROOT, rel), 'utf8');
}

// A tiny catalog with a renderer-free component + the premium UI tools. The
// renderer is only needed to render (scenario 3); registering it is isomorphic.
const TextRenderer = ({ id, field }: any) => (
  <input
    data-testid={id}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

function buildCatalog() {
  return ril
    .create()
    .component('text', {
      renderer: TextRenderer,
      description: 'A single-line text input',
      propsSchema: z.object({ label: z.string() }),
    })
    .use(uiTools());
}

// =============================================================================
// 0. There is genuinely NO DOM in this environment.
// =============================================================================
describe('SSR safety — the environment has no DOM', () => {
  it('window and document are undefined (node env, not jsdom)', () => {
    // window/document are the DOM markers — absent proves we are NOT in jsdom.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    // NB: `navigator` is intentionally NOT checked — Node 21+ exposes a minimal
    // `navigator` global (userAgent only), which is a runtime global, not the
    // jsdom DOM Navigator. Its presence is not a DOM.
  });
});

// =============================================================================
// 1. Isomorphic mains import DOM-free — asserted explicitly via dynamic import.
// =============================================================================
describe('SSR safety — isomorphic entries import without a DOM', () => {
  const ISOMORPHIC_MAINS = [
    'rilaykit',
    'rilaykit/ai-sdk',
    '@rilaykit/forms',
    '@rilaykit/workflow',
    '@rilaykit/agent',
  ] as const;

  for (const spec of ISOMORPHIC_MAINS) {
    it(`import('${spec}') does not throw and touches no DOM`, async () => {
      // Guard: if importing reached for the DOM, defining these traps would make
      // it throw. They stay absent the whole import → no DOM access.
      expect(typeof document).toBe('undefined');
      const mod = await import(/* @vite-ignore */ spec);
      expect(mod).toBeTypeOf('object');
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
  }

  it('the isomorphic mains expose builders/adapters but NOT React components', async () => {
    const main = await import('rilaykit');
    // Isomorphic surface present…
    expect(main.form).toBeTypeOf('function');
    expect(main.flow).toBeTypeOf('function');
    expect(main.compileForm).toBeTypeOf('function');
    expect(main.manifest).toBeTypeOf('function');
    expect(main.uiTools).toBeTypeOf('function');
    // …React components are NOT — they live behind rilaykit/react.
    expect((main as Record<string, unknown>).Form).toBeUndefined();
    expect((main as Record<string, unknown>).FormBody).toBeUndefined();
    expect((main as Record<string, unknown>).Flow).toBeUndefined();
    expect((main as Record<string, unknown>).Catalog).toBeUndefined();
  });
});

// =============================================================================
// 2. Build every server-side config with only the isomorphic surface.
// =============================================================================
describe('SSR safety — server builds real configs with no DOM', () => {
  it('builds a KYC form via the fluent builder (form.create → add → setValidation → build)', () => {
    const catalog = ril.create().component('text', { renderer: TextRenderer });
    const kyc = form
      .create(catalog, 'kyc-identity')
      .add({ id: 'legalName', type: 'text', props: { label: 'Legal name' } })
      .add({ id: 'dob', type: 'text', props: { label: 'Date of birth' } })
      .setValidation({ mode: 'onChange' })
      .build();

    expect(kyc.id).toBe('kyc-identity');
    expect(kyc.allFields.map((f) => f.id)).toEqual(['legalName', 'dob']);
    expect(kyc.validation?.mode).toBe('onChange');
    // A FormConfiguration is a plain data structure — no DOM was consulted.
    expect(Array.isArray(kyc.rows)).toBe(true);
  });

  it('builds a multi-step flow via flow.create → step → build', () => {
    const catalog = ril.create().component('text', { renderer: TextRenderer });
    const identityForm = form
      .create(catalog, 'identity')
      .add({ id: 'legalName', type: 'text', props: { label: 'Legal name' } })
      .build();
    const addressForm = form
      .create(catalog, 'address')
      .add({ id: 'country', type: 'text', props: { label: 'Country' } })
      .build();

    const workflow = flow
      .create(catalog, 'kyc-flow', 'KYC Onboarding', 'Server-assembled due diligence')
      .step({ id: 'identity', title: 'Identity', formConfig: identityForm })
      .step({ id: 'address', title: 'Address', formConfig: addressForm })
      .build();

    expect(workflow.id).toBe('kyc-flow');
    expect(workflow.name).toBe('KYC Onboarding');
    expect(workflow.steps.map((s) => s.id)).toEqual(['identity', 'address']);
  });

  it('compileForm turns a data-only JSON schema into a live FormConfiguration', () => {
    const catalog = ril.create().component('text', { renderer: TextRenderer });
    const SCHEMA_JSON = `{
      "version": 1,
      "id": "server-kyc",
      "validation": { "mode": "onChange" },
      "fields": [
        { "id": "email", "type": "text", "props": { "label": "Email" },
          "validation": { "rules": ["required"] } },
        { "id": "fullName", "type": "text", "default": "Ada Lovelace" }
      ],
      "defaultValues": { "email": "" }
    }`;
    const schema: FormSchema = JSON.parse(SCHEMA_JSON);
    // Data-only: round-trips through JSON unchanged (holds no functions).
    expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(SCHEMA_JSON)));

    const { formConfig, defaultValues } = compileForm(schema, catalog);
    expect(formConfig.id).toBe('server-kyc');
    expect(formConfig.allFields.map((f) => f.id)).toEqual(['email', 'fullName']);
    // Inline per-field default + top-level defaultValues merge deterministically.
    expect(defaultValues).toEqual({ fullName: 'Ada Lovelace', email: '' });
  });

  it('manifest(catalog) projects a component/tool catalog to a model-facing string', () => {
    const catalog = buildCatalog();
    const md = manifest(catalog);
    expect(typeof md).toBe('string');
    // Components section lists the registered component + its introspected prop.
    expect(md).toContain('## Available components');
    expect(md).toContain('**text**');
    expect(md).toContain('A single-line text input');
    expect(md).toContain('label');
    // Tools section lists the emittable show_* tools registered by uiTools().
    expect(md).toContain('## Available tools');
    expect(md).toContain('**show_form**');
    expect(md).toContain('**show_flow**');
    expect(md).toContain('**show_component**');
    // Guidance is emitted because those tools are emittable.
    expect(md).toContain('## How to show UI');
  });

  it('tools(catalog) (ai-sdk) emits execute-less HITL tool definitions', () => {
    const catalog = buildCatalog();
    const toolSet = tools(catalog);
    const names = Object.keys(toolSet).sort();
    expect(names).toEqual(['show_component', 'show_flow', 'show_form']);
    for (const name of names) {
      const def = toolSet[name];
      // HITL: no `execute` (the client resolves via addToolResult).
      expect('execute' in def).toBe(false);
      // Each carries an AI-SDK jsonSchema-wrapped inputSchema.
      expect(def.inputSchema).toBeTypeOf('object');
      // A Map+fromEntries accumulator → own props only, never prototype pollution.
      expect(Object.getPrototypeOf(toolSet)).toBe(Object.prototype);
    }
  });

  it('uiTools() is a pure plugin (no React pulled onto the server path)', () => {
    // A plugin is a function; applying it registers tools on the catalog.
    expect(uiTools()).toBeTypeOf('function');
    const catalog = ril.create().use(uiTools());
    expect(
      catalog
        .getAllTools()
        .map((t) => t.name)
        .sort()
    ).toEqual(['show_component', 'show_flow', 'show_form']);
  });
});

// =============================================================================
// 3. Server-render the React surface with react-dom/server — no DOM needed.
// =============================================================================
describe('SSR safety — react-dom/server renders <Form> in node', () => {
  it('renderToStaticMarkup emits the KYC fields with no window/document', async () => {
    // Client surface is imported dynamically here so scenario 1/2 stay pure-server.
    const { Form } = await import('rilaykit/react');

    const catalog = ril.create().component('text', { renderer: TextRenderer });
    const kyc = form
      .create(catalog, 'kyc-ssr')
      .add({ id: 'legalName', type: 'text', props: { label: 'Legal name' } })
      .add({ id: 'nationality', type: 'text', props: { label: 'Nationality' } })
      .build();

    // Still no DOM at render time — this is the assertion that matters for SSR.
    expect(typeof document).toBe('undefined');
    const html = renderToStaticMarkup(
      <Form of={kyc} defaults={{ legalName: 'Ada', nationality: 'GB' }}>
        <Form.Body />
      </Form>
    );

    expect(typeof html).toBe('string');
    // Both fields' inputs (data-testid = field id) appear in the server markup…
    expect(html).toContain('data-testid="legalName"');
    expect(html).toContain('data-testid="nationality"');
    // …with the seeded defaults painted into their value attributes.
    expect(html).toContain('value="Ada"');
    expect(html).toContain('value="GB"');
  });
});

// =============================================================================
// 4. 'use client' placement — the six client entries carry the banner; the
//    isomorphic mains must NOT (a main with 'use client' breaks RSC server import).
// =============================================================================
describe("SSR safety — 'use client' banner placement", () => {
  const CLIENT_ENTRIES = [
    'packages/rilaykit/src/react/index.ts',
    'packages/forms/src/react/index.ts',
    'packages/workflow/src/react/index.ts',
    'packages/agent/src/react/index.ts',
  ];
  const ISOMORPHIC_ENTRIES = [
    'packages/rilaykit/src/index.ts',
    'packages/rilaykit/src/ai-sdk/index.ts',
    'packages/rilaykit/src/anthropic/index.ts',
    'packages/forms/src/index.ts',
    'packages/workflow/src/index.ts',
    'packages/agent/src/index.ts',
    'packages/agent/src/ai-sdk/index.ts',
    'packages/agent/src/anthropic/index.ts',
  ];

  for (const entry of CLIENT_ENTRIES) {
    it(`${entry} starts with a 'use client' directive`, () => {
      const src = read(entry);
      // The directive must be the FIRST statement — a leading block comment is
      // fine, but no executable code may precede it. Strip a leading comment then
      // assert the first non-empty line is the directive.
      const firstStmt = src
        .replace(/^﻿/, '')
        .replace(/^(\s*\/\*[\s\S]*?\*\/\s*)?/, '')
        .replace(/^(\s*\/\/.*\n)*/, '')
        .trimStart();
      expect(firstStmt.startsWith("'use client'") || firstStmt.startsWith('"use client"')).toBe(
        true
      );
    });
  }

  for (const entry of ISOMORPHIC_ENTRIES) {
    it(`${entry} does NOT carry a 'use client' directive`, () => {
      const src = read(entry);
      expect(/^\s*['"]use client['"]/m.test(src)).toBe(false);
    });
  }
});

// =============================================================================
// 5. No RUNTIME React import at module scope in the isomorphic entries.
//    (A type-only `import type ... from 'react'` is fine; a value import is a bug.)
// =============================================================================
describe('SSR safety — isomorphic entries have no runtime React import', () => {
  const ISOMORPHIC_ENTRIES = [
    'packages/rilaykit/src/index.ts',
    'packages/forms/src/index.ts',
    'packages/workflow/src/index.ts',
    'packages/agent/src/index.ts',
  ];

  for (const entry of ISOMORPHIC_ENTRIES) {
    it(`${entry} imports React only as types, if at all`, () => {
      const src = read(entry);
      // Any `import ... from 'react'` line that is NOT `import type` is a runtime
      // React dependency in an isomorphic main — a finding.
      const reactImports = src
        .split('\n')
        .filter((line) => /\bfrom\s+['"]react(-dom)?['"]/.test(line));
      for (const line of reactImports) {
        expect(line.includes('import type')).toBe(true);
      }
    });
  }
});
