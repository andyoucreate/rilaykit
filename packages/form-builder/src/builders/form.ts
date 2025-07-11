import type {
  ConditionalConfig,
  FormConfiguration,
  FormFieldConfig,
  FormFieldRow,
  ValidationConfig,
} from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import {
  IdGenerator,
  ValidationErrorBuilder,
  deepClone,
  ensureUnique,
} from '@rilaykit/core/src/utils/builderHelpers';

/**
 * Configuration for a form field with type safety
 *
 * @template C - The component configuration map
 * @template T - The specific component type key
 *
 * @example
 * ```typescript
 * const fieldConfig: FieldConfig<MyComponents, 'text'> = {
 *   type: 'text',
 *   props: { placeholder: 'Enter your name' },
 *   validation: { required: true }
 * };
 * ```
 */
export type FieldConfig<C extends Record<string, any>, T extends keyof C> = {
  /** Unique identifier for the field. Auto-generated if not provided */
  id?: string;
  /** Component type from the registered components */
  type: T;
  /** Component-specific properties */
  props?: Partial<C[T]>;
  /** Validation rules for the field */
  validation?: ValidationConfig;
  /** Conditional display logic */
  conditional?: ConditionalConfig;
};

/**
 * Options for configuring row layout and appearance
 *
 * @example
 * ```typescript
 * const rowOptions: RowOptions = {
 *   spacing: 'loose',
 *   alignment: 'center'
 * };
 * ```
 */
interface RowOptions {
  /** Spacing between fields in the row */
  spacing?: 'tight' | 'normal' | 'loose';
  /** Vertical alignment of fields in the row */
  alignment?: 'start' | 'center' | 'end' | 'stretch';
}

/**
 * Form builder class for creating type-safe form configurations
 *
 * This class provides a fluent API for building forms with automatic validation,
 * type safety, and flexible layout options. It manages field registration,
 * row organization, and form configuration generation.
 *
 * @template C - Component configuration map defining available component types
 *
 * @example
 * ```typescript
 * // Create a form builder with typed components
 * const formBuilder = form.create(rilConfig, 'user-registration')
 *   .add({ type: 'text', props: { label: 'Name' } })
 *   .add(
 *     { type: 'email', props: { label: 'Email' } },
 *     { type: 'password', props: { label: 'Password' } }
 *   )
 *   .build();
 * ```
 *
 * @remarks
 * - Supports up to 3 fields per row for optimal layout
 * - Automatically generates unique IDs for fields and rows
 * - Provides comprehensive validation before building
 * - Maintains type safety throughout the building process
 */
export class form<C extends Record<string, any> = Record<string, never>> {
  /** The ril configuration instance containing component definitions */
  private config: ril<C>;
  /** Array of form rows containing field configurations */
  private rows: FormFieldRow[] = [];
  /** Unique identifier for this form */
  private formId: string;
  /** Generator for creating unique IDs */
  private idGenerator = new IdGenerator();

  /**
   * Creates a new form builder instance
   *
   * @param config - The ril configuration containing component definitions
   * @param formId - Optional unique identifier for the form. Auto-generated if not provided
   *
   * @example
   * ```typescript
   * const builder = new form(rilConfig, 'my-form');
   * ```
   */
  constructor(config: ril<C>, formId?: string) {
    this.config = config;
    this.formId = formId || `form-${Date.now()}`;
  }

  /**
   * Static factory method to create a new form builder
   *
   * @template Cm - Component configuration map
   * @param config - The ril configuration instance
   * @param formId - Optional form identifier
   * @returns A new form builder instance
   *
   * @example
   * ```typescript
   * const builder = form.create(rilConfig, 'registration-form');
   * ```
   */
  static create<Cm extends Record<string, any> = Record<string, never>>(
    config: ril<Cm>,
    formId?: string
  ): form<Cm> {
    return new form<Cm>(config, formId);
  }

