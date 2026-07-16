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
  { name: '@rilaykit/forms', dir: 'forms', minExports: 40 },
  { name: '@rilaykit/workflow', dir: 'workflow', minExports: 30 },
  { name: '@rilaykit/agent', dir: 'agent', minExports: 5 },
  { name: 'rilaykit', dir: 'rilaykit', minExports: 150 },
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
  { name: '@rilaykit/agent/react', dir: 'agent', subpath: 'react', minExports: 5 },
  { name: '@rilaykit/agent/ai-sdk', dir: 'agent', subpath: 'ai-sdk', minExports: 1 },
  { name: '@rilaykit/agent/anthropic', dir: 'agent', subpath: 'anthropic', minExports: 1 },
  { name: 'rilaykit/react', dir: 'rilaykit', subpath: 'react', minExports: 5 },
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
 * isomorphic main entry must never load runtime React into a fresh process's
 * module graph, since server code (`lib/catalog.ts`-style blueprints, RSC)
 * imports it directly. A module-scope `createContext` there crashes a Server
 * Component. `require.cache` is inspected from INSIDE the child process — this
 * has to run isolated from every other `require()` in this file, which is why
 * it is its own `execFileSync` call rather than reusing `inspectPublishedBundles`.
 */
function requireDoesNotPullReact(entryPath: string): boolean {
  const script = `
    require(${JSON.stringify(entryPath)});
    const pulled = Object.keys(require.cache).some((p) => /node_modules[\\\\/]react[\\\\/]/.test(p));
    process.exit(pulled ? 1 : 0);
  `;
  try {
    execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

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

  it('@rilaykit/agent: the main entry does not pull React into the module graph', () => {
    // uiTools, manifest, parsePartialJson, and the emission-error helpers are
    // PURE SCHEMAS meant to be imported by server code (see the module docstring
    // on `packages/agent/src/tools/ui-tools.ts`). React components live behind
    // `@rilaykit/agent/react` instead — this is what keeps the split real rather
    // than a documentation-only promise.
    const agent = PUBLISHED_PACKAGES.find((pkg) => pkg.name === '@rilaykit/agent');
    if (!agent) throw new Error('@rilaykit/agent is missing from PUBLISHED_PACKAGES');
    expect(requireDoesNotPullReact(entries(agent).cjs)).toBe(true);
  });

  // NOTE: `rilaykit`'s own main entry is NOT guarded the same way here. Unlike
  // `@rilaykit/core` and (as of this file) `@rilaykit/agent`, `@rilaykit/forms`
  // and `@rilaykit/workflow` were never split into an isomorphic main + a
  // `/react` subpath — `Form`, `Flow`, and the rest of their compound
  // components live in those packages' single main entry, which `rilaykit`
  // re-exports wholesale. `rilaykit`'s main entry has therefore always pulled
  // React (verified: it does, before and after this file's changes) and fixing
  // that is a forms/workflow restructuring outside this guard's scope. `Parts`
  // and `Catalog` staying OUT of `rilaykit`'s named exports (see
  // `tests/agent-surface.test.ts`) is the isomorphism guarantee this task adds;
  // it does not retroactively make the whole barrel React-free.
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

describe.skipIf(allBuilt)('published-bundle checks', () => {
  it.skip(`skipped — a package's dist/ is absent. These checks read the emitted
    bundles, so they need a build: run \`pnpm build\` (or \`pnpm test:ci\`, which builds
    first — this is how CI always runs them).`, () => {});
});
