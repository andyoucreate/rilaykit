import type { FormConfiguration, FormFieldConfig, FormFieldRow, ril } from '@rilaykit/core';
import { IdGenerator, deepClone } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import type { BuilderMetadata } from '../types';
import { createDefaultMetadata } from '../utils/serialization';

/**
 * History action for undo/redo
 */
interface HistoryAction {
  readonly type: 'ADD' | 'REMOVE' | 'UPDATE' | 'MOVE';
  readonly timestamp: number;
  readonly data: any;
}

/**
 * History stack for undo/redo operations
 */
interface HistoryStack {
  readonly past: HistoryAction[];
  readonly future: HistoryAction[];
}

/**
 * Visual builder state snapshot for history
 */
interface BuilderSnapshot {
  readonly rows: FormFieldRow[];
  readonly metadata: BuilderMetadata;
}

/**
 * Visual form builder - Pure logic layer (no React)
 *
 * This class wraps the existing `form` builder and adds visual editing capabilities
 * with immutable operations, undo/redo, and serialization.
 *
 * Following Rilay philosophy:
 * - DRY: Reuses existing form builder
 * - YAGNI: Only essential features
 * - Immutable: All operations return new instances
 * - Type-safe: Full TypeScript support
 *
 * @example
 * ```typescript
 * const builder = visualBuilder.create(rilConfig)
 *   .addComponent('text')
 *   .addComponent('email')
 *   .build();
 *
 * // Result is a standard FormConfiguration
 * <Form config={builder} />
 * ```
 */
export class visualBuilder<C extends Record<string, any> = Record<string, never>> {
  private formBuilder: form<C>;
  private rilConfig: ril<C>;
  private history: HistoryStack;
  private metadata: BuilderMetadata;
  private selectedFieldId?: string;
  private selectedRowId?: string;
  private idGenerator = new IdGenerator();

  /**
   * Private constructor - use static factory method
   */
  private constructor(
    rilConfig: ril<C>,
    formBuilder?: form<C>,
    history?: HistoryStack,
    metadata?: BuilderMetadata,
    selectedFieldId?: string,
    selectedRowId?: string
  ) {
    this.rilConfig = rilConfig;
    this.formBuilder = formBuilder || form.create(rilConfig, this.idGenerator.next('form'));
    this.history = history || { past: [], future: [] };
    this.metadata = metadata || createDefaultMetadata();
    this.selectedFieldId = selectedFieldId;
    this.selectedRowId = selectedRowId;
  }

  /**
   * Static factory to create a new visual builder
   *
   * @param rilConfig - RilayKit configuration with component definitions
   * @param id - Optional unique identifier for the form
   * @returns New visual builder instance
   *
   * @example
   * ```typescript
   * const builder = visualBuilder.create(rilConfig, 'contact-form');
   * ```
   */
  static create<Cm extends Record<string, any> = Record<string, never>>(
    rilConfig: ril<Cm>,
    id?: string
  ): visualBuilder<Cm> {
    const formBuilder = form.create(rilConfig, id);
    return new visualBuilder<Cm>(rilConfig, formBuilder);
  }

  /**
   * Clone the current builder (internal helper for immutability)
   */
  private clone(
    updates: {
      formBuilder?: form<C>;
      history?: HistoryStack;
      metadata?: BuilderMetadata;
      selectedFieldId?: string;
      selectedRowId?: string;
    } = {}
  ): visualBuilder<C> {
    return new visualBuilder<C>(
      this.rilConfig,
      updates.formBuilder || this.formBuilder.clone(),
      updates.history || this.history,
      updates.metadata || this.metadata,
      updates.selectedFieldId !== undefined ? updates.selectedFieldId : this.selectedFieldId,
      updates.selectedRowId !== undefined ? updates.selectedRowId : this.selectedRowId
    );
  }

  /**
   * Add an action to history (for undo/redo)
   */
  private addToHistory(action: HistoryAction): HistoryStack {
    return {
      past: [...this.history.past, action],
      future: [], // Clear future when new action is performed
    };
  }

  /**
   * Create a snapshot of current state
   */
  private createSnapshot(): BuilderSnapshot {
    return {
      rows: deepClone(this.formBuilder.getRows()),
      metadata: deepClone(this.metadata),
    };
  }

