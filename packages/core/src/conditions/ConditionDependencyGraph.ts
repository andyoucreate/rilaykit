import type { ConditionalBehavior } from '../types';
import { extractConditionDependencies } from './index';

/**
 * A graph that tracks which fields depend on which other fields for condition evaluation.
 *
 * This enables efficient re-evaluation of conditions when values change:
 * instead of re-evaluating ALL conditions when ANY value changes,
 * we only re-evaluate conditions that depend on the changed value.
 *
 * @example
 * ```ts
 * const graph = new ConditionDependencyGraph();
 *
 * // Add field with its conditions
 * graph.addField('dependentField', {
 *   visible: when('triggerField').equals('show')
 * });
 *
 * // When 'triggerField' changes, get affected fields
 * const affected = graph.getAffectedFields('triggerField');
 * // affected = ['dependentField']
 * ```
 */
export class ConditionDependencyGraph {
  /**
   * Maps field IDs to their dependencies (fields they depend on)
   * fieldId -> Set of field paths it depends on
   */
  private readonly fieldDependencies: Map<string, Set<string>> = new Map();

  /**
   * Reverse index: maps a field path to all fields that depend on it
   * fieldPath -> Set of field IDs that have conditions depending on this path
   */
  private readonly reverseDependencies: Map<string, Set<string>> = new Map();

  /**
   * Adds a field with its conditional behavior to the graph.
   *
   * @param fieldId - The ID of the field
   * @param conditions - The field's conditional behavior (visible, disabled, required, readonly)
   */
  addField(fieldId: string, conditions?: ConditionalBehavior): void {
    if (!conditions) {
      this.fieldDependencies.set(fieldId, new Set());
      return;
    }

    const dependencies = new Set<string>();

    // Extract dependencies from all condition types
    if (conditions.visible) {
      for (const dep of extractConditionDependencies(conditions.visible)) {
        dependencies.add(dep);
      }
    }
    if (conditions.disabled) {
      for (const dep of extractConditionDependencies(conditions.disabled)) {
        dependencies.add(dep);
      }
    }
    if (conditions.required) {
      for (const dep of extractConditionDependencies(conditions.required)) {
        dependencies.add(dep);
      }
    }
    if (conditions.readonly) {
      for (const dep of extractConditionDependencies(conditions.readonly)) {
        dependencies.add(dep);
      }
    }

    // Store forward dependencies
    this.fieldDependencies.set(fieldId, dependencies);

    // Build reverse index
    for (const dep of dependencies) {
      if (!this.reverseDependencies.has(dep)) {
        this.reverseDependencies.set(dep, new Set());
      }
      this.reverseDependencies.get(dep)!.add(fieldId);
    }
  }

  /**
   * Removes a field from the graph.
   *
   * @param fieldId - The ID of the field to remove
   */
  removeField(fieldId: string): void {
    const dependencies = this.fieldDependencies.get(fieldId);

    if (dependencies) {
      // Remove from reverse index
      for (const dep of dependencies) {
        const reverseSet = this.reverseDependencies.get(dep);
        if (reverseSet) {
          reverseSet.delete(fieldId);
          if (reverseSet.size === 0) {
            this.reverseDependencies.delete(dep);
          }
        }
      }
    }

    this.fieldDependencies.delete(fieldId);
  }

  /**
   * Gets all field IDs that have conditions depending on a specific field path.
   *
   * When a value at `changedPath` changes, these are the fields whose
   * conditions need to be re-evaluated.
   *
   * @param changedPath - The field path that changed
   * @returns Array of field IDs that depend on this path
   */
  getAffectedFields(changedPath: string): string[] {
    const affected = this.reverseDependencies.get(changedPath);
    return affected ? Array.from(affected) : [];
  }

  /**
   * Gets all field IDs affected by changes to multiple paths.
   *
   * @param changedPaths - Array of field paths that changed
   * @returns Array of unique field IDs that depend on any of these paths
   */
  getAffectedFieldsMultiple(changedPaths: string[]): string[] {
    const affected = new Set<string>();

    for (const path of changedPaths) {
      const deps = this.reverseDependencies.get(path);
      if (deps) {
        for (const fieldId of deps) {
          affected.add(fieldId);
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Gets the dependencies for a specific field.
   *
   * @param fieldId - The ID of the field
   * @returns Array of field paths this field depends on
   */
  getDependencies(fieldId: string): string[] {
    const deps = this.fieldDependencies.get(fieldId);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Checks if a field has any dependencies.
   *
   * @param fieldId - The ID of the field
   * @returns True if the field has conditional dependencies
   */
  hasDependencies(fieldId: string): boolean {
    const deps = this.fieldDependencies.get(fieldId);
    return deps !== undefined && deps.size > 0;
  }

  /**
   * Gets all fields in the graph.
   *
   * @returns Array of all field IDs
   */
  getAllFields(): string[] {
    return Array.from(this.fieldDependencies.keys());
  }

  /**
   * Gets all unique dependency paths in the graph.
   *
   * @returns Array of all field paths that are dependencies
   */
  getAllDependencyPaths(): string[] {
    return Array.from(this.reverseDependencies.keys());
  }

  /**
   * Clears the entire graph.
   */
  clear(): void {
    this.fieldDependencies.clear();
    this.reverseDependencies.clear();
  }

  /**
   * Gets the size of the graph (number of fields).
   */
  get size(): number {
    return this.fieldDependencies.size;
  }

  /**
   * Creates a debug representation of the graph.
   * Useful for development and testing.
   */
  toDebugObject(): {
    fields: Record<string, string[]>;
    reverseDeps: Record<string, string[]>;
  } {
    const fields: Record<string, string[]> = {};
    const reverseDeps: Record<string, string[]> = {};

    for (const [fieldId, deps] of this.fieldDependencies) {
      fields[fieldId] = Array.from(deps);
    }

    for (const [path, fieldIds] of this.reverseDependencies) {
      reverseDeps[path] = Array.from(fieldIds);
    }

    return { fields, reverseDeps };
  }
}
