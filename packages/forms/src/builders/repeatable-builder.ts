import type {
  FieldValidationConfig,
  FormFieldRow,
  RepeatableFieldConfig,
  ril,
} from '@rilaykit/core';
import { type FieldConfig, form } from './form';

// =================================================================
// REPEATABLE BUILDER
// =================================================================

/**
 * Fluent builder for configuring repeatable field groups
 *
 * Used via callback in `form.addRepeatable()`:
 * ```typescript
 * form.create(ril, "order")
 *   .addRepeatable("items", r => r
 *     .add(
 *       { id: "name", type: "text", props: { label: "Item" } },
 *       { id: "qty", type: "number", props: { label: "Qty" } }
 *     )
 *     .min(1)
 *     .max(10)
 *     .defaultValue({ name: "", qty: 1 })
 *   )
 *   .build()
 * ```
 */
export class RepeatableBuilder<C extends Record<string, any>> {
  private innerForm: form<C>;
  private _min?: number;
  private _max?: number;
  private _defaultValue?: Record<string, unknown>;
  private _validation?: FieldValidationConfig;

  constructor(config: ril<C>) {
    this.innerForm = new form<C>(config, '__repeatable_template__');
  }

  /**
   * Add fields to the repeatable template
   * Same API as form.add() — variadic ≤3 puts them on the same row
   */
  add<T extends keyof C & string>(...fields: FieldConfig<C, T>[]): this;
  add<T extends keyof C & string>(fields: FieldConfig<C, T>[]): this;
  add<T extends keyof C & string>(...args: FieldConfig<C, T>[] | [FieldConfig<C, T>[]]): this {
    this.innerForm.add(...(args as any));
    return this;
  }

  /**
   * Add fields each on their own row
   */
  addSeparateRows<T extends keyof C & string>(fields: FieldConfig<C, T>[]): this {
    this.innerForm.addSeparateRows(fields);
    return this;
  }

  /**
   * Set minimum number of items (defaults to 0)
   */
  min(value: number): this {
    this._min = value;
    return this;
  }

  /**
   * Set maximum number of items (unlimited if not set)
   */
  max(value: number): this {
    this._max = value;
    return this;
  }

  /**
   * Set default values for new items
   */
  defaultValue(value: Record<string, unknown>): this {
    this._defaultValue = value;
    return this;
  }

  /**
   * Set group-level validation (applied to the entire array)
   */
  validation(config: FieldValidationConfig): this {
    this._validation = config;
    return this;
  }

  /** @internal — called by form.addRepeatable */
  _build(id: string): RepeatableFieldConfig {
    const rows = this.innerForm.getRows() as FormFieldRow[];
    const allFields = this.innerForm.getFields();

    if (rows.length === 0) {
      throw new Error(`Repeatable "${id}" must have at least one field`);
    }

    // Validate no brackets in template field IDs
    for (const field of allFields) {
      if (field.id.includes('[') || field.id.includes(']')) {
        throw new Error(
          `Repeatable template field ID "${field.id}" cannot contain "[" or "]" (reserved for composite keys)`
        );
      }
    }

    if (this._min !== undefined && this._max !== undefined && this._min > this._max) {
      throw new Error(
        `Repeatable "${id}": min (${this._min}) cannot be greater than max (${this._max})`
      );
    }

    return {
      id,
      rows: rows.map((row) => ({ ...row, kind: 'fields' as const })),
      allFields,
      min: this._min,
      max: this._max,
      defaultValue: this._defaultValue,
      validation: this._validation,
    };
  }

  /** @internal — check if the inner builder has repeatables (nesting forbidden) */
  _hasRepeatables(): boolean {
    return this.innerForm.getRows().some((row) => 'kind' in row && row.kind === 'repeatable');
  }
}
