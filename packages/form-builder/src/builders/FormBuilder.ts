import type {
  ConditionalConfig,
  FormConfiguration,
  FormFieldConfig,
  FormFieldRow,
  InputType,
  LayoutType,
  StreamlineConfig,
  ValidationConfig,
} from '@streamline/core';
/**
 * Form builder class for creating form configurations
 * Simplified API with matrix support
 */
export class FormBuilder {
  private config: StreamlineConfig;
  private rows: FormFieldRow[] = [];
  private schema: any = null;
  private formId: string;
  private rowCounter = 0;

  constructor(config: StreamlineConfig, formId?: string) {
    this.config = config;
    this.formId = formId || `form-${Date.now()}`;
  }

  /**
   * Add a single field (takes full width)
   * @param fieldId - Unique field identifier
   * @param componentSubType - Component subtype (e.g., 'text', 'email')
   * @param props - Props to pass to the component
   * @param options - Additional options
   * @returns FormBuilder instance for chaining
   */
  addField(
    fieldId: string,
    componentSubType: InputType | LayoutType,
    props: Record<string, any> = {},
    options?: {
      validation?: ValidationConfig;
      conditional?: ConditionalConfig;
    }
  ): this {
    return this.addRowFields([
      {
        fieldId,
        componentSubType,
        props,
        validation: options?.validation,
        conditional: options?.conditional,
      },
    ]);
  }

  /**
   * Add multiple fields on the same row (max 3 fields)
   * @param fieldConfigs - Array of field configurations for the row
   * @param rowOptions - Row configuration options
   * @returns FormBuilder instance for chaining
   */
  addRowFields(
    fieldConfigs: Array<{
      fieldId: string;
      componentSubType: InputType | LayoutType;
      props?: Record<string, any>;
      validation?: ValidationConfig;
      conditional?: ConditionalConfig;
    }>,
    rowOptions?: {
      spacing?: 'tight' | 'normal' | 'loose';
      alignment?: 'start' | 'center' | 'end' | 'stretch';
    }
  ): this {
    if (fieldConfigs.length === 0) {
      throw new Error('At least one field is required');
    }

    if (fieldConfigs.length > 3) {
      throw new Error('Maximum 3 fields per row');
    }

    // Create row
    const rowId = `row-${++this.rowCounter}`;
    const fields: FormFieldConfig[] = [];

    // Process each field
    for (const fieldConfig of fieldConfigs) {
      const components = this.config.getComponentsBySubType(fieldConfig.componentSubType);

      if (components.length === 0) {
        throw new Error(`No component found with subType "${fieldConfig.componentSubType}"`);
      }

      const component = components[0];

      const formFieldConfig: FormFieldConfig = {
        id: fieldConfig.fieldId,
        componentId: component.id,
        props: { ...component.defaultProps, ...fieldConfig.props },
        validation: fieldConfig.validation,
        conditional: fieldConfig.conditional,
      };

      fields.push(formFieldConfig);
    }

    // Create row
    const row: FormFieldRow = {
      id: rowId,
      fields,
      maxColumns: fieldConfigs.length,
      spacing: rowOptions?.spacing || 'normal',
      alignment: rowOptions?.alignment || 'stretch',
    };

    this.rows.push(row);
    return this;
  }

  /**
   * Add multiple fields, each on its own row
   * @param fieldConfigs - Array of field configurations
   * @returns FormBuilder instance for chaining
   */
  addFields(
    fieldConfigs: Array<{
      fieldId: string;
      componentSubType: InputType | LayoutType;
      props?: Record<string, any>;
      validation?: ValidationConfig;
      conditional?: ConditionalConfig;
    }>
  ): this {
    for (const fieldConfig of fieldConfigs) {
      this.addField(fieldConfig.fieldId, fieldConfig.componentSubType, fieldConfig.props, {
        validation: fieldConfig.validation,
        conditional: fieldConfig.conditional,
      });
    }
    return this;
  }

  /**
   * Set validation schema for the entire form
   * @param schema - Validation schema (Zod, Yup, or custom)
   * @returns FormBuilder instance for chaining
   */
  setSchema(schema: any): this {
    this.schema = schema;
    return this;
  }

  /**
   * Set form ID
   * @param id - Form identifier
   * @returns FormBuilder instance for chaining
   */
  setId(id: string): this {
    this.formId = id;
    return this;
  }

  /**
   * Update field configuration
   * @param fieldId - Field identifier
   * @param updates - Updates to apply
   * @returns FormBuilder instance for chaining
   */
  updateField(fieldId: string, updates: Partial<Omit<FormFieldConfig, 'id'>>): this {
    let fieldFound = false;

    for (const row of this.rows) {
      const fieldIndex = row.fields.findIndex((field) => field.id === fieldId);
      if (fieldIndex !== -1) {
        row.fields[fieldIndex] = {
          ...row.fields[fieldIndex],
          ...updates,
          props: {
            ...row.fields[fieldIndex].props,
            ...updates.props,
          },
        };
        fieldFound = true;
      }
    }

    if (!fieldFound) {
      throw new Error(`Field with ID "${fieldId}" not found`);
    }

    return this;
  }

