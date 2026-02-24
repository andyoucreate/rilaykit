import {
  type ConditionalBehavior,
  type FieldValidationConfig,
  type FormConfiguration,
  type FormFieldConfig,
  type FormFieldRow,
  type FormRepeatableRow,
  type FormRowEntry,
  type FormValidationConfig,
  IdGenerator,
  type RepeatableFieldConfig,
  type SubmitOptions,
  deepClone,
  ensureUnique,
  type ril,
} from '@rilaykit/core';
import { RepeatableBuilder } from './repeatable-builder';

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
 *   validation: {
 *     validators: [required(), minLength(2)],
 *     validateOnChange: true,
 *     validateOnBlur: true
 *   }
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
  /** Validation configuration for this field */
  validation?: FieldValidationConfig;
  /** Conditional behavior configuration for this field */
  conditions?: ConditionalBehavior;
};

/**
 * Form builder for creating type-safe form configurations
 *
 * DX Notes (How to create a form):
 * - Recommended: use the static factory
 *
 *   const rilConfig = ril
 *     .create()
 *     .addComponent('text', { name: 'Text', renderer: TextInput })
 *     .addComponent('email', { name: 'Email', renderer: EmailInput });
 *
 *   const myForm = form
 *     .create(rilConfig, 'contact-form')
 *     .add({ id: 'firstName', type: 'text', props: { label: 'First name' } })
 *     .add(
 *       { id: 'email', type: 'email', props: { label: 'Email' } },
 *       { id: 'role', type: 'text', props: { label: 'Role' } }
 *     )
 *     .build();
 *
 * - Or instantiate directly:
 *
 *   const myForm = new form(rilConfig, 'contact-form')
 *     .add({ id: 'firstName', type: 'text' })
 *     .build();
 *
 * Why we do not augment ril with .form():
 * - Keep the API explicit and bundler-friendly (no prototype/module augmentation)
 * - Better discoverability and IntelliSense via the builder class
 *
 * Typing & autocomplete:
 * - Types flow from your ril configuration: once components are registered,
 *   the `type` and `props` of `.add({ ... })` are fully typed.
 *
 * Adding fields:
 * - Variadic: .add(fieldA, fieldB) => same row (max 3 per row)
 * - Array:    .add([fieldA, fieldB]) => explicit single row
 * - >3 fields (variadic) => split across multiple rows automatically
 *
 * Output of .build(): FormConfiguration<C>
 * - id, rows, allFields, renderConfig (from ril), optional validation
 */
