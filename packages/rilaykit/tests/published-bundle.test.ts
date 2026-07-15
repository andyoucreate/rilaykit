// @vitest-environment node
// These checks spawn a real node process and touch no DOM. The suite's default
// jsdom environment would also rewrite `import.meta.url` to an http:// URL,
// which cannot be resolved back to a path.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the PUBLISHED artifact, which every other test in this repo is blind to.
 *
 * Vitest aliases `rilaykit` to `packages/rilaykit/src/index.ts`, so the whole
 * suite — `surface.test.ts` included — only ever exercises source through Vite's
 * ESM graph. It therefore cannot see a defect that exists solely in the bundle
 * tsup emits, and one did: the CJS bundle threw on `require()` for every
 * consumer while all 1747 source-resolved tests stayed green.
 *
 * These checks load the real `dist/` files the way a consumer does, in a CHILD
 * NODE PROCESS. That deliberately bypasses Vitest's aliases and Vite's module
 * graph — the transforms that hide this whole class of bug.
 *
 * Build-aware by design: `pnpm test:ci` is `pnpm build && vitest run`, so CI
 * always has `dist/` and always runs these. A bare local `pnpm test` skips them
 * with the reason below rather than forcing a build on every unrelated run.
 */

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const cjsEntry = join(distDir, 'index.js');
const esmEntry = join(distDir, 'index.mjs');
const isBuilt = existsSync(cjsEntry) && existsSync(esmEntry);

interface BundleReport {
  cjsExports: string[];
  esmExports: string[];
  cjsRilCreate: string;
  esmRilCreate: string;
  cjsAdaptersDistinct: boolean;
  cjsPersistenceAdapter: string;
  cjsMonitoringAdapter: string;
}

/**
 * Loads both bundles in a real node process and reports what they expose.
 * `require()` and `import()` run against the emitted files with node's own
 * resolution — no bundler, no alias, no transform.
 */
function inspectPublishedBundles(): BundleReport {
  const probe = `
    (async () => {
      const cjs = require(${JSON.stringify(cjsEntry)});
      const esm = await import(${JSON.stringify(pathToFileURL(esmEntry).href)});
      const names = (m) => Object.keys(m).filter((k) => k !== 'default').sort();
      process.stdout.write(JSON.stringify({
        cjsExports: names(cjs),
        esmExports: names(esm),
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

  return JSON.parse(stdout) as BundleReport;
}

describe.skipIf(!isBuilt)('the published rilaykit bundles load in a real node process', () => {
  it('require()s the CJS bundle and import()s the ESM bundle with an identical surface', () => {
    const report = inspectPublishedBundles();

    // The bundle must not merely load — it must expose a real surface. An empty
    // or near-empty object would mean the barrel silently collapsed.
    expect(report.cjsExports.length).toBeGreaterThan(150);

    // CJS and ESM are two emits of ONE barrel: any name reachable from one must
    // be reachable from the other. This is what drifts when a bundler's CJS
    // interop mishandles a re-export.
    expect(report.cjsExports).toEqual(report.esmExports);
  });

  it('exposes the enhanced ril through both module systems', () => {
    const report = inspectPublishedBundles();

    // `ril` is the barrel's own wrapper deliberately shadowing the `ril` that
    // `export * from '@rilaykit/core'` also provides. Emitting that shadow as a
    // getter-only star export made `require()` throw outright:
    //   TypeError: Cannot set property ril of #<Object> which has only a getter
    expect(report.cjsRilCreate).toBe('function');
    expect(report.esmRilCreate).toBe('function');
  });

  it('exposes the persistence and monitoring localStorage adapters under distinct names', () => {
    const report = inspectPublishedBundles();

    // Two DIFFERENT classes once shared the name `LocalStorageAdapter` — the
    // workflow persistence adapter and core's monitoring adapter. One name
    // cannot carry both in a barrel that re-exports both packages: the CJS emit
    // threw, and the type surface silently shadowed one away.
    expect(report.cjsPersistenceAdapter).toBe('function');
    expect(report.cjsMonitoringAdapter).toBe('function');
    expect(report.cjsAdaptersDistinct).toBe(true);
  });
});

describe.skipIf(isBuilt)('published-bundle checks', () => {
  it.skip(`skipped — packages/rilaykit/dist is absent. These checks read the emitted
    bundles, so they need a build: run \`pnpm build\` (or \`pnpm test:ci\`, which builds
    first — this is how CI always runs them).`, () => {});
});