  /**
   * Remove a field from the form
   * @param fieldId - Field identifier
   * @returns FormBuilder instance for chaining
   */
  removeField(fieldId: string): this {
    for (const row of this.rows) {
      const filteredFields = row.fields.filter((field) => field.id !== fieldId);
      // Create new row object with filtered fields since fields is readonly
      Object.assign(row, { fields: filteredFields });
    }

    // Supprimer les lignes vides
    this.rows = this.rows.filter((row) => row.fields.length > 0);

    return this;
  }

  /**
   * Get field configuration by ID
   * @param fieldId - Field identifier
   * @returns Field configuration or undefined
   */
  getField(fieldId: string): FormFieldConfig | undefined {
    for (const row of this.rows) {
      const field = row.fields.find((field) => field.id === fieldId);
      if (field) return field;
    }
    return undefined;
  }

  /**
   * Get all fields as a flat array
   * @returns Array of field configurations
   */
  getFields(): FormFieldConfig[] {
    return this.rows.flatMap((row) => row.fields);
  }

  /**
   * Get all rows
   * @returns Array of row configurations
   */
  getRows(): FormFieldRow[] {
    return [...this.rows];
  }

  /**
   * Clear all fields and rows
   * @returns FormBuilder instance for chaining
   */
  clear(): this {
    this.rows = [];
    this.rowCounter = 0;
    return this;
  }

  /**
   * Clone the current form builder
   * @param newFormId - ID for the cloned form
   * @returns New FormBuilder instance
   */
  clone(newFormId?: string): FormBuilder {
    const cloned = new FormBuilder(this.config, newFormId);
    cloned.rows = this.rows.map((row) => ({
      ...row,
      fields: row.fields.map((field) => ({ ...field })),
    }));
    cloned.schema = this.schema;
    cloned.rowCounter = this.rowCounter;
    return cloned;
  }

  /**
   * Validate the form configuration
   * @returns Array of validation errors
   */
  validate(): string[] {
    const errors: string[] = [];
    const allFields = this.getFields();

    // Check for duplicate field IDs
    const fieldIds = allFields.map((field) => field.id);
    const duplicateIds = fieldIds.filter((id, index) => fieldIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate field IDs: ${duplicateIds.join(', ')}`);
    }

    // Check that all referenced components exist
    for (const field of allFields) {
      if (!this.config.hasComponent(field.componentId)) {
        errors.push(`Component "${field.componentId}" not found for field "${field.id}"`);
      }
    }

    // Check row constraints
    for (const row of this.rows) {
      if (row.fields.length > 3) {
        errors.push(`Row "${row.id}" has ${row.fields.length} fields, maximum is 3`);
      }
      if (row.fields.length === 0) {
        errors.push(`Row "${row.id}" is empty`);
      }
    }

    return errors;
  }

  /**
   * Build the final form configuration with matrix support
   * @returns Complete form configuration with matrix structure
   */
  build(): FormConfiguration {
    const errors = this.validate();

    if (errors.length > 0) {
      throw new Error(`Form validation failed: ${errors.join(', ')}`);
    }

    return {
      id: this.formId,
      rows: [...this.rows],
      allFields: this.getFields(), // Liste plate pour compatibilité
      schema: this.schema,
      config: this.config,
      renderConfig: this.config.getRenderConfig(), // Inclure la configuration de rendu
    };
  }

  /**
   * Export form configuration as JSON
   * @returns JSON representation of the form
   */
  toJSON(): any {
    return {
      id: this.formId,
      rows: this.rows,
      schema: this.schema,
    };
  }

  /**
   * Import form configuration from JSON
   * @param json - JSON representation of the form
   * @returns FormBuilder instance for chaining
   */
  fromJSON(json: any): this {
    if (json.id) {
      this.formId = json.id;
    }

    if (json.rows) {
      this.rows = json.rows;
      // Update row counter
      this.rowCounter = this.rows.length;
    }

    if (json.schema) {
      this.schema = json.schema;
    }

    return this;
  }

  /**
   * Get form statistics
   * @returns Object with form statistics
   */
  getStats(): {
    totalFields: number;
    totalRows: number;
    averageFieldsPerRow: number;
    maxFieldsInRow: number;
    minFieldsInRow: number;
  } {
    const allFields = this.getFields();
    const fieldCounts = this.rows.map((row) => row.fields.length);

    return {
      totalFields: allFields.length,
      totalRows: this.rows.length,
      averageFieldsPerRow: this.rows.length > 0 ? allFields.length / this.rows.length : 0,
      maxFieldsInRow: fieldCounts.length > 0 ? Math.max(...fieldCounts) : 0,
      minFieldsInRow: fieldCounts.length > 0 ? Math.min(...fieldCounts) : 0,
    };
  }
}
