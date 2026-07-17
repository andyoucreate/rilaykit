import type { EmissionResult } from '../../errors/emission-error';

/** Bare structural markup — data-* hooks for styling, no styles of our own. */
export function EmissionErrorView({ result }: { readonly result: EmissionResult }) {
  return (
    <div data-agent-error="emission">
      <p data-agent-error-message>{result.error}</p>
      {/* The TOP-LEVEL expectedKeys, not just the per-issue ones: for an
          unknown component this is the real catalog id list — the exact
          payload the retry channel delivers, kept visible too (R13-2). */}
      {result.expectedKeys.length > 0 && (
        <p data-agent-error-expected-keys={result.expectedKeys.join(',')}>
          Expected keys: {result.expectedKeys.join(', ')}
        </p>
      )}
      {result.issues.length > 0 && (
        <ul data-agent-error-issues>
          {result.issues.map((issue) => (
            <li
              key={`${issue.path}:${issue.message}`}
              data-agent-error-path={issue.path}
              data-agent-error-expected-keys={issue.expectedKeys?.join(',')}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