  /**
   * Add a component to the form
   *
   * @param componentType - Type of component to add (must be registered in ril)
   * @param props - Optional props for the component
   * @param rowIndex - Optional row index (creates new row if not specified)
   * @returns New builder instance with component added
   *
   * @example
   * ```typescript
   * const newBuilder = builder.addComponent('text', { label: 'Name' });
   * ```
   */
  addComponent(
    componentType: keyof C & string,
    props?: Partial<C[keyof C]>,
    rowIndex?: number
  ): visualBuilder<C> {
    const component = this.rilConfig.getComponent(componentType);
    if (!component) {
      throw new Error(`Component type "${componentType}" not found in ril configuration`);
    }

    const fieldId = this.idGenerator.next('field');
    const newFormBuilder = this.formBuilder.clone();

    // Add field with auto-generated ID
    newFormBuilder.add({
      id: fieldId,
      type: componentType,
      props: props || {},
    });

    const action: HistoryAction = {
      type: 'ADD',
      timestamp: Date.now(),
      data: { componentType, fieldId, props, rowIndex },
    };

    return this.clone({
      formBuilder: newFormBuilder,
      history: this.addToHistory(action),
      selectedFieldId: fieldId,
      metadata: { ...this.metadata, updatedAt: new Date() },
    });
  }

  /**
   * Remove a field from the form
   *
   * @param fieldId - ID of field to remove
   * @returns New builder instance with field removed
   */
  removeField(fieldId: string): visualBuilder<C> {
    const field = this.formBuilder.getField(fieldId);
    if (!field) {
      throw new Error(`Field "${fieldId}" not found`);
    }

    const newFormBuilder = this.formBuilder.clone();
    newFormBuilder.removeField(fieldId);

    const action: HistoryAction = {
      type: 'REMOVE',
      timestamp: Date.now(),
      data: { fieldId, field },
    };

    return this.clone({
      formBuilder: newFormBuilder,
      history: this.addToHistory(action),
      selectedFieldId: undefined,
      metadata: { ...this.metadata, updatedAt: new Date() },
    });
  }

  /**
   * Update field properties
   *
   * @param fieldId - ID of field to update
   * @param props - Props to update
   * @returns New builder instance with field updated
   */
  updateField(fieldId: string, props: Record<string, any>): visualBuilder<C> {
    const field = this.formBuilder.getField(fieldId);
    if (!field) {
      throw new Error(`Field "${fieldId}" not found`);
    }

    const newFormBuilder = this.formBuilder.clone();
    newFormBuilder.updateField(fieldId, { props });

    const action: HistoryAction = {
      type: 'UPDATE',
      timestamp: Date.now(),
      data: { fieldId, props, previousProps: field.props },
    };

    return this.clone({
      formBuilder: newFormBuilder,
      history: this.addToHistory(action),
      metadata: { ...this.metadata, updatedAt: new Date() },
    });
  }

  /**
   * Select a field (for property editing)
   *
   * @param fieldId - ID of field to select
   * @returns New builder instance with field selected
   */
  selectField(fieldId?: string): visualBuilder<C> {
    return this.clone({
      selectedFieldId: fieldId,
      selectedRowId: undefined,
    });
  }

  /**
   * Get currently selected field
   */
  getSelectedField(): FormFieldConfig | undefined {
    if (!this.selectedFieldId) return undefined;
    return this.formBuilder.getField(this.selectedFieldId);
  }

  /**
   * Get selected field ID
   */
  getSelectedFieldId(): string | undefined {
    return this.selectedFieldId;
  }

  /**
   * Get all fields
   */
  getFields(): FormFieldConfig[] {
    return this.formBuilder.getFields();
  }

  /**
   * Get all rows
   */
  getRows(): FormFieldRow[] {
    return this.formBuilder.getRows();
  }

  /**
   * Get underlying form builder (for advanced usage)
   */
  getFormBuilder(): form<C> {
    return this.formBuilder;
  }

  /**
   * Get ril configuration
   */
  getRilConfig(): ril<C> {
    return this.rilConfig;
  }

  /**
   * Get builder metadata
   */
  getMetadata(): BuilderMetadata {
    return this.metadata;
  }