  /**
   * Converts a FieldConfig to a FormFieldConfig with proper validation
   *
   * This internal method handles the transformation from the builder's field
   * configuration format to the final form field configuration, including
   * component lookup, prop merging, and ID generation.
   *
   * @template T - The component type
   * @param fieldConfig - The field configuration to convert
   * @returns A complete FormFieldConfig ready for use
   * @throws Error if the specified component type is not registered
   *
   * @internal
   */
  private createFormField<T extends keyof C & string>(
    fieldConfig: FieldConfig<C, T>
  ): FormFieldConfig {
    const component = this.config.getComponent(fieldConfig.type);

    if (!component) {
      throw new Error(`No component found with type "${fieldConfig.type}"`);
    }

    return {
      id: fieldConfig.id || this.idGenerator.next('field'),
      componentId: component.id,
      props: { ...component.defaultProps, ...fieldConfig.props },
      validation: fieldConfig.validation,
      conditional: fieldConfig.conditional,
    };
  }

  /**
   * Creates a form row with the specified fields and options
   *
   * This internal method handles row creation with validation of field limits,
   * proper spacing, and alignment configuration.
   *
   * @template T - The component type
   * @param fieldConfigs - Array of field configurations for the row
   * @param rowOptions - Optional row layout configuration
   * @returns A complete FormFieldRow configuration
   * @throws Error if no fields provided or more than 3 fields specified
   *
   * @internal
   */
  private createRow<T extends keyof C & string>(
    fieldConfigs: FieldConfig<C, T>[],
    rowOptions?: RowOptions
  ): FormFieldRow {
    if (fieldConfigs.length === 0) {
      throw new Error('At least one field is required');
    }

    if (fieldConfigs.length > 3) {
      throw new Error('Maximum 3 fields per row');
    }

    const fields = fieldConfigs.map((config) => this.createFormField(config));

    return {
      id: this.idGenerator.next('row'),
      fields,
      maxColumns: fieldConfigs.length,
      spacing: rowOptions?.spacing || 'normal',
      alignment: rowOptions?.alignment || 'stretch',
    };
  }

  /**
   * Universal method for adding fields to the form
   *
   * This is the primary method for adding fields to your form. It supports multiple
   * usage patterns for maximum flexibility:
   *
   * - Single field: Creates a new row with one field
   * - Multiple fields (≤3): Creates one row with all fields
   * - Multiple fields (>3): Creates separate rows for each field
   * - Array with options: Explicit control over row configuration
   *
   * @template T - The component type
   * @param fields - Field configurations (variadic or array)
   * @returns The form builder instance for method chaining
   * @throws Error if no fields provided or invalid configuration
   *
   * @example
   * ```typescript
   * // Single field on its own row
   * builder.add({ type: 'text', props: { label: 'Name' } });
   *
   * // Multiple fields on same row (max 3)
   * builder.add(
   *   { type: 'text', props: { label: 'First Name' } },
   *   { type: 'text', props: { label: 'Last Name' } }
   * );
   *
   * // Array syntax with row options
   * builder.add([
   *   { type: 'email', props: { label: 'Email' } },
   *   { type: 'phone', props: { label: 'Phone' } }
   * ], { spacing: 'loose', alignment: 'center' });
   * ```
   */
  add<T extends keyof C & string>(...fields: FieldConfig<C, T>[]): this;
  add<T extends keyof C & string>(fields: FieldConfig<C, T>[], rowOptions?: RowOptions): this;
  add<T extends keyof C & string>(
    ...args: FieldConfig<C, T>[] | [FieldConfig<C, T>[], RowOptions?]
  ): this {
    let fieldConfigs: FieldConfig<C, T>[];
    let rowOptions: RowOptions | undefined;
    let isExplicitArray = false;

    // Check if first argument is an array (explicit array syntax)
    if (args.length === 1 && Array.isArray(args[0])) {
      fieldConfigs = args[0];
      isExplicitArray = true;
    } else if (args.length === 2 && Array.isArray(args[0])) {
      fieldConfigs = args[0];
      rowOptions = args[1] as RowOptions;
      isExplicitArray = true;
    } else {
      // Variadic arguments - all arguments should be field configs
      fieldConfigs = args as FieldConfig<C, T>[];
    }

    if (fieldConfigs.length === 0) {
      throw new Error('At least one field is required');
    }

    // If explicit array syntax with more than 3 fields, throw error
    if (isExplicitArray && fieldConfigs.length > 3) {
      throw new Error('Maximum 3 fields per row');
    }

    // If only one field, create its own row
    if (fieldConfigs.length === 1) {
      const row = this.createRow(fieldConfigs, rowOptions);
      this.rows.push(row);
      return this;
    }

    // If multiple fields and they fit in one row (≤3), put them together
    if (fieldConfigs.length <= 3) {
      const row = this.createRow(fieldConfigs, rowOptions);
      this.rows.push(row);
      return this;
    }

    // If more than 3 fields (variadic only), create separate rows for each
    for (const config of fieldConfigs) {
      const row = this.createRow([config], rowOptions);
      this.rows.push(row);
    }

    return this;
  }

