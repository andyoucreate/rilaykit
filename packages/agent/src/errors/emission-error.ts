import { SchemaValidationError } from '@rilaykit/forms';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface EmissionIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * The payload an invalid agent emission produces. Fed back to the model as a tool
 * result so it can retry. Format proven in production in stndrds `wrappers.ts`.
 */
export interface EmissionResult {
  readonly error: string;
  readonly issues: readonly EmissionIssue[];
  readonly expectedKeys: readonly string[];
}

function pathToString(
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
): string {
  if (!path) return '';
  return path
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment)
    )
    .join('.');
}

/** Never throws. An emission failure is data the model retries from, not an exception. */
export function toEmissionResult(
  error: unknown,
  expectedKeys: readonly string[] = []
): EmissionResult {
  if (error instanceof SchemaValidationError) {
    return {
      error: error.message,
      issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      expectedKeys,
    };
  }
  if (error instanceof Error) {
    return { error: error.message, issues: [], expectedKeys };
  }
  return { error: String(error), issues: [], expectedKeys };
}

function expectedKeysOf(schema: StandardSchemaV1): string[] {
  const shape = (schema as { readonly shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

/** Returns null when the props are valid; an EmissionResult when they are not. */
export function validateNodeProps(schema: StandardSchemaV1, props: unknown): EmissionResult | null {
  const result = schema['~standard'].validate(props);
  if (result instanceof Promise) {
    return {
      error: 'propsSchema must validate synchronously to render an agent emission',
      issues: [],
      expectedKeys: expectedKeysOf(schema),
    };
  }
  if (!result.issues) return null;
  return {
    error: 'Invalid props',
    issues: result.issues.map((issue) => ({
      path: pathToString(issue.path),
      message: issue.message,
    })),
    expectedKeys: expectedKeysOf(schema),
  };
}
