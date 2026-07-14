/**
 * @fileoverview Internal runtime logger for RilayKit.
 *
 * The library must never write directly to `console.*` from its runtime code:
 * uncontrollable console spam is a poor citizen in a consumer application. This
 * module provides a single, redirectable logging seam that every runtime site
 * routes through. Consumers can silence or forward all library logs via
 * {@link setLogSink}.
 *
 * The default sink is the ONLY sanctioned place in the runtime where `console.*`
 * is called: it forwards `warn`/`error` to the matching console method (prefixed
 * with the emitting scope) and silences `debug` entirely.
 */

export type LogLevel = 'debug' | 'warn' | 'error';

/**
 * A sink receives every log emitted by the library. Implement one and register
 * it with {@link setLogSink} to redirect, structure, or silence library logs.
 */
export type LogSink = (
  level: LogLevel,
  scope: string,
  message: string,
  ...args: unknown[]
) => void;

/**
 * Default sink: routes `warn`/`error` to the corresponding console method with a
 * `[rilay:<scope>]` prefix, and silences `debug`. This is the only place in the
 * runtime where `console.*` is permitted.
 */
const defaultSink: LogSink = (level, scope, message, ...args) => {
  if (level === 'debug') {
    return;
  }

  const prefix = `[rilay:${scope}]`;

  if (level === 'warn') {
    console.warn(prefix, message, ...args);
    return;
  }

  console.error(prefix, message, ...args);
};

let sink: LogSink = defaultSink;

/**
 * Redirect (or silence) every log the library emits. Pass `null` to restore the
 * default console-backed sink.
 */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? defaultSink;
}

/**
 * A scoped logger. Each method forwards to the currently registered sink, so a
 * logger captured before {@link setLogSink} still honours later redirection.
 */
export interface Logger {
  readonly debug: (message: string, ...args: unknown[]) => void;
  readonly warn: (message: string, ...args: unknown[]) => void;
  readonly error: (message: string, ...args: unknown[]) => void;
}

/**
 * Create a scoped logger. `scope` identifies the emitting module, e.g.
 * `'forms:effects'` or `'workflow:persistence'`.
 */
export function getLogger(scope: string): Logger {
  return {
    debug: (message, ...args) => sink('debug', scope, message, ...args),
    warn: (message, ...args) => sink('warn', scope, message, ...args),
    error: (message, ...args) => sink('error', scope, message, ...args),
  };
}
