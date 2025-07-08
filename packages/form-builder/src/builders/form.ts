import type {
  ConditionalConfig,
  FormConfiguration,
  FormFieldConfig,
  FormFieldRow,
  ValidationConfig,
  ril,
} from '@rilaykit/core';

// Field configuration interface for better type safety
interface FieldConfig {
  fieldId: string;
  componentType: string;
  props?: Record<string, any>;
  validation?: ValidationConfig;
  conditional?: ConditionalConfig;
}

// Row options interface
interface RowOptions {
  spacing?: 'tight' | 'normal' | 'loose';
  alignment?: 'start' | 'center' | 'end' | 'stretch';
}

/**
 * Form builder class for creating form configurations
 * Simplified API with matrix support
 */
export class form {
  private config: ril;
  private rows: FormFieldRow[] = [];
  private formId: string;
  private rowCounter = 0;

  constructor(config: ril, formId?: string) {
    this.config = config;
    this.formId = formId || `form-${Date.now()}`;
  }

  static create(config: ril, formId?: string): form {
    return new form(config, formId);
  }

  /**
   * Helper method to create a FormFieldConfig from a FieldConfig
   */
  private createFormField(fieldConfig: FieldConfig): FormFieldConfig {
    const component = this.config.getComponent(fieldConfig.componentType);

    if (!component) {
      throw new Error(`No component found with type "${fieldConfig.componentType}"`);
    }

    return {
      id: fieldConfig.fieldId,
      componentId: component.id,
      props: { ...component.defaultProps, ...fieldConfig.props },
      validation: fieldConfig.validation,
      conditional: fieldConfig.conditional,
    };
  }

  /**
   * Helper method to create a row with validation
   */
  private createRow(fieldConfigs: FieldConfig[], rowOptions?: RowOptions): FormFieldRow {
    if (fieldConfigs.length === 0) {
      throw new Error('At least one field is required');
    }

    if (fieldConfigs.length > 3) {
      throw new Error('Maximum 3 fields per row');
    }

    const fields = fieldConfigs.map((config) => this.createFormField(config));

    return {
      id: `row-${++this.rowCounter}`,
      fields,
      maxColumns: fieldConfigs.length,
      spacing: rowOptions?.spacing || 'normal',
      alignment: rowOptions?.alignment || 'stretch',
    };
  }

  /**
   * Add a single field (takes full width)
   */
  addField(
    fieldId: string,
    componentType: string,
    props: Record<string, any> = {},
    options?: {
      validation?: ValidationConfig;
      conditional?: ConditionalConfig;
    }
  ): this {
    return this.addRowFields([
      {
        fieldId,
        componentType,
        props,
        validation: options?.validation,
        conditional: options?.conditional,
      },
    ]);
  }

  /**
   * Add multiple fields on the same row (max 3 fields)
   */
  addRowFields(fieldConfigs: FieldConfig[], rowOptions?: RowOptions): this {
    const row = this.createRow(fieldConfigs, rowOptions);
    this.rows.push(row);
    return this;
  }

  /**
   * Add multiple fields, each on its own row
   */
  addFields(fieldConfigs: FieldConfig[]): this {
    for (const config of fieldConfigs) {
      this.addField(config.fieldId, config.componentType, config.props, {
        validation: config.validation,
        conditional: config.conditional,
      });
    }
    return this;
  }

  /**
   * Set form ID
   */
  setId(id: string): this {
    this.formId = id;
    return this;
  }

  /**
   * Update field configuration
   */
  updateField(fieldId: string, updates: Partial<Omit<FormFieldConfig, 'id'>>): this {
    const field = this.findField(fieldId);
    if (!field) {
      throw new Error(`Field with ID "${fieldId}" not found`);
    }

    Object.assign(field, {
      ...updates,
      props: { ...field.props, ...updates.props },
    });

    return this;
  }

  /**
   * Helper method to find a field by ID
   */
  private findField(fieldId: string): FormFieldConfig | null {
    for (const row of this.rows) {
      const field = row.fields.find((f) => f.id === fieldId);
      if (field) return field;
    }
    return null;
  }

  /**
   * Remove a field from the form
   */
  removeField(fieldId: string): this {
    this.rows = this.rows
      .map((row) => ({
        ...row,
        fields: row.fields.filter((field) => field.id !== fieldId),
      }))
      .filter((row) => row.fields.length > 0);

    return this;
  }

  /**
   * Get field configuration by ID
   */
  getField(fieldId: string): FormFieldConfig | undefined {
    return this.findField(fieldId) || undefined;
  }

  /**
   * Get all fields as a flat array
   */
  getFields(): FormFieldConfig[] {
    return this.rows.flatMap((row) => row.fields);
  }

  /**
   * Get all rows
   */
  getRows(): FormFieldRow[] {
    return [...this.rows];
  }

  /**
   * Clear all fields and rows
   */
  clear(): this {
    this.rows = [];
    this.rowCounter = 0;
    return this;
  }

  /**
   * Clone the current form builder
   */
  clone(newFormId?: string): form {
    const cloned = new form(this.config, newFormId || `${this.formId}-clone`);
    cloned.rows = this.rows.map((row) => ({
      ...row,
      fields: row.fields.map((field) => ({ ...field })),
    }));
    cloned.rowCounter = this.rowCounter;
    return cloned;
  }

  /**
   * Validate the form configuration
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
   */
  build(): FormConfiguration {
    const errors = this.validate();

    if (errors.length > 0) {
      throw new Error(`Form validation failed: ${errors.join(', ')}`);
    }

    return {
      id: this.formId,
      rows: [...this.rows],
      allFields: this.getFields(),
      config: this.config,
      renderConfig: this.config.getFormRenderConfig(),
    };
  }

  /**
   * Export form configuration as JSON
   */
  toJSON(): any {
    return {
      id: this.formId,
      rows: this.rows,
    };
  }

  /**
   * Import form configuration from JSON
   */
  fromJSON(json: any): this {
    if (json.id) this.formId = json.id;
    if (json.rows) {
      this.rows = json.rows;
      this.rowCounter = this.rows.length;
    }
    return this;
  }

  /**
   * Get form statistics
   */
  getStats() {
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
