import type {
  ComponentConfig,
  FormFieldConfig,
  FormFieldRow,
  WorkflowConfig,
  ril,
} from '@rilaykit/core';
import type { form } from '@rilaykit/forms';
import type { flow } from '@rilaykit/workflow';

// =================================================================
// 1. BUILDER STATE & CONFIGURATION
// =================================================================

/**
 * Type of builder instance
 */
export type BuilderType = 'form' | 'workflow';

/**
 * Builder metadata for tracking and versioning
 */
export interface BuilderMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly author?: string;
  readonly tags: string[];
  readonly description?: string;
}

/**
 * Base builder state interface
 */
export interface BaseBuilderState<T extends BuilderType> {
  readonly id: string;
  readonly name: string;
  readonly type: T;
  readonly version: string;
  readonly metadata: BuilderMetadata;
}

/**
 * Form builder state
 */
export interface FormBuilderState extends BaseBuilderState<'form'> {
  readonly formBuilder: form<any>;
  readonly selectedFieldId?: string;
  readonly selectedRowId?: string;
}

/**
 * Workflow builder state
 */
export interface WorkflowBuilderState extends BaseBuilderState<'workflow'> {
  readonly flowBuilder: flow;
  readonly selectedStepId?: string;
}

/**
 * Union type for any builder state
 */
export type BuilderState = FormBuilderState | WorkflowBuilderState;

// =================================================================
// 2. DRAG & DROP SYSTEM
// =================================================================

/**
 * Draggable item types
 */
export type DraggableItemType = 'component' | 'field' | 'row' | 'step';

/**
 * Base draggable item interface
 */
export interface DraggableItem<T extends DraggableItemType = DraggableItemType> {
  readonly id: string;
  readonly type: T;
  readonly data: any;
}

/**
 * Component being dragged from palette
 */
export interface ComponentDraggableItem extends DraggableItem<'component'> {
  readonly data: {
    readonly componentId: string;
    readonly componentType: string;
    readonly componentConfig: ComponentConfig;
  };
}

/**
 * Field being reordered
 */
export interface FieldDraggableItem extends DraggableItem<'field'> {
  readonly data: {
    readonly fieldId: string;
    readonly rowId: string;
    readonly fieldConfig: FormFieldConfig;
  };
}

/**
 * Row being reordered
 */
export interface RowDraggableItem extends DraggableItem<'row'> {
  readonly data: {
    readonly rowId: string;
    readonly rowConfig: FormFieldRow;
  };
}

/**
 * Drop target information
 */
export interface DropTarget {
  readonly id: string;
  readonly type: 'canvas' | 'row' | 'between-rows';
  readonly position?: 'before' | 'after';
  readonly rowIndex?: number;
}

/**
 * Drag event data
 */
export interface DragEventData {
  readonly item: DraggableItem;
  readonly source: {
    readonly type: 'palette' | 'canvas';
    readonly index?: number;
  };
  readonly target?: DropTarget;
}

// =================================================================
// 3. COMPONENT PALETTE
// =================================================================

/**
 * Component palette item
 */
export interface PaletteComponent {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
  readonly icon?: string;
  readonly category: string;
  readonly config: ComponentConfig;
  readonly preview?: React.ReactNode;
  readonly tags?: string[];
}

/**
 * Component palette category
 */
export interface PaletteCategory {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly components: PaletteComponent[];
}

/**
 * Component palette configuration
 */
export interface ComponentPaletteConfig {
  readonly categories: PaletteCategory[];
  readonly searchable?: boolean;
  readonly collapsible?: boolean;
  readonly defaultExpanded?: boolean;
}

// =================================================================
// 4. PROPERTY PANEL
// =================================================================

/**
 * Property editor types
 */
export type PropertyEditorType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'color'
  | 'json'
  | 'code';

/**
 * Property definition for editing
 */
export interface PropertyDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: PropertyEditorType;
  readonly description?: string;
  readonly defaultValue?: any;
  readonly options?: Array<{ label: string; value: any }>;
  readonly validation?: (value: any) => boolean | string;
  readonly group?: string;
}

/**
 * Property panel configuration
 */
export interface PropertyPanelConfig {
  readonly title: string;
  readonly properties: PropertyDefinition[];
  readonly onPropertyChange: (key: string, value: any) => void;
  readonly onDelete?: () => void;
  readonly onDuplicate?: () => void;
}

// =================================================================
// 5. BUILDER ACTIONS
// =================================================================

/**
 * Builder action types
 */
export type BuilderActionType =
  | 'ADD_FIELD'
  | 'REMOVE_FIELD'
  | 'UPDATE_FIELD'
  | 'MOVE_FIELD'
  | 'ADD_ROW'
  | 'REMOVE_ROW'
  | 'UPDATE_ROW'
  | 'MOVE_ROW'
  | 'SELECT_FIELD'
  | 'DESELECT'
  | 'UNDO'
  | 'REDO'
  | 'CLEAR'
  | 'LOAD'
  | 'SAVE';