  /**
   * Adds multiple fields on separate rows
   *
   * This method is useful when you want to ensure each field gets its own row,
   * regardless of the number of fields. It's an alternative to the add() method
   * when you need explicit control over row separation.
   *
   * @template T - The component type
   * @param fieldConfigs - Array of field configurations
   * @param rowOptions - Optional row layout configuration applied to all rows
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * // Each field will be on its own row
   * builder.addSeparateRows([
   *   { type: 'text', props: { label: 'Field 1' } },
   *   { type: 'text', props: { label: 'Field 2' } },
   *   { type: 'text', props: { label: 'Field 3' } }
   * ], { spacing: 'loose' });
   * ```
   */
  addSeparateRows<T extends keyof C & string>(
    fieldConfigs: FieldConfig<C, T>[],
    rowOptions?: RowOptions
  ): this {
    for (const config of fieldConfigs) {
      // Use array syntax to ensure we're using the correct overload
      this.add([config], rowOptions);
    }
    return this;
  }

  /**
   * Sets the form identifier
   *
   * @param id - The new form identifier
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.setId('user-profile-form');
   * ```
   */
  setId(id: string): this {
    this.formId = id;
    return this;
  }

  /**
   * Updates an existing field's configuration
   *
   * This method allows you to modify field properties, validation rules,
   * or conditional logic after the field has been added to the form.
   *
   * @param fieldId - The unique identifier of the field to update
   * @param updates - Partial field configuration with updates to apply
   * @returns The form builder instance for method chaining
   * @throws Error if the field with the specified ID is not found
   *
   * @example
   * ```typescript
   * builder.updateField('email-field', {
   *   props: { placeholder: 'Enter your email address' },
   *   validation: { required: true, email: true }
   * });
   * ```
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
   * Finds a field by its unique identifier
   *
   * This internal method searches through all rows to locate a field
   * with the specified ID.
   *
   * @param fieldId - The field identifier to search for
   * @returns The field configuration if found, null otherwise
   *
   * @internal
   */
  private findField(fieldId: string): FormFieldConfig | null {
    for (const row of this.rows) {
      const field = row.fields.find((f) => f.id === fieldId);
      if (field) return field;
    }
    return null;
  }

  /**
   * Removes a field from the form
   *
   * This method removes the specified field and cleans up any empty rows
   * that result from the removal. The form structure is automatically
   * reorganized to maintain consistency.
   *
   * @param fieldId - The unique identifier of the field to remove
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.removeField('unwanted-field-id');
   * ```
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
   * Retrieves a field configuration by its ID
   *
   * @param fieldId - The unique identifier of the field
   * @returns The field configuration if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const emailField = builder.getField('email-field');
   * if (emailField) {
   *   console.log('Email field props:', emailField.props);
   * }
   * ```
   */
  getField(fieldId: string): FormFieldConfig | undefined {
    return this.findField(fieldId) || undefined;
  }

  /**
   * Gets all fields as a flat array
   *
   * This method flattens the row structure to provide a simple array
   * of all field configurations in the form, maintaining their order.
   *
   * @returns Array of all field configurations in the form
   *
   * @example
   * ```typescript
   * const allFields = builder.getFields();
   * console.log(`Form has ${allFields.length} fields`);
   * ```
   */
  getFields(): FormFieldConfig[] {
    return this.rows.flatMap((row) => row.fields);
  }

