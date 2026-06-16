import type { ZodIssue } from 'zod';
import { SchemaValidationError, type ValidationIssue } from './errors';
import { assertSurfaceMatchesManifest } from './manifest';
import { normalizeSurface } from './normalize';
import { registryManifestSchema, surfaceSchema } from './schemas';
import type { CompiledSurface } from './types';

export function compileSurface(rawSurface: unknown, rawManifest: unknown): CompiledSurface {
  const surfaceResult = surfaceSchema.safeParse(rawSurface);

  if (!surfaceResult.success) {
    throw new SchemaValidationError(
      zodIssuesToValidationIssues(surfaceResult.error.issues, 'surface')
    );
  }

  const manifestResult = registryManifestSchema.safeParse(rawManifest);

  if (!manifestResult.success) {
    throw new SchemaValidationError(
      zodIssuesToValidationIssues(manifestResult.error.issues, 'manifest'),
      { target: 'manifest' }
    );
  }

  assertSurfaceMatchesManifest(surfaceResult.data, manifestResult.data);

  return {
    graph: normalizeSurface(surfaceResult.data),
  };
}

function zodIssuesToValidationIssues(
  issues: readonly ZodIssue[],
  target: 'surface' | 'manifest'
): ValidationIssue[] {
  return issues.map((issue) => ({
    path: [target, ...issue.path],
    message: issue.message,
    code: issue.code,
  }));
}
