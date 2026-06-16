import { z } from 'zod';
import type { JsonValue, RegistryManifest, SurfaceNode, SurfaceSchema } from './types';

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const validationDescriptorSchema = z
  .object({
    type: z.string().min(1),
    message: z.string().optional(),
    params: jsonObjectSchema.optional(),
  })
  .strict();

export const conditionDescriptorSchema = z
  .object({
    field: z.string().min(1),
    operator: z.enum([
      'equals',
      'notEquals',
      'greaterThan',
      'lessThan',
      'greaterThanOrEqual',
      'lessThanOrEqual',
      'contains',
      'notContains',
      'in',
      'notIn',
      'exists',
      'notExists',
      'matches',
    ]),
    value: jsonValueSchema.optional(),
  })
  .strict();

export const conditionsDescriptorSchema = z
  .object({
    visible: conditionDescriptorSchema.optional(),
    disabled: conditionDescriptorSchema.optional(),
    required: conditionDescriptorSchema.optional(),
    readonly: conditionDescriptorSchema.optional(),
    skippable: conditionDescriptorSchema.optional(),
  })
  .strict();

const baseNodeSchema = z.object({
  type: z.string().min(1),
  props: jsonObjectSchema.optional(),
  conditions: conditionsDescriptorSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const surfaceNodeSchema: z.ZodType<SurfaceNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    baseNodeSchema
      .extend({
        kind: z.literal('field'),
        id: z.string().min(1),
        validation: z.array(validationDescriptorSchema).optional(),
        defaultValue: jsonValueSchema.optional(),
      })
      .strict(),
    baseNodeSchema.extend({ kind: z.literal('content') }).strict(),
    baseNodeSchema
      .extend({
        kind: z.literal('action'),
        id: z.string().min(1).optional(),
        handler: z.string().min(1).optional(),
      })
      .strict(),
    baseNodeSchema
      .extend({
        kind: z.literal('group'),
        nodes: z.array(surfaceNodeSchema),
      })
      .strict(),
    baseNodeSchema.extend({ kind: z.literal('slot') }).strict(),
  ]),
);

export const surfaceStepSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    metadata: jsonObjectSchema.optional(),
    conditions: conditionsDescriptorSchema.optional(),
    nodes: z.array(surfaceNodeSchema),
  })
  .strict();

const baseSurfaceSchema = z.object({
  version: z.literal(2),
  kind: z.literal('surface'),
  id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const screenSurfaceSchema = baseSurfaceSchema
  .extend({
    mode: z.literal('screen'),
    nodes: z.array(surfaceNodeSchema),
  })
  .strict();

export const flowSurfaceSchema = baseSurfaceSchema
  .extend({
    mode: z.literal('flow'),
    steps: z.array(surfaceStepSchema),
  })
  .strict();

export const surfaceSchema = z.discriminatedUnion('mode', [
  screenSurfaceSchema,
  flowSurfaceSchema,
]);

export function isSurfaceSchema(value: unknown): value is SurfaceSchema {
  return surfaceSchema.safeParse(value).success;
}

const jsonSchemaObjectSchema = jsonObjectSchema;

export const nodeManifestEntrySchema = z
  .object({
    kind: z.enum(['content', 'group', 'slot']),
    propsSchema: jsonSchemaObjectSchema.optional(),
    description: z.string().optional(),
    examples: z.array(jsonValueSchema).optional(),
    capabilities: jsonObjectSchema.optional(),
  })
  .strict();

export const fieldManifestEntrySchema = z
  .object({
    kind: z.literal('field'),
    propsSchema: jsonSchemaObjectSchema.optional(),
    valueSchema: jsonSchemaObjectSchema.optional(),
    description: z.string().optional(),
    examples: z.array(jsonValueSchema).optional(),
    capabilities: jsonObjectSchema.optional(),
    validations: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const actionManifestEntrySchema = z
  .object({
    kind: z.literal('action'),
    propsSchema: jsonSchemaObjectSchema.optional(),
    description: z.string().optional(),
    examples: z.array(jsonValueSchema).optional(),
    capabilities: jsonObjectSchema.optional(),
    handlerRequired: z.boolean().optional(),
  })
  .strict();

export const registryManifestSchema = z
  .object({
    version: z.literal(1),
    fields: z.record(fieldManifestEntrySchema).optional(),
    content: z
      .record(nodeManifestEntrySchema.extend({ kind: z.literal('content') }))
      .optional(),
    actions: z.record(actionManifestEntrySchema).optional(),
    groups: z
      .record(nodeManifestEntrySchema.extend({ kind: z.literal('group') }))
      .optional(),
    slots: z
      .record(nodeManifestEntrySchema.extend({ kind: z.literal('slot') }))
      .optional(),
  })
  .strict();

export function isRegistryManifest(value: unknown): value is RegistryManifest {
  return registryManifestSchema.safeParse(value).success;
}
