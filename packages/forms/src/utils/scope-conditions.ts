import type { ConditionalBehavior } from '@rilaykit/core';
import type { ConditionConfig } from '@rilaykit/core';

// =================================================================
// SCOPE CONDITIONS
// =================================================================

/**
 * Prefixes field references in conditions to scope them to a specific
 * repeatable item. Only fields that belong to the template are prefixed;
 * references to global (non-template) fields are left unchanged.
 *
 * @param conditions - The conditional behavior to scope
 * @param repeatableId - The repeatable group ID
 * @param itemKey - The stable item key (e.g., "k0")
 * @param templateFieldIds - Set of field IDs belonging to the template
 * @returns A new ConditionalBehavior with scoped field references
 *
 * @example
 * ```ts
 * // Template field "qty" references template field "type":
 * //   when("type").equals("physical")
 * // After scoping to items[k2]:
 * //   when("items[k2].type").equals("physical")
 * //
 * // But a reference to global field "country" stays unchanged:
 * //   when("country").equals("US") → stays as-is
 * ```
 */
export function scopeConditions(
  conditions: ConditionalBehavior,
  repeatableId: string,
  itemKey: string,
  templateFieldIds: Set<string>
): ConditionalBehavior {
  const result: ConditionalBehavior = {};

  if (conditions.visible) {
    result.visible = scopeConditionConfig(
      conditions.visible,
      repeatableId,
      itemKey,
      templateFieldIds
    );
  }
  if (conditions.disabled) {
    result.disabled = scopeConditionConfig(
      conditions.disabled,
      repeatableId,
      itemKey,
      templateFieldIds
    );
  }
  if (conditions.required) {
    result.required = scopeConditionConfig(
      conditions.required,
      repeatableId,
      itemKey,
      templateFieldIds
    );
  }
  if (conditions.readonly) {
    result.readonly = scopeConditionConfig(
      conditions.readonly,
      repeatableId,
      itemKey,
      templateFieldIds
    );
  }

  return result;
}

/**
 * Recursively scopes a ConditionConfig tree, prefixing template field references.
 */
function scopeConditionConfig(
  config: ConditionConfig,
  repeatableId: string,
  itemKey: string,
  templateFieldIds: Set<string>
): ConditionConfig {
  // Scope the field reference if it belongs to the template
  const scopedField =
    config.field && templateFieldIds.has(config.field)
      ? `${repeatableId}[${itemKey}].${config.field}`
      : config.field;

  // Recursively scope nested conditions
  const scopedConditions = config.conditions?.map((nested) =>
    scopeConditionConfig(nested, repeatableId, itemKey, templateFieldIds)
  );

  return {
    ...config,
    field: scopedField,
    conditions: scopedConditions,
  };
}
