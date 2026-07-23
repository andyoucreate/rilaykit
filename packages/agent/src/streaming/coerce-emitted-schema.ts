/**
 * Defense-in-depth for issue #23: a model may serialize an emitted
 * FormSchema/FlowSchema as a JSON string even though the tool advertises an
 * object-typed `schema`. Coerce it back to its object at the agent boundary so
 * `compileForm`/`compileFlow` (which reject a non-object) still render the form.
 * Only an object/array parse is coerced — a scalar or non-JSON string, and any
 * non-string value, passes through so those paths still yield the proper
 * `SchemaValidationError`. Never throws.
 */
export function coerceEmittedSchema(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : raw;
  } catch {
    return raw;
  }
}
