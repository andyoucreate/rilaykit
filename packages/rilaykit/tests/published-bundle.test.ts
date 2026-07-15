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
  { name: 'rilaykit', dir: 'rilaykit', minExports: 150 },
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

function entries(pkg: PublishedPackage): { cjs: string; esm: string } {
  const dist = join(packageDir(pkg), 'dist');
  return { cjs: join(dist, 'index.js'), esm: join(dist, 'index.mjs') };
}

const isBuilt = PUBLISHED_PACKAGES.every((pkg) => {
  const { cjs, esm } = entries(pkg);
  return existsSync(cjs) && existsSync(esm);
});

interface BundleReport {
  cjsExports: string[];
  esmExports: string[];
}

/**
 * Loads one package's two bundles in a real node process and reports what they
 * expose. `require()` and `import()` run against the emitted files with node's
 * own resolution — no bundler, no alias, no transform.
 */
function inspectPublishedBundles(pkg: PublishedPackage): BundleReport {
  const { cjs, esm } = entries(pkg);
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

describe.skipIf(isBuilt)('published-bundle checks', () => {
  it.skip(`skipped — a package's dist/ is absent. These checks read the emitted
    bundles, so they need a build: run \`pnpm build\` (or \`pnpm test:ci\`, which builds
    first — this is how CI always runs them).`, () => {});
});
