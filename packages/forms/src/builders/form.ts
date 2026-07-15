import {
  type ConditionalBehavior,
  type FieldConfigFor,
  type FieldConfigOf,
  type FieldEffect,
  type FieldEffects,
  type FieldValidationConfig,
  type FormConfiguration,
  type FormFieldConfig,
  type FormFieldRow,
  type FormRepeatableRow,
  type FormRowEntry,
  type FormValidationConfig,
  ConfigurationError,
  IdGenerator,
  NotFoundError,
  ValidationError,
  type RepeatableFieldConfig,
  type RilayInstance,
  type SubmitOptions,
  deepClone,
  ensureUnique,
  getLogger,
  type ril,
} from '@rilaykit/core';
import { RepeatableBuilder } from './repeatable-builder';

const log = getLogger('forms:builder');

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
export type FieldConfig<C extends Record<string, any>, T extends keyof C> = FieldConfigOf<
  C,
  T & string
>;

/**
 * Maps a tuple of component-type keys — one per `.add(...)` argument — to the
 * field config each argument must satisfy, narrowing `props` PER ARGUMENT to
 * the props of the component type THAT argument declares.
 *
 * `Ks` is inferred position-by-position from each argument's own `type` literal
 * (reverse mapped-type inference: `FieldConfigOf<C, Ks[I]>` pins `type: Ks[I]`),
 * so `props` is then checked against `Partial<C[Ks[I]]>` and nothing else.
 *
 * A single `T extends keyof C & string` shared across a variadic call instead
 * widens `T` to the union of every type passed, and `Partial<C['a' | 'b']>`
 * distributes to `Partial<C['a']> | Partial<C['b']>` — which happily accepts
 * `a`'s props on a `b` field. That is the hole this closes.
 *
 * Note this cannot simply be `FieldConfigFor<C>`: `ril.create()` produces a
 * catalog carrying a string index signature, which collapses `keyof C & string`
 * to `string` and `Partial<C[string]>` to `Partial<never>`, rejecting every
 * valid call. Inferring `Ks` from the argument's literal `type` sidesteps it.
 */
type FieldConfigTuple<C extends Record<string, any>, Ks extends readonly (keyof C & string)[]> = {
  [I in keyof Ks]: FieldConfigOf<C, Ks[I]>;
};

/**
 * Form builder for creating type-safe form configurations
 *
 * DX Notes (How to create a form):
 * - Recommended: use the static factory
 *
 *   const rilConfig = ril
 *     .create()
 *     .component('text', { name: 'Text', renderer: TextInput })
 *     .component('email', { name: 'Email', renderer: EmailInput });
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
 * - Variadic: .add(fieldA, fieldB) => same row
 * - Array:    .add([fieldA, fieldB]) => explicit single row
 *
 * Output of .build(): FormConfiguration<C>
 * - id, rows, allFields, optional validation
 */
