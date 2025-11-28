import type { ComponentConfig, FormFieldConfig, FormFieldRow } from '@rilaykit/core';
import type { form } from '@rilaykit/forms';
import type { PaletteCategory, PaletteComponent } from '../types';

/**
 * Generates a unique ID with optional prefix
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique identifier string
 */
export const generateId = (prefix = 'item'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Creates palette components from RilayKit component configuration
 *
 * This function automatically discovers all components from a ril instance
 * and organizes them into categories for the builder palette. It respects
 * builder metadata when available, providing intelligent defaults otherwise.
 *
 * @param components - Array of component configurations from ril.getAllComponents()
 * @returns Array of palette components organized by category
 *
 * @example
 * ```typescript
 * const rilConfig = ril.create()
 *   .addComponent('text', {
 *     name: 'Text Input',
 *     renderer: TextInput,
 *     builder: {
 *       category: 'Inputs',
 *       icon: 'text',
 *       editableProps: [
 *         { key: 'label', label: 'Label', editorType: 'text' },
 *         { key: 'placeholder', label: 'Placeholder', editorType: 'text' }
 *       ]
 *     }
 *   });
 *
 * const palette = createPaletteFromComponents(rilConfig.getAllComponents());
 * ```
 */
export const createPaletteFromComponents = (components: ComponentConfig[]): PaletteCategory[] => {
  const categories = new Map<string, PaletteComponent[]>();

  for (const config of components) {
    // Skip components marked as hidden in builder metadata
    if (config.builder?.hidden) {
      continue;
    }

    // Use builder metadata category or default to 'General'
    const categoryName = config.builder?.category || 'General';

    if (!categories.has(categoryName)) {
      categories.set(categoryName, []);
    }

    const paletteComponent: PaletteComponent = {
      id: config.id,
      type: config.type,
      name: config.name,
      description: config.description,
      icon: config.builder?.icon,
      category: categoryName,
      config,
      preview: config.builder?.preview,
      tags: config.builder?.tags,
    };

    categories.get(categoryName)?.push(paletteComponent);
  }

  // Convert map to array of categories, sorted alphabetically
  const sortedCategories = Array.from(categories.entries())
    .sort(([a], [b]) => {
      // 'General' always first
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    })
    .map(([name, components]) => ({
      id: generateId('category'),
      name,
      components: components.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return sortedCategories;
};

/**
 * Gets editable properties for a component from builder metadata
 *
 * @param componentConfig - Component configuration
 * @returns Array of property editor definitions
 *
 * @example
 * ```typescript
 * const editableProps = getEditablePropsForComponent(config);
 * // Returns editable properties defined in config.builder.editableProps
 * ```
 */
export const getEditablePropsForComponent = (
  componentConfig: ComponentConfig
): Array<{
  key: string;
  label: string;
  editorType: string;
  helpText?: string;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>;
  group?: string;
  required?: boolean;
  placeholder?: string;
}> => {
  if (!componentConfig.builder?.editableProps) {
    // If no builder metadata, create basic editors for defaultProps
    if (!componentConfig.defaultProps) {
      return [];
    }

    return Object.keys(componentConfig.defaultProps).map((key) => ({
      key,
      label: getComponentLabel(key),
      editorType: inferEditorType(componentConfig.defaultProps?.[key]),
      defaultValue: componentConfig.defaultProps?.[key],
    }));
  }

  return componentConfig.builder.editableProps;
};

/**
 * Infers editor type from a value
 *
 * @param value - Value to infer editor type from
 * @returns Editor type string
 */
const inferEditorType = (value: any): string => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (value.length > 50) return 'textarea';
    return 'text';
  }
  if (Array.isArray(value)) return 'json';
  if (typeof value === 'object') return 'json';
  return 'text';
};

/**
 * Finds a field in a form builder by field ID
 *
 * @param formBuilder - Form builder instance
 * @param fieldId - Field identifier to find
 * @returns Field configuration if found, undefined otherwise
 */
export const findFieldInBuilder = (
  formBuilder: form<any>,
  fieldId: string
): FormFieldConfig | undefined => {
  return formBuilder.getField(fieldId);
};

/**
 * Finds a row in a form builder by row ID
 *
 * @param formBuilder - Form builder instance
 * @param rowId - Row identifier to find
 * @returns Row configuration if found, undefined otherwise
 */
export const findRowInBuilder = (
  formBuilder: form<any>,
  rowId: string
): FormFieldRow | undefined => {
  const rows = formBuilder.getRows();
  return rows.find((row) => row.id === rowId);
};

/**
 * Gets the row index containing a specific field
 *
 * @param formBuilder - Form builder instance
 * @param fieldId - Field identifier
 * @returns Row index if found, -1 otherwise
 */
export const getRowIndexByFieldId = (formBuilder: form<any>, fieldId: string): number => {
  const rows = formBuilder.getRows();
  return rows.findIndex((row) => row.fields.some((field) => field.id === fieldId));
};

/**
 * Gets the row ID containing a specific field
 *
 * @param formBuilder - Form builder instance
 * @param fieldId - Field identifier
 * @returns Row ID if found, undefined otherwise
 */
export const getRowIdByFieldId = (formBuilder: form<any>, fieldId: string): string | undefined => {
  const rows = formBuilder.getRows();
  const row = rows.find((row) => row.fields.some((field) => field.id === fieldId));
  return row?.id;
};

/**
 * Checks if a row can accept more fields (max 3 per row)
 *
 * @param row - Row configuration
 * @returns True if row can accept more fields
 */
export const canRowAcceptField = (row: FormFieldRow): boolean => {
  return row.fields.length < 3;
};

/**
 * Creates default props for a component type
 *
 * @param componentConfig - Component configuration
 * @returns Default props object
 */
export const createDefaultPropsForComponent = (
  componentConfig: ComponentConfig
): Record<string, any> => {
  return {
    ...componentConfig.defaultProps,
  };
};

/**
 * Validates if a field can be moved to a specific row
 *
 * @param formBuilder - Form builder instance
 * @param fieldId - Field to move
 * @param targetRowId - Target row ID
 * @returns Validation result with error message if invalid
 */
export const validateFieldMove = (
  formBuilder: form<any>,
  fieldId: string,
  targetRowId: string
): { valid: boolean; error?: string } => {
  const field = findFieldInBuilder(formBuilder, fieldId);
  if (!field) {
    return { valid: false, error: 'Field not found' };
  }

  const targetRow = findRowInBuilder(formBuilder, targetRowId);
  if (!targetRow) {
    return { valid: false, error: 'Target row not found' };
  }

  // Check if field is already in target row
  const isInTargetRow = targetRow.fields.some((f) => f.id === fieldId);
  if (isInTargetRow) {
    return { valid: true }; // Allow reordering within same row
  }

  // Check if target row has space
  if (!canRowAcceptField(targetRow)) {
    return { valid: false, error: 'Target row is full (max 3 fields per row)' };
  }

  return { valid: true };
};

/**
 * Calculates statistics for a form builder
 *
 * @param formBuilder - Form builder instance
 * @returns Statistics object
 */
export const getBuilderStats = (formBuilder: form<any>) => {
  const stats = formBuilder.getStats();
  const rows = formBuilder.getRows();

  return {
    ...stats,
    emptyRows: rows.filter((row) => row.fields.length === 0).length,
    fullRows: rows.filter((row) => row.fields.length === 3).length,
    hasValidation: formBuilder.getFields().some((field) => field.validation !== undefined),
  };
};

/**
 * Sanitizes a name to create a valid ID
 *
 * @param name - Name to sanitize
 * @returns Sanitized ID
 *
 * @example
 * ```typescript
 * sanitizeNameToId('My Form Name!') // => 'my-form-name'
 * ```
 */
export const sanitizeNameToId = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Deep clones an object (simple implementation for form configs)
 *
 * @param obj - Object to clone
 * @returns Cloned object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Checks if two field configurations are equal
 *
 * @param field1 - First field configuration
 * @param field2 - Second field configuration
 * @returns True if configurations are equal
 */
export const areFieldsEqual = (field1: FormFieldConfig, field2: FormFieldConfig): boolean => {
  return JSON.stringify(field1) === JSON.stringify(field2);
};

/**
 * Gets a human-readable label for a component type
 *
 * @param componentType - Component type identifier
 * @returns Human-readable label
 */
export const getComponentLabel = (componentType: string): string => {
  // Convert kebab-case or camelCase to Title Case
  return componentType
    .replace(/[-_]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
};
