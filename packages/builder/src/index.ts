/**
 * @rilaykit/builder
 *
 * Visual builder for creating forms and workflows with drag-and-drop functionality.
 *
 * @example
 * ```typescript
 * import { FormBuilder, visualBuilder } from '@rilaykit/builder';
 * import { ril } from '@rilaykit/core';
 *
 * // Create configuration
 * const rilConfig = ril.create()
 *   .addComponent('text', { name: 'Text', renderer: TextInput });
 *
 * // Use visual builder
 * <FormBuilder
 *   rilConfig={rilConfig}
 *   onSave={(event) => console.log('Saved:', event.data)}
 * />
 * ```
 */

// Core builder
export { visualBuilder } from './builders/visual-builder';

// React components
export { FormBuilder } from './components/FormBuilder/FormBuilder';
export type { FormBuilderProps } from './components/FormBuilder/FormBuilder';

export { ComponentPalette } from './components/FormBuilder/ComponentPalette';
export type { ComponentPaletteProps } from './components/FormBuilder/ComponentPalette';

export { FormCanvas } from './components/FormBuilder/FormCanvas';
export type { FormCanvasProps } from './components/FormBuilder/FormCanvas';

export { PropertyPanel } from './components/FormBuilder/PropertyPanel';
export type { PropertyPanelProps } from './components/FormBuilder/PropertyPanel';

// Hooks
export { useBuilderState, useBuilderStats, useSelectedField } from './hooks/useBuilderState';
export type { UseBuilderStateResult } from './hooks/useBuilderState';

// Utilities
export {
  serializeFormBuilder,
  deserializeFormBuilder,
  createDefaultMetadata,
  validateSerializedData,
  cloneSerializedData,
  toJSONString,
  fromJSONString,
} from './utils/serialization';

export {
  exportBuilder,
  downloadExport,
  copyToClipboard,
} from './utils/export';

export {
  createPaletteFromComponents,
  getEditablePropsForComponent,
  findFieldInBuilder,
  findRowInBuilder,
  getRowIndexByFieldId,
  validateFieldMove,
  getBuilderStats,
  sanitizeNameToId,
} from './utils/builder-helpers';

// Types
export type {
  BuilderType,
  BuilderMetadata,
  FormBuilderState,
  BaseBuilderState,
  BuilderState,
  DraggableItemType,
  DraggableItem,
  ComponentDraggableItem,
  FieldDraggableItem,
  PaletteComponent,
  PaletteCategory,
  ComponentPaletteConfig,
  PropertyPanelConfig,
  BuilderActionType,
  BuilderAction,
  ExportFormat,
  ExportOptions,
  SerializedFormBuilder,
  SerializedBuilder,
  BuilderChangeEvent,
  BuilderSaveEvent,
  BuilderExportEvent,
  BuilderEventHandlers,
  BaseBuilderProps,
} from './types';
