import type { ToolPart } from '../../types/part';

/** The HITL resolve payload the interactive built-ins deliver, read defensively:
 * it is whatever the host posted back, so every field is optional. */
interface SettledOutput {
  readonly status?: unknown;
  readonly values?: unknown;
  readonly error?: unknown;
}

/** A submitted value renders as text: primitives directly, objects/arrays (a
 * flow's step-keyed data) as compact JSON so nothing is silently dropped. */
function formatValue(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Built-in renderer for a SETTLED interactive tool (`show_form` / `show_flow` at
 * `done`/`error`). A settled HITL call used to fall through to `DefaultTool`,
 * printing the bare humanized tool name ("Show form") as transcript content —
 * surprising for an answered form. This renders an explicit, read-only summary of
 * the answer keyed on the resolved STATUS (never the tool name), and never mounts
 * interactive controls (a rehydrated conversation must not re-arm the
 * one-answer-per-call loop).
 *
 * A superset of `DefaultTool`: it keeps the same `data-part`/`data-tool-name`/
 * `data-tool-state` styling hooks so host CSS still applies, and adds
 * `data-agent-settled` (the status) plus the value/error content. Bare markup, no
 * styles of our own — hosts override via `.renderers()` for richer UX.
 */
export function SettledToolResult({ part }: { readonly part: ToolPart }) {
  const output = isRecord(part.output) ? (part.output as SettledOutput) : undefined;
  // The AI-SDK `error` STATE (a provider/tool failure) is a terminal error
  // regardless of any output; otherwise the resolved status drives the summary.
  const rawStatus = part.state === 'error' ? 'error' : output?.status;
  const status = typeof rawStatus === 'string' && rawStatus.length > 0 ? rawStatus : 'done';
  const values = isRecord(output?.values) ? output.values : undefined;
  const errorText = typeof output?.error === 'string' ? output.error : part.errorText;
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div
      data-part="tool"
      data-tool-name={part.name}
      data-tool-state={part.state}
      data-agent-settled={status}
    >
      {/* A status word, never the humanized tool name — the leak issue #23's
          secondary point is about. */}
      <span data-agent-settled-label>{label}</span>
      {status === 'submitted' && values && Object.keys(values).length > 0 ? (
        <dl data-agent-settled-values>
          {Object.entries(values).map(([key, value]) => (
            <div key={key}>
              <dt data-agent-settled-key={key}>{key}</dt>
              <dd data-agent-settled-value>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {status === 'error' && errorText ? (
        <p data-agent-settled-error role="status">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