export class form<C extends Record<string, any> = Record<string, never>> {
  /** The ril configuration instance containing component definitions */
  private config: ril<C>;
  /** Array of form rows containing field configurations */
  private rows: FormRowEntry[] = [];
  /** Unique identifier for this form */
  private formId: string;
  /** Generator for creating unique IDs */
  private idGenerator = new IdGenerator();
  /** Form-level validation configuration */
  private formValidation?: FormValidationConfig;
  /** Default submit options for this form */
  private _submitOptions?: SubmitOptions;

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
    this.formId = formId || `form-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Static factory to create a new form builder
   *
   * Usage (recommended):
   *
   * const myForm = form
   *   .create(rilConfig, 'my-form')
   *   .add({ id: 'email', type: 'email', props: { label: 'Email' } })
   *   .build();
   *
   * Why prefer this over `new form(...)`?
   * - Clearer intent and better discoverability
   * - Consistent with other builder APIs
   */
  static create<Cm extends Record<string, any> = Record<string, never>>(
    config: ril<Cm>,
    formId?: string
  ): form<Cm> {
    return new form<Cm>(config, formId);
  }

  /**
   * Converts a FieldConfig to a FormFieldConfig
   *
   * This internal method handles the transformation from the builder's field
   * configuration format to the final form field configuration, including
   * component lookup, prop merging, ID generation, and validation setup.
   *
   * The validation system combines component-level validation (defined in the component config)
   * with field-level validation (defined in the field config). Component validators are
   * applied first, followed by field validators.
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

    // Combine component validation with field validation
    let combinedValidation: FieldValidationConfig | undefined;

    if (component.validation || fieldConfig.validation) {
      combinedValidation = {
        // Merge validation settings, field settings take precedence
        validateOnChange:
          fieldConfig.validation?.validateOnChange ?? component.validation?.validateOnChange,
        validateOnBlur:
          fieldConfig.validation?.validateOnBlur ?? component.validation?.validateOnBlur,
        debounceMs: fieldConfig.validation?.debounceMs ?? component.validation?.debounceMs,

        // Combine validation rules: merge component and field validation
        validate: (() => {
          const componentValidation = component.validation?.validate;
          const fieldValidation = fieldConfig.validation?.validate;

          // If only one has validation, use it
          if (!componentValidation) return fieldValidation;
          if (!fieldValidation) return componentValidation;

          // If both have validation, combine them into array
          const componentArray = Array.isArray(componentValidation)
            ? componentValidation
            : [componentValidation];
          const fieldArray = Array.isArray(fieldValidation) ? fieldValidation : [fieldValidation];

          return [...componentArray, ...fieldArray];
        })(),
      };
    }

    return {
      id: fieldConfig.id || this.idGenerator.next('field'),
      componentId: component.id,
      props: { ...component.defaultProps, ...fieldConfig.props },
      validation: combinedValidation,
      conditions: fieldConfig.conditions,
    };
  }

  /**
   * Creates a form row with the specified fields and options
   *
   * This internal method handles row creation,
   * proper spacing, and alignment configuration.
   *
   * @template T - The component type
   * @param fieldConfigs - Array of field configurations for the row
   * @returns A complete FormFieldRow configuration
   * @throws Error if no fields provided or more than 3 fields specified
   *
   * @internal
   */
  private createRow<T extends keyof C & string>(fieldConfigs: FieldConfig<C, T>[]): FormFieldRow {
    if (fieldConfigs.length === 0) {
      throw new Error('At least one field is required');
    }

    if (fieldConfigs.length > 3) {
      throw new Error('Maximum 3 fields per row');
    }

    const fields = fieldConfigs.map((config) => this.createFormField(config));

    return {
      kind: 'fields' as const,
      id: this.idGenerator.next('row'),
      fields,
      maxColumns: fieldConfigs.length,
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
  add<T extends keyof C & string>(fields: FieldConfig<C, T>[]): this;
  add<T extends keyof C & string>(...args: FieldConfig<C, T>[] | [FieldConfig<C, T>[]]): this {
    let fieldConfigs: FieldConfig<C, T>[];
    let isExplicitArray = false;

    // Check if first argument is an array (explicit array syntax)
    if (args.length === 1 && Array.isArray(args[0])) {
      fieldConfigs = args[0];
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
      const row = this.createRow(fieldConfigs);
      this.rows.push(row);
      return this;
    }

    // If multiple fields and they fit in one row (≤3), put them together
    if (fieldConfigs.length <= 3) {
      const row = this.createRow(fieldConfigs);
      this.rows.push(row);
      return this;
    }

    // If more than 3 fields (variadic only), create separate rows for each
    for (const config of fieldConfigs) {
      const row = this.createRow([config]);
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
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * // Each field will be on its own row
   * builder.addSeparateRows([
   *   { type: 'text', props: { label: 'Field 1' } },
   *   { type: 'text', props: { label: 'Field 2' } },
   *   { type: 'text', props: { label: 'Field 3' } }
   * ]);
   * ```
   */
  addSeparateRows<T extends keyof C & string>(fieldConfigs: FieldConfig<C, T>[]): this {
    for (const config of fieldConfigs) {
      // Use array syntax to ensure we're using the correct overload
      this.add(config);
    }
    return this;
  }

