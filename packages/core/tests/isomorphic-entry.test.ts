import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The main entry must never import runtime React: `lib/catalog.ts` is imported by
 * server code (route handlers, RSC), and a module-scope createContext there crashes
 * a Server Component. Vitest aliases resolve to source, so this MUST run against the
 * real built artifact in a child process — the same blindness that let a broken CJS
 * bundle ship in P2 r3.
 *
 * `process.cwd()` is the monorepo root when vitest is invoked from there, but the
 * package's own dir when run via `pnpm --filter @rilaykit/core test`. Resolve from
 * this test file's location instead so both invocation styles find the built dist.
 */
const distEntry = path.resolve(__dirname, '../dist/index.js');

describe('@rilaykit/core main entry', () => {
  it('does not pull React into the module graph', () => {
    const script = `
      require('${distEntry}');
      const pulled = Object.keys(require.cache).some((p) => /node_modules[\\\\/]react[\\\\/]/.test(p));
      if (pulled) { console.error('REACT_PULLED'); process.exit(1); }
      process.exit(0);
    `;
    expect(() => execFileSync('node', ['-e', script], { stdio: 'pipe' })).not.toThrow();
  });
});
