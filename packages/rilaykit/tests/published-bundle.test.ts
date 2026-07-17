// @vitest-environment node
// These checks spawn a real node process and touch no DOM. The suite's default
// jsdom environment would also rewrite `import.meta.url` to an http:// URL,
// which cannot be resolved back to a path.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the PUBLISHED artifacts, which every other test in this repo is blind to.
 *
 * Vitest aliases every `@rilaykit/*` name to that package's `src/index.ts`, so
 * the whole suite — `surface.test.ts` included — only ever exercises source
 * through Vite's ESM graph. It therefore cannot see a defect that exists solely
 * in what tsup emits or in what npm would ship, and defects did: the all-in-one
 * CJS bundle threw on `require()` for every consumer while all 1747
 * source-resolved tests stayed green.
 *
 * These checks load the real `dist/` files the way a consumer does, in a CHILD
 * NODE PROCESS. That deliberately bypasses Vitest's aliases and Vite's module
 * graph — the transforms that hide this whole class of bug — and they cover
 * EVERY published package, not just the all-in-one that first tripped over it.
 *
 * Build-aware by design: `pnpm test:ci` is `pnpm build && vitest run`, so CI
 * always has `dist/` and always runs these. A bare local `pnpm test` skips them
 * with the reason below rather than forcing a build on every unrelated run.
 */

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));
const repoRoot = join(packagesDir, '..');

interface PublishedPackage {
  /** The name a consumer installs. */
  name: string;
  /** Directory under `packages/`. */
  dir: string;
  /** Lower bound on the barrel's export count — a collapsed barrel must fail. */
  minExports: number;
}

const PUBLISHED_PACKAGES: PublishedPackage[] = [
  { name: '@rilaykit/core', dir: 'core', minExports: 40 },
  // forms/workflow/rilaykit main entries are now ISOMORPHIC (their React
  // components/hooks moved to the `/react` subpaths), so their barrels are
  // smaller than before the split — the bounds track the isomorphic surface.
  { name: '@rilaykit/forms', dir: 'forms', minExports: 20 },
  { name: '@rilaykit/workflow', dir: 'workflow', minExports: 15 },
  { name: '@rilaykit/agent', dir: 'agent', minExports: 5 },
  { name: 'rilaykit', dir: 'rilaykit', minExports: 100 },
];

/**
 * A package's non-main entry point, e.g. `@rilaykit/agent/react`. Same shape as
 * `PublishedPackage` (so it can reuse `entries`/`inspectPublishedBundles`) plus
 * the subpath segment under `dist/`.
 */
interface PublishedSubpath extends PublishedPackage {
  /** Directory under `dist/`, e.g. `'react'` for `dist/react/index.js`. */
  readonly subpath: string;
}

const PUBLISHED_SUBPATHS: PublishedSubpath[] = [
  { name: '@rilaykit/forms/react', dir: 'forms', subpath: 'react', minExports: 25 },
  { name: '@rilaykit/workflow/react', dir: 'workflow', subpath: 'react', minExports: 20 },
  { name: '@rilaykit/agent/react', dir: 'agent', subpath: 'react', minExports: 5 },
  { name: '@rilaykit/agent/ai-sdk', dir: 'agent', subpath: 'ai-sdk', minExports: 1 },
  { name: '@rilaykit/agent/anthropic', dir: 'agent', subpath: 'anthropic', minExports: 1 },
  { name: 'rilaykit/react', dir: 'rilaykit', subpath: 'react', minExports: 25 },
  { name: 'rilaykit/ai-sdk', dir: 'rilaykit', subpath: 'ai-sdk', minExports: 1 },
  { name: 'rilaykit/anthropic', dir: 'rilaykit', subpath: 'anthropic', minExports: 1 },
];

function packageDir(pkg: PublishedPackage): string {
  return join(packagesDir, pkg.dir);
}

function readManifest(pkg: PublishedPackage): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageDir(pkg), 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

/** `subpath` selects a non-main entry, e.g. `entries(pkg, 'react')` → `dist/react/index.js`. */
function entries(pkg: PublishedPackage, subpath?: string): { cjs: string; esm: string } {
  const dist = subpath ? join(packageDir(pkg), 'dist', subpath) : join(packageDir(pkg), 'dist');
  return { cjs: join(dist, 'index.js'), esm: join(dist, 'index.mjs') };
}