export class form<C extends Record<string, any> = Record<string, never>> {
  /** The ril configuration instance containing component definitions */
  private config: RilayInstance<C>;
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
  constructor(config: RilayInstance<C> | ril<C>, formId?: string) {
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
    config: RilayInstance<Cm> | ril<Cm>,
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
   * @throws NotFoundError if the specified component type is not registered
   *
   * @internal
   */
  private createFormField<T extends keyof C & string>(
    fieldConfig: FieldConfig<C, T>
  ): FormFieldConfig {
    const component = this.config.getComponent(fieldConfig.type);

    if (!component) {
      throw new NotFoundError(`No component found with type "${fieldConfig.type}"`, {
        key: `component:${fieldConfig.type}`,
      });
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
      // Catalog entries are keyed by type
      componentId: fieldConfig.type,
      props: { ...component.defaultProps, ...fieldConfig.props },
      validation: combinedValidation,
      conditions: fieldConfig.conditions,
      effects: fieldConfig.effects,
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
   * @throws Error if no fields provided
   *
   * @internal
   */
  private createRow<T extends keyof C & string>(fieldConfigs: FieldConfig<C, T>[]): FormFieldRow {
    if (fieldConfigs.length === 0) {
      throw new ConfigurationError('At least one field is required');
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
   * - Multiple fields: Creates one row with all fields
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
   * // Multiple fields on same row
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
  // `FieldConfigFor<C>`, not `FieldConfig<C, T>`: a single inferred `T` widens to
  // the UNION of every type in a mixed call, which widens `props` to the union of
  // every sibling's props — so `{ type: 'a', props: <b's props> }` type-checked.
  // The distributed union narrows each argument independently to the config of
  // the very type that argument declares, so a wrong-props-for-type pairing
  // matches no member of the union.
  add<const Fs extends readonly (keyof C & string)[]>(...fields: FieldConfigTuple<C, Fs>): this;
  add<const Fs extends readonly (keyof C & string)[]>(fields: FieldConfigTuple<C, Fs>): this;
  add(...args: FieldConfigFor<C>[] | [FieldConfigFor<C>[]]): this {
    // Check if first argument is an array (explicit array syntax)
    const fieldConfigs: FieldConfigFor<C>[] =
      args.length === 1 && Array.isArray(args[0]) ? args[0] : (args as FieldConfigFor<C>[]);

    if (fieldConfigs.length === 0) {
      throw new ConfigurationError('At least one field is required');
    }

    const row = this.createRow(fieldConfigs);
    this.rows.push(row);
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
  // Same per-argument narrowing as `.add` — see FieldConfigTuple.
  addSeparateRows<const Fs extends readonly (keyof C & string)[]>(
    fieldConfigs: FieldConfigTuple<C, Fs>
  ): this {
    for (const config of fieldConfigs as readonly FieldConfigFor<C>[]) {
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
      throw new ConfigurationError(
        `Repeatable ID "${id}" cannot contain "[" or "]" (reserved for composite keys)`,
        { id }
      );
    }

    const builder = new RepeatableBuilder<C>(this.config);
    const configured = configure(builder);

    // Nesting check — repeatables cannot contain other repeatables
    if (configured._hasRepeatables()) {
      throw new ConfigurationError(`Nested repeatables are not supported (in repeatable "${id}")`, {
        id,
      });
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
    const field = this.findFieldOrThrow(fieldId);

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
   * Finds a field by ID or throws a `NotFoundError`.
   *
   * @internal
   */
  private findFieldOrThrow(fieldId: string): FormFieldConfig {
    const field = this.findField(fieldId);
    if (!field) {
      throw new NotFoundError(`Field with ID "${fieldId}" not found`, { fieldId });
    }
    return field;
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
    log.warn(
      'addFieldValidation is deprecated. Use updateField with validation.validate property instead.'
    );
    const field = this.findFieldOrThrow(fieldId);

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
    const field = this.findFieldOrThrow(fieldId);

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
    // Carry the id counter state so the clone keeps numbering after the highest
    // existing id instead of colliding with already-cloned field/row ids.
    cloned.idGenerator = this.idGenerator.clone();
    // Preserve form-level validation and submit options. Deep-clone the plain
    // data while keeping validator function identity (deepClone returns
    // functions unchanged since they are not plain objects).
    cloned.formValidation = this.formValidation ? deepClone(this.formValidation) : undefined;
    cloned._submitOptions = this._submitOptions ? deepClone(this._submitOptions) : undefined;
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

    // Top-level field ids and repeatable ids are ONE namespace, not two.
    // `structureFormValues` writes `result[repeatableId] = items` and then copies
    // every non-composite value into that same object, so a top-level field
    // sharing a repeatable's id overwrites the entire array — the submitted
    // payload silently loses it. Checking the two namespaces separately (as this
    // did) lets that schema compile clean.
    //
    // Repeatable TEMPLATE fields are deliberately exempt: they submit under
    // composite keys (`items[k0].name`), never as a top-level payload key, so a
    // template field may legitimately reuse its own repeatable's id.
    const repeatableIds = repeatableRows.map((row) => row.repeatable.id);
    const payloadIds = [...allFields.map((field) => field.id), ...repeatableIds];
    try {
      ensureUnique(payloadIds, 'field or repeatable');
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
      throw new ValidationError(`Form validation failed: ${errors.join(', ')}`, { errors });
    }

    // Build repeatableFields index
    const repeatableRows = this.rows.filter(
      (row): row is FormRepeatableRow => row.kind === 'repeatable'
    );
    const repeatableFields: Record<string, RepeatableFieldConfig> | undefined =
      repeatableRows.length > 0
        ? Object.fromEntries(repeatableRows.map((row) => [row.repeatable.id, row.repeatable]))
        : undefined;

    const allFields = this.getFields();

    // Build effectsMap: watchFieldId -> FieldEffect[].
    // A Map accumulator, not a plain object: `watchFieldId` comes from the
    // (possibly schema-authored) field config, and a plain object answers
    // `effectsMap['toString']` with an inherited method — the guard then reads
    // it as "already present" and `.push` blows up on a function.
    const effectsMap = new Map<string, FieldEffect[]>();
    indexEffects(allFields, effectsMap);
    if (repeatableFields) {
      for (const config of Object.values(repeatableFields)) {
        indexEffects(config.allFields, effectsMap);
      }
    }

    return {
      id: this.formId,
      rows: [...this.rows],
      allFields,
      repeatableFields,
      config: this.config,
      validation: this.formValidation,
      submitOptions: this._submitOptions,
      // `Object.fromEntries` defines every key as an own data property, so a
      // watched field named `__proto__` stays a real key of the index.
      effectsMap: effectsMap.size > 0 ? Object.fromEntries(effectsMap) : undefined,
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

/**
 * Indexes every field's effects into `into`, keyed by watched field id.
 *
 * The single accumulator for both effect sources (top-level fields and
 * repeatable templates) so the two cannot drift.
 */
function indexEffects(fields: readonly FormFieldConfig[], into: Map<string, FieldEffect[]>): void {
  for (const field of fields) {
    if (!field.effects) continue;
    for (const effect of field.effects) {
      const existing = into.get(effect.watchFieldId);
      if (existing) {
        existing.push(effect);
      } else {
        into.set(effect.watchFieldId, [effect]);
      }
    }
  }
}

/**
 * Resolve a form definition to a built {@link FormConfiguration}.
 *
 * Accepts either an already-built configuration (returned as-is) or a
 * form builder (auto-built via {@link form.build}). Single source of
 * truth for the "config or builder" resolution used by form/workflow roots.
 */
export function resolveFormConfig<C extends Record<string, any>>(
  value: FormConfiguration<C> | form<C>
): FormConfiguration<C> {
  return value instanceof form ? value.build() : value;
}