  /**
   * Gets all rows in the form
   *
   * Returns a copy of the internal rows array to prevent external
   * modification while allowing inspection of the form structure.
   *
   * @returns Array of all form rows
   *
   * @example
   * ```typescript
   * const rows = builder.getRows();
   * console.log(`Form has ${rows.length} rows`);
   * ```
   */
  getRows(): FormFieldRow[] {
    return [...this.rows];
  }

  /**
   * Clears all fields and rows from the form
   *
   * This method resets the form to an empty state and resets the ID generator
   * to ensure clean ID generation for subsequent fields.
   *
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.clear().add({ type: 'text', props: { label: 'New start' } });
   * ```
   */
  clear(): this {
    this.rows = [];
    this.idGenerator.reset();
    return this;
  }

  /**
   * Creates a deep copy of the current form builder
   *
   * This method creates a completely independent copy of the form builder,
   * including all field configurations and internal state. The cloned
   * builder can be modified without affecting the original.
   *
   * @param newFormId - Optional new form ID for the clone
   * @returns A new form builder instance with copied configuration
   *
   * @example
   * ```typescript
   * const originalForm = builder.clone();
   * const modifiedForm = builder.clone('modified-form')
   *   .add({ type: 'text', props: { label: 'Additional field' } });
   * ```
   */
  clone(newFormId?: string): form<C> {
    const cloned = new form<C>(this.config, newFormId || `${this.formId}-clone`);
    cloned.rows = deepClone(this.rows);
    return cloned;
  }