/**
 * Base builder action
 */
export interface BuilderAction<T extends BuilderActionType = BuilderActionType> {
  readonly type: T;
  readonly payload?: any;
  readonly timestamp: number;
}

/**
 * Add field action
 */
export interface AddFieldAction extends BuilderAction<'ADD_FIELD'> {
  readonly payload: {
    readonly componentType: string;
    readonly rowIndex?: number;
    readonly position?: number;
  };
}

/**
 * Update field action
 */
export interface UpdateFieldAction extends BuilderAction<'UPDATE_FIELD'> {
  readonly payload: {
    readonly fieldId: string;
    readonly updates: Partial<FormFieldConfig>;
  };
}

/**
 * Move field action
 */
export interface MoveFieldAction extends BuilderAction<'MOVE_FIELD'> {
  readonly payload: {
    readonly fieldId: string;
    readonly fromRowId: string;
    readonly toRowId: string;
    readonly position: number;
  };
}

// =================================================================
// 6. EXPORT & SERIALIZATION
// =================================================================

/**
 * Export format types
 */
export type ExportFormat = 'json' | 'typescript' | 'javascript';

/**
 * Export options
 */
export interface ExportOptions {
  readonly format: ExportFormat;
  readonly pretty?: boolean;
  readonly includeMetadata?: boolean;
  readonly includeComments?: boolean;
}

/**
 * Serialized form builder data
 */
export interface SerializedFormBuilder {
  readonly version: string;
  readonly type: 'form';
  readonly id: string;
  readonly name: string;
  readonly metadata: BuilderMetadata;
  readonly config: {
    readonly formId: string;
    readonly rows: FormFieldRow[];
    readonly validation?: any;
  };
}

/**
 * Serialized workflow builder data
 */
export interface SerializedWorkflowBuilder {
  readonly version: string;
  readonly type: 'workflow';
  readonly id: string;
  readonly name: string;
  readonly metadata: BuilderMetadata;
  readonly config: WorkflowConfig;
}

/**
 * Union type for serialized data
 */
export type SerializedBuilder = SerializedFormBuilder | SerializedWorkflowBuilder;

// =================================================================
// 7. BUILDER CALLBACKS & EVENTS
// =================================================================

/**
 * Builder change event
 */
export interface BuilderChangeEvent {
  readonly type: 'change';
  readonly action: BuilderAction;
  readonly state: BuilderState;
}

/**
 * Builder save event
 */
export interface BuilderSaveEvent {
  readonly type: 'save';
  readonly data: SerializedBuilder;
  readonly timestamp: number;
}

/**
 * Builder export event
 */
export interface BuilderExportEvent {
  readonly type: 'export';
  readonly format: ExportFormat;
  readonly content: string;
  readonly timestamp: number;
}

/**
 * Builder event handler types
 */
export interface BuilderEventHandlers {
  readonly onChange?: (event: BuilderChangeEvent) => void;
  readonly onSave?: (event: BuilderSaveEvent) => void;
  readonly onExport?: (event: BuilderExportEvent) => void;
  readonly onError?: (error: Error) => void;
}

// =================================================================
// 8. BUILDER COMPONENT PROPS
// =================================================================

/**
 * Base builder props
 */
export interface BaseBuilderProps<T extends BuilderType> {
  readonly rilConfig: ril<any>;
  readonly initialState?: BaseBuilderState<T>;
  readonly readOnly?: boolean;
  readonly className?: string;
  readonly handlers?: BuilderEventHandlers;
}

/**
 * Form builder component props
 */
export interface FormBuilderProps extends BaseBuilderProps<'form'> {
  readonly initialForm?: form<any>;
  readonly paletteConfig?: Partial<ComponentPaletteConfig>;
  readonly showPreview?: boolean;
}

/**
 * Workflow builder component props
 */
export interface WorkflowBuilderProps extends BaseBuilderProps<'workflow'> {
  readonly initialFlow?: flow;
  readonly showPreview?: boolean;
}

// =================================================================
// 9. HISTORY & UNDO/REDO
// =================================================================

/**
 * History entry
 */
export interface HistoryEntry {
  readonly action: BuilderAction;
  readonly stateBefore: Partial<BuilderState>;
  readonly stateAfter: Partial<BuilderState>;
  readonly timestamp: number;
}

/**
 * History manager configuration
 */
export interface HistoryConfig {
  readonly maxSize?: number;
  readonly enablePersistence?: boolean;
}

/**
 * History state
 */
export interface HistoryState {
  readonly past: HistoryEntry[];
  readonly present: BuilderState;
  readonly future: HistoryEntry[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