const isBuilt = PUBLISHED_PACKAGES.every((pkg) => {
  const { cjs, esm } = entries(pkg);
  return existsSync(cjs) && existsSync(esm);
});

const subpathsBuilt = PUBLISHED_SUBPATHS.every((sub) => {
  const { cjs, esm } = entries(sub, sub.subpath);
  return existsSync(cjs) && existsSync(esm);
});

const allBuilt = isBuilt && subpathsBuilt;

interface BundleReport {
  cjsExports: string[];
  esmExports: string[];
}

/**
 * Loads one package's two bundles in a real node process and reports what they
 * expose. `require()` and `import()` run against the emitted files with node's
 * own resolution — no bundler, no alias, no transform. `subpath` selects a
 * non-main entry (see `entries`).
 */
function inspectPublishedBundles(pkg: PublishedPackage, subpath?: string): BundleReport {
  const { cjs, esm } = entries(pkg, subpath);
  const probe = `
    (async () => {
      const cjsModule = require(${JSON.stringify(cjs)});
      const esmModule = await import(${JSON.stringify(pathToFileURL(esm).href)});
      const names = (m) => Object.keys(m).filter((k) => k !== 'default').sort();
      process.stdout.write(JSON.stringify({
        cjsExports: names(cjsModule),
        esmExports: names(esmModule),
      }));
    })().catch((error) => {
      process.stderr.write(String((error && error.stack) || error));
      process.exit(1);
    });
  `;

  const stdout = execFileSync(process.execPath, ['-e', probe], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as BundleReport;
}

/** The all-in-one's own extra probes — it is the only barrel that re-exports the others. */
interface AllInOneReport {
  cjsRilCreate: string;
  esmRilCreate: string;
  cjsAdaptersDistinct: boolean;
  cjsPersistenceAdapter: string;
  cjsMonitoringAdapter: string;
}

function inspectAllInOne(): AllInOneReport {
  const allInOne = PUBLISHED_PACKAGES.find((pkg) => pkg.name === 'rilaykit');
  if (!allInOne) throw new Error('rilaykit is missing from PUBLISHED_PACKAGES');
  const { cjs, esm } = entries(allInOne);
  const probe = `
    (async () => {
      const cjs = require(${JSON.stringify(cjs)});
      const esm = await import(${JSON.stringify(pathToFileURL(esm).href)});
      process.stdout.write(JSON.stringify({
        cjsRilCreate: typeof (cjs.ril && cjs.ril.create),
        esmRilCreate: typeof (esm.ril && esm.ril.create),
        cjsAdaptersDistinct: cjs.LocalStorageAdapter !== cjs.LocalStorageMonitoringAdapter,
        cjsPersistenceAdapter: typeof cjs.LocalStorageAdapter,
        cjsMonitoringAdapter: typeof cjs.LocalStorageMonitoringAdapter,
      }));
    })().catch((error) => {
      process.stderr.write(String((error && error.stack) || error));
      process.exit(1);
    });
  `;

  const stdout = execFileSync(process.execPath, ['-e', probe], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as AllInOneReport;
}

/**
 * The error a package throws must be reachable from the package that throws it.
 * `@rilaykit/workflow` is published standalone: `compileFlow(untrustedJson)` on
 * backend/LLM-authored JSON throws `SchemaValidationError`, and a consumer that
 * installed only workflow has to narrow it without reaching into
 * `@rilaykit/forms` — an implementation detail of workflow's dependency graph.
 */
interface SchemaErrorReport {
  workflowExportsClass: string;
  /** The thrown error must be an instance of the class the SAME barrel exports. */
  workflowThrowIsInstance: boolean;
  workflowIssueCount: number;
  /** A re-export forwards one class object: identity must hold across barrels. */
  identityMatchesForms: boolean;
  identityMatchesAllInOne: boolean;
}

function inspectSchemaError(): SchemaErrorReport {
  const workflow = PUBLISHED_PACKAGES.find((pkg) => pkg.name === '@rilaykit/workflow');
  const forms = PUBLISHED_PACKAGES.find((pkg) => pkg.name === '@rilaykit/forms');
  const allInOne = PUBLISHED_PACKAGES.find((pkg) => pkg.name === 'rilaykit');
  if (!workflow || !forms || !allInOne) throw new Error('PUBLISHED_PACKAGES is missing a package');

  const probe = `
    const workflow = require(${JSON.stringify(entries(workflow).cjs)});
    const forms = require(${JSON.stringify(entries(forms).cjs)});
    const allInOne = require(${JSON.stringify(entries(allInOne).cjs)});
    let thrown;
    try {
      workflow.compileFlow({ id: 'f', name: 'F', steps: [] }, {});
    } catch (error) {
      thrown = error;
    }
    process.stdout.write(JSON.stringify({
      workflowExportsClass: typeof workflow.SchemaValidationError,
      workflowThrowIsInstance: thrown instanceof workflow.SchemaValidationError,
      workflowIssueCount: (thrown && thrown.issues && thrown.issues.length) || 0,
      identityMatchesForms: workflow.SchemaValidationError === forms.SchemaValidationError,
      identityMatchesAllInOne: workflow.SchemaValidationError === allInOne.SchemaValidationError,
    }));
  `;

  const stdout = execFileSync(process.execPath, ['-e', probe], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout) as SchemaErrorReport;
}

/**
 * Mirrors `packages/core/tests/isomorphic-entry.test.ts`'s technique: an
 * isomorphic main entry must never load a disqualifying module into a fresh
 * process's module graph — runtime React (a module-scope `createContext`
 * crashes a Server Component) or `@rilaykit/forms` (its main entry bundles
 * React components, same problem one hop away). `require.cache` is inspected
 * from INSIDE the child process — this has to run isolated from every other
 * `require()` in this file, which is why it is its own `execFileSync` call
 * rather than reusing `inspectPublishedBundles`. Generalized over `pattern`
 * so both guards share one probe (DRY) rather than forking the script per
 * disqualifying module.
 */
function requireDoesNotPull(entryPath: string, pattern: RegExp): boolean {
  const script = `
    require(${JSON.stringify(entryPath)});
    const pattern = new RegExp(${JSON.stringify(pattern.source)});
    const pulled = Object.keys(require.cache).some((p) => pattern.test(p));
    process.exit(pulled ? 1 : 0);
  `;
  try {
    execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const REACT_MODULE_PATH = /node_modules[\\/]react[\\/]/;

/**
 * `@rilaykit/forms`, resolved from `@rilaykit/agent`'s main entry. In THIS
 * monorepo forms is a `workspace:*` dependency: `node_modules/@rilaykit/forms`
 * is a symlink, and Node's `require()` resolves it to its REAL path before
 * caching — confirmed by probing `require.cache` directly, the resolved key is
 * `.../packages/forms/dist/index.js`, never `node_modules/@rilaykit/forms/`.
 * A real npm install (no workspace symlink) puts it under
 * `node_modules/@rilaykit/forms/` instead, so the pattern below matches both
 * shapes rather than assuming either one.
 */
const FORMS_MODULE_PATH = /node_modules[\\/]@rilaykit[\\/]forms[\\/]|[\\/]packages[\\/]forms[\\/]/;

describe.skipIf(!isBuilt)('every published bundle loads in a real node process', () => {
  for (const pkg of PUBLISHED_PACKAGES) {
    it(`${pkg.name}: require()s the CJS bundle and import()s the ESM bundle with an identical surface`, () => {
      const report = inspectPublishedBundles(pkg);

      // The bundle must not merely load — it must expose a real surface. An
      // empty or near-empty object would mean the barrel silently collapsed.
      expect(report.cjsExports.length).toBeGreaterThan(pkg.minExports);

      // CJS and ESM are two emits of ONE barrel: any name reachable from one
      // must be reachable from the other. This is what drifts when a bundler's
      // CJS interop mishandles a re-export.
      expect(report.cjsExports).toEqual(report.esmExports);
    });
  }

  it('rilaykit exposes the enhanced ril through both module systems', () => {
    const report = inspectAllInOne();

    // `ril` is the barrel's own wrapper deliberately shadowing the `ril` that
    // `export * from '@rilaykit/core'` also provides. Emitting that shadow as a
    // getter-only star export made `require()` throw outright:
    //   TypeError: Cannot set property ril of #<Object> which has only a getter
    expect(report.cjsRilCreate).toBe('function');
    expect(report.esmRilCreate).toBe('function');
  });

  it('rilaykit exposes the persistence and monitoring localStorage adapters under distinct names', () => {
    const report = inspectAllInOne();

    // Two DIFFERENT classes once shared the name `LocalStorageAdapter` — the
    // workflow persistence adapter and core's monitoring adapter. One name
    // cannot carry both in a barrel that re-exports both packages: the CJS emit
    // threw, and the type surface silently shadowed one away.
    expect(report.cjsPersistenceAdapter).toBe('function');
    expect(report.cjsMonitoringAdapter).toBe('function');
    expect(report.cjsAdaptersDistinct).toBe(true);
  });

  it('@rilaykit/workflow exports the SchemaValidationError its compileFlow throws', () => {
    const report = inspectSchemaError();

    expect(report.workflowExportsClass).toBe('function');
    expect(report.workflowThrowIsInstance).toBe(true);
    expect(report.workflowIssueCount).toBeGreaterThan(0);

    // One class object, re-exported — not three lookalikes. If a bundler inlined
    // a copy per barrel, `instanceof` would be false for a consumer that caught
    // the error from one package and narrowed it with another's class.
    expect(report.identityMatchesForms).toBe(true);
    expect(report.identityMatchesAllInOne).toBe(true);
  });

  it('@rilaykit/agent: the main entry does not pull React or @rilaykit/forms into the module graph', () => {
    // uiTools, manifest, parsePartialJson, and the emission-error helpers are
    // PURE SCHEMAS meant to be imported by server code (see the module docstring
    // on `packages/agent/src/tools/ui-tools.ts`). React components live behind
    // `@rilaykit/agent/react` instead — this is what keeps the split real rather
    // than a documentation-only promise. `@rilaykit/forms` is guarded for the
    // same reason: its main entry bundles React components, so pulling it in
    // would reintroduce the exact defect the React guard exists to catch, one
    // hop away.
    const agent = PUBLISHED_PACKAGES.find((pkg) => pkg.name === '@rilaykit/agent');
    if (!agent) throw new Error('@rilaykit/agent is missing from PUBLISHED_PACKAGES');
    expect(requireDoesNotPull(entries(agent).cjs, REACT_MODULE_PATH)).toBe(true);
    expect(requireDoesNotPull(entries(agent).cjs, FORMS_MODULE_PATH)).toBe(true);
  });

  // `@rilaykit/forms`, `@rilaykit/workflow`, and `rilaykit` main entries are now
  // split into an isomorphic main + a `/react` subpath (like core and agent), so
  // their main bundles must NOT pull runtime React into a fresh module graph — a
  // module-scope `createContext` there would crash a Server Component that imports
  // them. This is the load-bearing proof of the split, not a documentation promise.
  for (const target of PUBLISHED_PACKAGES.filter((pkg) =>
    ['forms', 'workflow', 'rilaykit'].includes(pkg.dir)
  )) {
    it(`${target.name}: the main entry does not pull React into the module graph`, () => {
      expect(requireDoesNotPull(entries(target).cjs, REACT_MODULE_PATH)).toBe(true);
    });
  }
});

describe.skipIf(!allBuilt)('every published subpath entry loads in a real node process', () => {
  for (const sub of PUBLISHED_SUBPATHS) {
    it(`${sub.name}: require()s the CJS bundle and import()s the ESM bundle with an identical surface`, () => {
      const report = inspectPublishedBundles(sub, sub.subpath);

      // Same collapsed-barrel guard as the main entries: an empty or
      // near-empty object means the subpath silently lost its exports.
      expect(report.cjsExports.length).toBeGreaterThan(sub.minExports);

      // CJS and ESM are two emits of the SAME barrel.
      expect(report.cjsExports).toEqual(report.esmExports);
    });
  }
});

/**
 * The manifest is as published as the bundle. A peer dependency the package does
 * not actually need at runtime is not cosmetic: npm/pnpm make every consumer
 * satisfy it or live with a warning on every install.
 */
describe('every published manifest declares only peers it actually needs', () => {
  function peers(pkg: PublishedPackage): Record<string, string> {
    return (readManifest(pkg).peerDependencies ?? {}) as Record<string, string>;
  }

  function optionalPeers(pkg: PublishedPackage): Record<string, { optional?: boolean }> {
    return (readManifest(pkg).peerDependenciesMeta ?? {}) as Record<string, { optional?: boolean }>;
  }

  function isRequiredPeer(pkg: PublishedPackage, name: string): boolean {
    return name in peers(pkg) && optionalPeers(pkg)[name]?.optional !== true;
  }

  it('@rilaykit/core does not force typescript on its consumers', () => {
    // core imports nothing from `typescript` at runtime or in its types — the
    // peer only ever produced a spurious install requirement.
    const core = PUBLISHED_PACKAGES.find((pkg) => pkg.name === '@rilaykit/core');
    if (!core) throw new Error('@rilaykit/core is missing from PUBLISHED_PACKAGES');
    expect(isRequiredPeer(core, 'typescript')).toBe(false);
  });

  it('no headless package forces react-dom on its consumers', () => {
    // Not one package imports react-dom: these are headless libraries, and a
    // react-native (or react-test-renderer) consumer must not be made to
    // install a DOM renderer to use them.
    for (const pkg of PUBLISHED_PACKAGES) {
      expect({ name: pkg.name, requiresReactDom: isRequiredPeer(pkg, 'react-dom') }).toEqual({
        name: pkg.name,
        requiresReactDom: false,
      });
    }
  });
});

/**
 * npm ships LICENSE and README implicitly, but only if the file EXISTS. A
 * package declaring `"license": "MIT"` with no license text ships a legal claim
 * it does not back.
 */
describe('every published package ships its license text', () => {
  const repoLicense = readFileSync(join(repoRoot, 'LICENSE.md'), 'utf8').trim();

  for (const pkg of PUBLISHED_PACKAGES) {
    it(`${pkg.name} ships a LICENSE matching the repository's`, () => {
      const licensePath = join(packageDir(pkg), 'LICENSE');
      expect(existsSync(licensePath)).toBe(true);
      expect(readFileSync(licensePath, 'utf8').trim()).toBe(repoLicense);
      expect(readManifest(pkg).license).toBe('MIT');
    });
  }
});

/**
 * The exports MAP is as published as the bundle, and its type resolution is
 * invisible to every source-aliased test in this repo. Two defects hid here
 * until `@arethetypeswrong/cli` was run against the packed tarballs:
 *
 *  - A single top-level `types` sibling to `import`/`require` resolves the CJS
 *    `.d.ts` under the ESM `import` condition too — attw's "Masquerading as CJS"
 *    for every `nodenext` ESM consumer. Each condition must carry its OWN types:
 *    `import` → `.d.mts`, `require` → `.d.ts`.
 *  - A subpath export with no `typesVersions` fallback resolves to NO types at
 *    all under `moduleResolution: node` (node10) — attw's 💀 for every subpath.
 *
 * These are structural manifest checks (no build needed), so they always run and
 * pin the fix without carrying attw itself as a test-time dependency.
 */
describe('every published exports map resolves ESM and CJS types distinctly', () => {
  interface ExportCondition {
    readonly types?: string;
    readonly import?: { readonly types?: string; readonly default?: string };
    readonly require?: { readonly types?: string; readonly default?: string };
  }

  function exportsMap(pkg: PublishedPackage): Record<string, ExportCondition> {
    return (readManifest(pkg).exports ?? {}) as Record<string, ExportCondition>;
  }

  for (const pkg of PUBLISHED_PACKAGES) {
    it(`${pkg.name}: every export condition carries per-condition types (no Masquerading-as-CJS)`, () => {
      for (const [sub, cond] of Object.entries(exportsMap(pkg))) {
        // A top-level `types` is the exact shape that masquerades; it must be
        // gone, replaced by per-condition types.
        expect({ sub, topLevelTypes: cond.types }).toEqual({ sub, topLevelTypes: undefined });
        expect(cond.import?.types).toMatch(/\.d\.mts$/);
        expect(cond.import?.default).toMatch(/\.mjs$/);
        expect(cond.require?.types).toMatch(/\.d\.ts$/);
        expect(cond.require?.default).toMatch(/\.js$/);
      }
    });
  }

  for (const sub of PUBLISHED_SUBPATHS) {
    it(`${sub.name}: declares a typesVersions fallback so node10 resolves the subpath's types`, () => {
      const typesVersions = (readManifest(sub).typesVersions ?? {}) as Record<
        string,
        Record<string, readonly string[]>
      >;
      expect(typesVersions['*']?.[sub.subpath]?.[0]).toMatch(/\.d\.ts$/);
    });
  }
});

/**
 * Next.js App Router (RSC) treats every module as a Server Component unless it
 * carries a top-of-file `"use client"` directive. A client entry (hooks/context)
 * without it fails `next build` when imported into a server component; an
 * isomorphic entry WITH it becomes client-only and loses its server usability.
 * tsup strips a source `"use client"` through its rollup treeshake pass — so this
 * pins BOTH that the directive survives the build on client entries AND that it
 * never contaminates the isomorphic ones. Reads the emitted .mjs (Next consumes
 * the `import` condition).
 */
describe.skipIf(!allBuilt)('"use client" is on every client entry and no isomorphic entry', () => {
  const pkg = (dir: string): PublishedPackage => ({ name: dir, dir, minExports: 0 });

  /** RSC client boundaries — must declare "use client". */
  const CLIENT_ENTRIES: ReadonlyArray<readonly [label: string, dir: string, subpath?: string]> = [
    ['@rilaykit/core/react', 'core', 'react'],
    ['@rilaykit/forms/react', 'forms', 'react'],
    ['@rilaykit/workflow/react', 'workflow', 'react'],
    ['@rilaykit/agent/react', 'agent', 'react'],
    ['rilaykit/react', 'rilaykit', 'react'],
  ];

  /** Server-usable entries — importing these into a Server Component must stay legal. */
  const ISOMORPHIC_ENTRIES: ReadonlyArray<readonly [label: string, dir: string, subpath?: string]> =
    [
      ['@rilaykit/core', 'core'],
      // forms/workflow/rilaykit main entries are now isomorphic (React moved to
      // their `/react` subpaths) — importing them into a Server Component is legal.
      ['@rilaykit/forms', 'forms'],
      ['@rilaykit/workflow', 'workflow'],
      ['@rilaykit/agent', 'agent'],
      ['rilaykit', 'rilaykit'],
      ['@rilaykit/agent/ai-sdk', 'agent', 'ai-sdk'],
      ['@rilaykit/agent/anthropic', 'agent', 'anthropic'],
      ['rilaykit/ai-sdk', 'rilaykit', 'ai-sdk'],
      ['rilaykit/anthropic', 'rilaykit', 'anthropic'],
    ];

  const declaresUseClient = (esmPath: string): boolean =>
    /^["']use client["']/.test(readFileSync(esmPath, 'utf8').trimStart());

  for (const [label, dir, subpath] of CLIENT_ENTRIES) {
    it(`${label}: the emitted bundle starts with "use client"`, () => {
      expect(declaresUseClient(entries(pkg(dir), subpath).esm)).toBe(true);
    });
  }

  for (const [label, dir, subpath] of ISOMORPHIC_ENTRIES) {
    it(`${label}: the emitted bundle does NOT declare "use client" (stays server-usable)`, () => {
      expect(declaresUseClient(entries(pkg(dir), subpath).esm)).toBe(false);
    });
  }
});

describe.skipIf(allBuilt)('published-bundle checks', () => {
  it.skip(`skipped — a package's dist/ is absent. These checks read the emitted
    bundles, so they need a build: run \`pnpm build\` (or \`pnpm test:ci\`, which builds
    first — this is how CI always runs them).`, () => {});
});
