import { SchemaValidationError, type ValidationIssue } from './errors';
import { assertSurfaceMatchesManifest } from './manifest';
import { normalizeSurface } from './normalize';
import { registryManifestSchema, surfaceSchema } from './schemas';
import type { CompiledSurface } from './types';

export function compileSurface(rawSurface: unknown, rawManifest: unknown): CompiledSurface {
  const surfaceResult = surfaceSchema.safeParse(rawSurface);

  if (!surfaceResult.success) {
    throw new SchemaValidationError(zodIssuesToValidationIssues(surfaceResult.error.issues));
  }

  const manifestResult = registryManifestSchema.safeParse(rawManifest);

  if (!manifestResult.success) {
    throw new SchemaValidationError(zodIssuesToValidationIssues(manifestResult.error.issues));
  }

  assertSurfaceMatchesManifest(surfaceResult.data, manifestResult.data);

  return {
    graph: normalizeSurface(surfaceResult.data),
  };
}

function zodIssuesToValidationIssues(
  issues: readonly { readonly path: readonly (string | number)[]; readonly message: string; readonly code: string }[]
): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
}
