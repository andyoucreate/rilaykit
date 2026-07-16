import type { EmissionResult } from '../../errors/emission-error';

/** Bare structural markup — data-* hooks for styling, no styles of our own. */
export function EmissionErrorView({ result }: { readonly result: EmissionResult }) {
  return (
    <div data-agent-error="emission">
      <p data-agent-error-message>{result.error}</p>
      {result.issues.length > 0 && (
        <ul data-agent-error-issues>
          {result.issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`} data-agent-error-path={issue.path}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
