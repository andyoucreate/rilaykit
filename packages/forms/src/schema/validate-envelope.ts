import type { SchemaIssue } from './types';

// =================================================================
// SCHEMA ENVELOPE VALIDATION
// =================================================================

/** Nouns used to phrase envelope issues for a given schema kind. */
export interface SchemaEnvelopeLabels {
  /** Subject of the "id" message, e.g. "Form schema" / "Flow schema". */
  readonly schemaLabel: string;
  /** Noun in the version message, e.g. "schema" / "flow schema". */
  readonly versionLabel: string;
}

/**
 * Validates the `id`/`version` envelope shared by every serialized schema.
 *
 * Single source of truth for envelope rules — form and flow schemas both
 * delegate here so a new rule (or version) lands in one place.
 */
export function validateSchemaEnvelope(
  schema: { readonly id?: unknown; readonly version?: unknown },
  labels: SchemaEnvelopeLabels,
  issues: SchemaIssue[]
): void {
  if (!schema.id || typeof schema.id !== 'string') {
    issues.push({
      path: 'id',
      message: `${labels.schemaLabel} must have a non-empty "id"`,
      severity: 'error',
    });
  }

  if (schema.version !== undefined && schema.version !== 1) {
    issues.push({
      path: 'version',
      message: `Unsupported ${labels.versionLabel} version "${schema.version}". Only version 1 is supported.`,
      severity: 'error',
    });
  }
}
