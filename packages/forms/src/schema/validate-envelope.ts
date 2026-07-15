import type { SchemaIssue } from './types';

// =================================================================
// SCHEMA ENVELOPE VALIDATION
// =================================================================

/**
 * Structural guard for the `id`/`version` envelope shared by every schema.
 *
 * Single source of truth for the guard half of the envelope rules — form and
 * flow guards both delegate here, so a new rule (or version) lands once.
 */
export function isSchemaEnvelope(value: unknown): value is { id: string; version?: 1 } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return false;
  return obj.version === undefined || obj.version === 1;
}

/**
 * Guards one entry of a schema array before it is dereferenced.
 *
 * Untrusted JSON puts `null`, `undefined` and bare scalars wherever an object is
 * declared. Every such entry must funnel into the typed SchemaValidationError
 * rather than throwing a raw TypeError off the first property read, so this is
 * the single guard every array walker (rows, fields, repeatable rows, steps)
 * calls before touching an entry.
 *
 * @param entryLabel Subject of the issue message, e.g. "Row" → "Row entry must be an object".
 * @returns `true` when the entry is a real object and may be dereferenced.
 */
export function validateObjectEntry(
  entry: unknown,
  path: string,
  entryLabel: string,
  issues: SchemaIssue[]
): boolean {
  if (entry === null || typeof entry !== 'object') {
    issues.push({
      path,
      message: `${entryLabel} entry must be an object`,
      severity: 'error',
    });
    return false;
  }
  return true;
}

/**
 * Validates the `id`/`version` envelope shared by every serialized schema.
 *
 * Single source of truth for envelope rules — form and flow schemas both
 * delegate here so a new rule (or version) lands in one place.
 *
 * @param schemaLabel Subject of the issue messages, e.g. "Form schema".
 */
export function validateSchemaEnvelope(
  schema: { readonly id?: unknown; readonly version?: unknown },
  schemaLabel: string,
  issues: SchemaIssue[]
): void {
  if (!schema.id || typeof schema.id !== 'string') {
    issues.push({
      path: 'id',
      message: `${schemaLabel} must have a non-empty "id"`,
      severity: 'error',
    });
  }

  if (schema.version !== undefined && schema.version !== 1) {
    issues.push({
      path: 'version',
      message: `Unsupported ${schemaLabel} version "${schema.version}". Only version 1 is supported.`,
      severity: 'error',
    });
  }
}