  /**
   * Validates the current form configuration
   *
   * This method performs comprehensive validation of the form structure,
   * checking for common issues like duplicate IDs, missing components,
   * and invalid row configurations.
   *
   * @returns Array of validation error messages (empty if valid)
   *
   * @example
   * ```typescript
   * const errors = builder.validate();
   * if (errors.length > 0) {
   *   console.error('Form validation failed:', errors);
   * }
   * ```
   *
   * @remarks
   * Validation checks include:
   * - Duplicate field IDs across the form
   * - Missing component definitions for referenced types
   * - Row constraints (max 3 fields, no empty rows)
   */
  validate(): string[] {
    const errorBuilder = new ValidationErrorBuilder();
    const allFields = this.getFields();

    // Check for duplicate field IDs using shared utility
    const fieldIds = allFields.map((field) => field.id);
    try {
      ensureUnique(fieldIds, 'field');
    } catch (error) {
      errorBuilder.add(
        'DUPLICATE_FIELD_IDS',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Check that all referenced components exist
    for (const field of allFields) {
      errorBuilder.addIf(
        !this.config.hasComponent(field.componentId),
        'MISSING_COMPONENT',
        `Component "${field.componentId}" not found for field "${field.id}"`
      );
    }

    // Check row constraints
    for (const row of this.rows) {
      errorBuilder.addIf(
        row.fields.length > 3,
        'TOO_MANY_FIELDS_IN_ROW',
        `Row "${row.id}" has ${row.fields.length} fields, maximum is 3`
      );

      errorBuilder.addIf(row.fields.length === 0, 'EMPTY_ROW', `Row "${row.id}" is empty`);
    }

    return errorBuilder.build().map((err) => err.message);
  }

  /**
   * Builds the final form configuration
   *
   * This method performs final validation and creates the complete form
   * configuration object ready for rendering. It includes all field
   * configurations, render settings, and metadata.
   *
   * @returns Complete form configuration ready for use
   * @throws Error if validation fails
   *
   * @example
   * ```typescript
   * try {
   *   const formConfig = builder.build();
   *   // Use formConfig with your form renderer
   * } catch (error) {
   *   console.error('Failed to build form:', error.message);
   * }
   * ```
   *
   * @remarks
   * The returned configuration includes:
   * - Form ID and metadata
   * - All rows with their field configurations
   * - Flattened array of all fields for easy access
   * - Component configuration reference
   * - Render configuration for customization
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
      config: this.config as ril,
      renderConfig: this.config.getFormRenderConfig(),
    };
  }

  /**
   * Exports the form configuration as JSON
   *
   * This method serializes the form configuration to a plain JavaScript
   * object suitable for storage, transmission, or debugging.
   *
   * @returns Plain object representation of the form
   *
   * @example
   * ```typescript
   * const formJson = builder.toJSON();
   * localStorage.setItem('savedForm', JSON.stringify(formJson));
   * ```
   */
  toJSON(): any {
    return {
      id: this.formId,
      rows: this.rows,
    };
  }

  /**
   * Imports form configuration from JSON
   *
   * This method restores form state from a previously exported JSON
   * configuration. It's useful for loading saved forms or restoring
   * form state from external sources.
   *
   * @param json - The JSON object containing form configuration
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * const savedForm = JSON.parse(localStorage.getItem('savedForm'));
   * builder.fromJSON(savedForm);
   * ```
   *
   * @remarks
   * - Only imports basic form structure (ID and rows)
   * - Does not validate imported configuration
   * - Existing form content is replaced
   */
  fromJSON(json: any): this {
    if (json.id) this.formId = json.id;
    if (json.rows) {
      this.rows = json.rows;
    }
    return this;
  }

  /**
   * Gets comprehensive statistics about the form
   *
   * This method provides useful metrics about the form structure,
   * helpful for analytics, debugging, or UI display purposes.
   *
   * @returns Object containing form statistics
   *
   * @example
   * ```typescript
   * const stats = builder.getStats();
   * console.log(`Form has ${stats.totalFields} fields in ${stats.totalRows} rows`);
   * console.log(`Average fields per row: ${stats.averageFieldsPerRow.toFixed(1)}`);
   * ```
   *
   * @remarks
   * Statistics include:
   * - Total number of fields and rows
   * - Average fields per row
   * - Maximum and minimum fields in any row
   * - Useful for form complexity analysis
   */
  getStats() {
    const allFields = this.getFields();
    const fieldCounts = this.rows.map((row) => row.fields.length);

    return {
      /** Total number of fields across all rows */
      totalFields: allFields.length,
      /** Total number of rows in the form */
      totalRows: this.rows.length,
      /** Average number of fields per row */
      averageFieldsPerRow: this.rows.length > 0 ? allFields.length / this.rows.length : 0,
      /** Maximum number of fields in any single row */
      maxFieldsInRow: fieldCounts.length > 0 ? Math.max(...fieldCounts) : 0,
      /** Minimum number of fields in any single row */
      minFieldsInRow: fieldCounts.length > 0 ? Math.min(...fieldCounts) : 0,
    };
  }
}

/**
 * Factory function to create a form builder directly
 *
 * This is a convenience function that provides an alternative to using
 * the class constructor or static create method. It's particularly useful
 * for functional programming styles or when you prefer function calls
 * over class instantiation.
 *
 * @template C - Component configuration map
 * @param config - The ril configuration instance
 * @param formId - Optional form identifier
 * @returns A new form builder instance
 *
 * @example
 * ```typescript
 * const builder = createForm(rilConfig, 'contact-form')
 *   .add({ type: 'text', props: { label: 'Name' } })
 *   .add({ type: 'email', props: { label: 'Email' } });
 * ```
 */
export function createForm<C extends Record<string, any>>(
  config: ril<C>,
  formId?: string
): form<C> {
  return form.create<C>(config, formId);
}

/**
 * Module augmentation to add createForm method to ril instances
 *
 * This declaration extends the ril interface to include the createForm
 * method, allowing for a more integrated API experience.
 */
declare module '@rilaykit/core' {
  interface ril<C extends Record<string, any> = Record<string, never>> {
    /**
     * Creates a new form builder using this ril configuration
     *
     * @param formId - Optional form identifier
     * @returns A new form builder instance
     *
     * @example
     * ```typescript
     * const builder = rilConfig.createForm('my-form');
     * ```
     */
    form(formId?: string): form<C>;
  }
}

/**
 * Extend ril prototype with the createForm method
 *
 * This implementation adds the createForm method to all ril instances,
 * maintaining type safety and providing a convenient API for form creation.
 */
(ril as any).prototype.form = function (formId?: string) {
  return form.create(this, formId);
};
