import { type JsonPath, ManifestValidationError, type ValidationIssue } from './errors';
import type {
  ActionManifestEntry,
  ContentManifestEntry,
  FieldManifestEntry,
  GroupManifestEntry,
  RegistryManifest,
  SlotManifestEntry,
  SurfaceNode,
  SurfaceNodeKind,
  SurfaceSchema,
} from './types';

export type ManifestEntry =
  | FieldManifestEntry
  | ContentManifestEntry
  | ActionManifestEntry
  | GroupManifestEntry
  | SlotManifestEntry;

export interface ManifestEntryReference {
  readonly kind: SurfaceNodeKind;
  readonly type: string;
}

export function getManifestEntry(
  manifest: RegistryManifest,
  reference: ManifestEntryReference
): ManifestEntry | undefined {
  switch (reference.kind) {
    case 'field':
      return manifest.fields?.[reference.type];
    case 'content':
      return manifest.content?.[reference.type];
    case 'action':
      return manifest.actions?.[reference.type];
    case 'group':
      return manifest.groups?.[reference.type];
    case 'slot':
      return manifest.slots?.[reference.type];
    default: {
      const exhaustive: never = reference.kind;
      return exhaustive;
    }
  }
}

export function assertSurfaceMatchesManifest(
  surface: SurfaceSchema,
  manifest: RegistryManifest
): void {
  const issues: ValidationIssue[] = [];

  if (surface.mode === 'screen') {
    validateNodes(surface.nodes, manifest, ['nodes'], issues);
  } else {
    surface.steps.forEach((step, stepIndex) => {
      validateNodes(step.nodes, manifest, ['steps', stepIndex, 'nodes'], issues);
    });
  }

  if (issues.length > 0) {
    throw new ManifestValidationError(issues);
  }
}

function validateNodes(
  nodes: readonly SurfaceNode[],
  manifest: RegistryManifest,
  path: JsonPath,
  issues: ValidationIssue[]
): void {
  nodes.forEach((node, nodeIndex) => {
    validateNode(node, manifest, [...path, nodeIndex], issues);
  });
}

function validateNode(
  node: SurfaceNode,
  manifest: RegistryManifest,
  path: JsonPath,
  issues: ValidationIssue[]
): void {
  const entry = getManifestEntry(manifest, node);

  if (!entry) {
    issues.push({
      path: [...path, 'type'],
      message: `Unknown ${node.kind} type "${node.type}"`,
      code: 'manifest_unknown_type',
    });
  } else if (node.kind === 'field') {
    validateFieldNode(node, entry as FieldManifestEntry, path, issues);
  } else if (node.kind === 'action') {
    validateActionNode(node, entry as ActionManifestEntry, path, issues);
  }

  if (node.kind === 'group') {
    validateNodes(node.nodes, manifest, [...path, 'nodes'], issues);
  }
}

function validateFieldNode(
  node: Extract<SurfaceNode, { readonly kind: 'field' }>,
  entry: FieldManifestEntry,
  path: JsonPath,
  issues: ValidationIssue[]
): void {
  const allowedValidations = new Set(entry.validations ?? []);

  node.validation?.forEach((validation, validationIndex) => {
    if (!allowedValidations.has(validation.type)) {
      issues.push({
        path: [...path, 'validation', validationIndex, 'type'],
        message: `Validation type "${validation.type}" is not allowed for field type "${node.type}"`,
        code: 'manifest_unknown_validation',
      });
    }
  });
}

function validateActionNode(
  node: Extract<SurfaceNode, { readonly kind: 'action' }>,
  entry: ActionManifestEntry,
  path: JsonPath,
  issues: ValidationIssue[]
): void {
  if (entry.handlerRequired === true && node.handler === undefined) {
    issues.push({
      path: [...path, 'handler'],
      message: `Action type "${node.type}" requires a handler`,
      code: 'manifest_missing_handler',
    });
  }
}