  /**
   * Update builder metadata
   */
  setMetadata(metadata: Partial<BuilderMetadata>): visualBuilder<C> {
    return this.clone({
      metadata: { ...this.metadata, ...metadata, updatedAt: new Date() },
    });
  }

  /**
   * Check if can undo
   */
  canUndo(): boolean {
    return this.history.past.length > 0;
  }

  /**
   * Check if can redo
   */
  canRedo(): boolean {
    return this.history.future.length > 0;
  }

  /**
   * Undo last action
   *
   * @returns New builder instance with last action undone
   */
  undo(): visualBuilder<C> {
    if (!this.canUndo()) {
      return this;
    }

    const lastAction = this.history.past[this.history.past.length - 1];
    const newPast = this.history.past.slice(0, -1);
    const newFuture = [lastAction, ...this.history.future];

    // Reconstruct form builder from history
    const reconstructed = this.reconstructFromHistory(newPast);

    return this.clone({
      formBuilder: reconstructed,
      history: { past: newPast, future: newFuture },
      metadata: { ...this.metadata, updatedAt: new Date() },
    });
  }

  /**
   * Redo last undone action
   *
   * @returns New builder instance with action redone
   */
  redo(): visualBuilder<C> {
    if (!this.canRedo()) {
      return this;
    }

    const nextAction = this.history.future[0];
    const newPast = [...this.history.past, nextAction];
    const newFuture = this.history.future.slice(1);

    const reconstructed = this.reconstructFromHistory(newPast);

    return this.clone({
      formBuilder: reconstructed,
      history: { past: newPast, future: newFuture },
      metadata: { ...this.metadata, updatedAt: new Date() },
    });
  }

  /**
   * Reconstruct form builder from history (for undo/redo)
   */
  private reconstructFromHistory(actions: HistoryAction[]): form<C> {
    const newFormBuilder = form.create(this.rilConfig);

    for (const action of actions) {
      switch (action.type) {
        case 'ADD': {
          const { componentType, fieldId, props } = action.data;
          newFormBuilder.add({
            id: fieldId,
            type: componentType,
            props: props || {},
          });
          break;
        }
        case 'UPDATE': {
          const { fieldId, props } = action.data;
          newFormBuilder.updateField(fieldId, { props });
          break;
        }
        case 'REMOVE': {
          const { fieldId } = action.data;
          newFormBuilder.removeField(fieldId);
          break;
        }
      }
    }

    return newFormBuilder;
  }

  /**
   * Get form statistics
   */
  getStats() {
    return this.formBuilder.getStats();
  }

  /**
   * Clear all fields
   */
  clear(): visualBuilder<C> {
    const newFormBuilder = form.create(this.rilConfig);

    return this.clone({
      formBuilder: newFormBuilder,
      history: { past: [], future: [] },
      selectedFieldId: undefined,
      metadata: { ...this.metadata, updatedAt: new Date() },
    });
  }

  /**
   * Build final form configuration
   *
   * @returns Standard FormConfiguration ready for use
   *
   * @example
   * ```typescript
   * const formConfig = builder.build();
   * <Form config={formConfig} onSubmit={handleSubmit} />
   * ```
   */
  build(): FormConfiguration<C> {
    return this.formBuilder.build();
  }

  /**
   * Export to JSON for serialization
   *
   * @returns Plain object representation
   */
  toJSON(): any {
    return {
      version: '1.0.0',
      formId: this.formBuilder.toJSON().id,
      rows: this.formBuilder.getRows(),
      metadata: this.metadata,
    };
  }

  /**
   * Import from JSON
   *
   * @param json - Previously exported JSON
   * @returns New builder instance with imported state
   */
  fromJSON(json: any): visualBuilder<C> {
    const newFormBuilder = form.create(this.rilConfig, json.formId);
    newFormBuilder.fromJSON({
      id: json.formId,
      rows: json.rows,
    });

    return this.clone({
      formBuilder: newFormBuilder,
      metadata: json.metadata || createDefaultMetadata(),
      history: { past: [], future: [] },
    });
  }

  /**
   * Validate current builder state
   *
   * @returns Array of validation errors (empty if valid)
   */
  validate(): string[] {
    return this.formBuilder.validate();
  }
}