  /**
   * Adds a repeatable field group to the form
   *
   * Repeatable fields allow users to add/remove instances of a group of fields
   * at runtime (e.g., "Add another item", "Add another contact").
   *
   * @param id - Unique identifier for the repeatable group (cannot contain [ or ])
   * @param configure - Callback receiving a RepeatableBuilder for fluent configuration
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.addRepeatable("items", r => r
   *   .add(
   *     { id: "name", type: "text", props: { label: "Item" } },
   *     { id: "qty", type: "number", props: { label: "Qty" } }
   *   )
   *   .min(1)
   *   .max(10)
   *   .defaultValue({ name: "", qty: 1 })
   * );
   * ```
   */
  addRepeatable(
    id: string,
    configure: (builder: RepeatableBuilder<C>) => RepeatableBuilder<C>
  ): this {
    // Validate ID — brackets are reserved for composite keys
    if (id.includes('[') || id.includes(']')) {
      throw new Error(
        `Repeatable ID "${id}" cannot contain "[" or "]" (reserved for composite keys)`
      );
    }

    const builder = new RepeatableBuilder<C>(this.config);
    const configured = configure(builder);

    // Nesting check — repeatables cannot contain other repeatables
    if (configured._hasRepeatables()) {
      throw new Error(`Nested repeatables are not supported (in repeatable "${id}")`);
    }

    const repeatableConfig = configured._build(id);

    const row: FormRepeatableRow = {
      kind: 'repeatable',
      id: this.idGenerator.next('repeatable'),
      repeatable: repeatableConfig,
    };

    this.rows.push(row);
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
   * This method allows you to modify field properties after the field has been added to the form.
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
      if (row.kind === 'fields') {
        const field = row.fields.find((f) => f.id === fieldId);
        if (field) return field;
      } else {
        const field = row.repeatable.allFields.find((f) => f.id === fieldId);
        if (field) return field;
      }
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
      .map((row) => {
        if (row.kind === 'repeatable') return row;
        return {
          ...row,
          fields: row.fields.filter((field) => field.id !== fieldId),
        };
      })
      .filter((row) => row.kind === 'repeatable' || row.fields.length > 0);

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
    return this.rows
      .filter((row): row is FormFieldRow => row.kind === 'fields')
      .flatMap((row) => row.fields);
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
  getRows(): FormRowEntry[] {
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
   * Configures validation for the entire form
   *
   * This method sets up form-level validation that will be applied when the
   * form is submitted or when validation is explicitly triggered. Form validators
   * receive all form data and can perform cross-field validation.
   *
   * @param validationConfig - Form validation configuration
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.setValidation({
   *   validators: [
   *     (formData, context) => {
   *       if (!formData.email && !formData.phone) {
   *         return createErrorResult('Either email or phone is required');
   *       }
   *       return createSuccessResult();
   *     }
   *   ],
   *   validateOnSubmit: true
   * });
   * ```
   */
  setValidation(validationConfig: FormValidationConfig): this {
    this.formValidation = validationConfig;
    return this;
  }

  /**
   * Sets default submit options for this form
   *
   * These options can be overridden at submit-time by passing options to `submit()`.
   *
   * @param options - Submit options to use as defaults
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * // Always skip invalid fields on submit
   * builder.setSubmitOptions({ skipInvalid: true });
   *
   * // Force submit by default (bypass validation)
   * builder.setSubmitOptions({ force: true });
   * ```
   */
  setSubmitOptions(options: SubmitOptions): this {
    this._submitOptions = options;
    return this;
  }

  /**
   * Adds validators to the form-level validation
   *
   * This method allows adding validators to an existing validation configuration
   * without replacing the entire configuration.
   *
   * @param validators - Array of form validators to add
   * @returns The form builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.addValidators([
   *   customFormValidator,
   *   anotherFormValidator
   * ]);
   * ```
   */
  // addValidators method removed - use setValidation with 'validate' property

  /**
   * Adds validation to a specific field by ID
   *
   * This method allows adding validation to a field after it has been created,
   * useful for dynamic validation requirements.
   *
   * @param fieldId - The ID of the field to add validation to
   * @param validationConfig - Field validation configuration
   * @returns The form builder instance for method chaining
   * @throws Error if the field with the specified ID is not found
   *
   * @example
   * ```typescript
   * builder.addFieldValidation('email', {
   *   validators: [required(), email()],
   *   validateOnBlur: true
   * });
   * ```
   */
  /** @deprecated Use updateField with new validation.validate property instead */
  addFieldValidation(fieldId: string, validationConfig: any): this {
    console.warn(
      'addFieldValidation is deprecated. Use updateField with validation.validate property instead.'
    );
    const field = this.findField(fieldId);
    if (!field) {
      throw new Error(`Field with ID "${fieldId}" not found`);
    }

    // For legacy support, just update with new config (ignoring validators merge)
    const updatedValidation = {
      ...field.validation,
      ...validationConfig,
    };

    return this.updateField(fieldId, { validation: updatedValidation });
  }

  /**
   * Adds conditions to a specific field by ID
   *
   * This method allows adding conditional behavior to a field after it has been created,
   * useful for dynamic conditional requirements.
   *
   * @param fieldId - The ID of the field to add conditions to
   * @param conditions - Conditional behavior configuration
   * @returns The form builder instance for method chaining
   * @throws Error if the field with the specified ID is not found
   *
   * @example
   * ```typescript
   * builder.addFieldConditions('phone', {
   *   visible: when('contactMethod').equals('phone').build(),
   *   required: when('contactMethod').equals('phone').build()
   * });
   * ```
   */
  addFieldConditions(fieldId: string, conditions: ConditionalBehavior): this {
    const field = this.findField(fieldId);
    if (!field) {
      throw new Error(`Field with ID "${fieldId}" not found`);
    }

    const updatedConditions: ConditionalBehavior = {
      ...field.conditions,
      ...conditions,
    };

    return this.updateField(fieldId, { conditions: updatedConditions });
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
   * Checks the current form configuration for basic structural issues.
   *
   * @returns Array of error messages (empty if valid)
   */
  validate(): string[] {
    const errors: string[] = [];
    const allFields = this.getFields();

    // Collect all repeatable configs
    const repeatableRows = this.rows.filter(
      (row): row is FormRepeatableRow => row.kind === 'repeatable'
    );
    const repeatableTemplateFields = repeatableRows.flatMap((row) => row.repeatable.allFields);

    // Check for duplicate field IDs (including across repeatables)
    const allFieldIds = [
      ...allFields.map((field) => field.id),
      ...repeatableTemplateFields.map((field) => field.id),
    ];
    try {
      ensureUnique(allFieldIds, 'field');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    // Check for duplicate repeatable IDs
    const repeatableIds = repeatableRows.map((row) => row.repeatable.id);
    try {
      ensureUnique(repeatableIds, 'repeatable');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    // Check that all referenced components exist (static fields)
    for (const field of allFields) {
      if (!this.config.hasComponent(field.componentId)) {
        errors.push(`Component "${field.componentId}" not found for field "${field.id}"`);
      }
    }

    // Check that all referenced components exist (repeatable template fields)
    for (const field of repeatableTemplateFields) {
      if (!this.config.hasComponent(field.componentId)) {
        errors.push(
          `Component "${field.componentId}" not found for repeatable template field "${field.id}"`
        );
      }
    }

    // Check row constraints (only for field rows)
    for (const row of this.rows) {
      if (row.kind === 'fields') {
        if (row.fields.length > 3) {
          errors.push(`Row "${row.id}" has ${row.fields.length} fields, maximum is 3`);
        }

        if (row.fields.length === 0) {
          errors.push(`Row "${row.id}" is empty`);
        }
      }
    }

    // Validate brackets not in IDs
    for (const field of allFields) {
      if (field.id.includes('[') || field.id.includes(']')) {
        errors.push(
          `Field ID "${field.id}" cannot contain "[" or "]" (reserved for repeatable composite keys)`
        );
      }
    }

    for (const repeatableId of repeatableIds) {
      if (repeatableId.includes('[') || repeatableId.includes(']')) {
        errors.push(
          `Repeatable ID "${repeatableId}" cannot contain "[" or "]" (reserved for composite keys)`
        );
      }
    }

    return errors;
  }

  /**
   * Builds the final form configuration
   *
   * This method creates the complete form
   * configuration object ready for rendering. It includes all field
   * configurations, render settings, validation configuration, and metadata.
   *
   * @returns Complete form configuration ready for use
   *
   * @example
   * ```typescript
   * const formConfig = builder.build();
   * // Use formConfig with your form renderer
   * ```
   *
   * @remarks
   * The returned configuration includes:
   * - Form ID and metadata
   * - All rows with their field configurations
   * - Flattened array of all fields for easy access
   * - Component configuration reference
   * - Render configuration for customization
   * - Form-level validation configuration
   */
  build(): FormConfiguration<C> {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Form validation failed: ${errors.join(', ')}`);
    }

    // Build repeatableFields index
    const repeatableRows = this.rows.filter(
      (row): row is FormRepeatableRow => row.kind === 'repeatable'
    );
    const repeatableFields: Record<string, RepeatableFieldConfig> | undefined =
      repeatableRows.length > 0
        ? Object.fromEntries(repeatableRows.map((row) => [row.repeatable.id, row.repeatable]))
        : undefined;

    return {
      id: this.formId,
      rows: [...this.rows],
      allFields: this.getFields(),
      repeatableFields,
      config: this.config,
      renderConfig: this.config.getFormRenderConfig(),
      validation: this.formValidation,
      submitOptions: this._submitOptions,
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
      // Add kind: 'fields' to legacy rows that don't have a kind discriminant
      this.rows = json.rows.map((row: any) => {
        if (!row.kind) {
          return { ...row, kind: 'fields' as const };
        }
        return row;
      });
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
    const fieldRows = this.rows.filter((row): row is FormFieldRow => row.kind === 'fields');
    const repeatableRows = this.rows.filter(
      (row): row is FormRepeatableRow => row.kind === 'repeatable'
    );
    const fieldCounts = fieldRows.map((row) => row.fields.length);

    return {
      /** Total number of static fields across all rows */
      totalFields: allFields.length,
      /** Total number of rows in the form */
      totalRows: this.rows.length,
      /** Average number of fields per row (field rows only) */
      averageFieldsPerRow: fieldRows.length > 0 ? allFields.length / fieldRows.length : 0,
      /** Maximum number of fields in any single row */
      maxFieldsInRow: fieldCounts.length > 0 ? Math.max(...fieldCounts) : 0,
      /** Minimum number of fields in any single row */
      minFieldsInRow: fieldCounts.length > 0 ? Math.min(...fieldCounts) : 0,
      /** Total number of repeatable groups */
      totalRepeatables: repeatableRows.length,
      /** Total number of fields across all repeatable templates */
      totalRepeatableFields: repeatableRows.reduce(
        (sum, row) => sum + row.repeatable.allFields.length,
        0
      ),
    };
  }
}
