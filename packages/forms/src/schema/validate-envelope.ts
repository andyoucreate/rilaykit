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
