import type { ril } from '@rilaykit/core';
import React from 'react';
import type { visualBuilder } from '../../builders/visual-builder';
import { useBuilderState } from '../../hooks/useBuilderState';
import type { BuilderEventHandlers } from '../../types';
import { ComponentPalette } from './ComponentPalette';
import { FormCanvas } from './FormCanvas';
import { PropertyPanel } from './PropertyPanel';

/**
 * FormBuilder component props
 */
export interface FormBuilderProps<C extends Record<string, any> = Record<string, never>> {
  /** RilayKit configuration with component definitions */
  readonly rilConfig: ril<C>;
  /** Optional initial builder instance (for controlled mode) */
  readonly builder?: visualBuilder<C>;
  /** Callback when builder state changes (controlled mode) */
  readonly onChange?: (builder: visualBuilder<C>) => void;
  /** Event handlers for save, export, etc. */
  readonly handlers?: BuilderEventHandlers;
  /** Optional CSS class */
  readonly className?: string;
  /** Whether the builder is read-only */
  readonly readOnly?: boolean;
}

/**
 * Main FormBuilder component
 *
 * Visual form builder with drag & drop, component palette, and property editing.
 * Can be used in controlled or uncontrolled mode.
 *
 * Following Rilay philosophy:
 * - Simple API
 * - Type-safe
 * - Flexible (controlled/uncontrolled)
 * - Beautiful defaults
 *
 * @example Uncontrolled mode
 * ```typescript
 * <FormBuilder
 *   rilConfig={rilConfig}
 *   handlers={{
 *     onSave: (event) => console.log('Saved:', event.data),
 *   }}
 * />
 * ```
 *
 * @example Controlled mode
 * ```typescript
 * const [builder, setBuilder] = useState(() => visualBuilder.create(rilConfig));
 *
 * <FormBuilder
 *   rilConfig={rilConfig}
 *   builder={builder}
 *   onChange={setBuilder}
 * />
 * ```
 */
export function FormBuilder<C extends Record<string, any> = Record<string, never>>({
  rilConfig,
  builder: controlledBuilder,
  onChange,
  handlers,
  className = '',
  readOnly = false,
}: FormBuilderProps<C>): React.ReactElement {
  // Internal state management (uncontrolled mode)
  const { state, actions } = useBuilderState(rilConfig, controlledBuilder);

  // Use controlled or uncontrolled builder
  const builder = controlledBuilder || state.builder;

  // Handle builder changes
  const handleBuilderChange = React.useCallback(
    (newBuilder: visualBuilder<C>) => {
      if (onChange) {
        onChange(newBuilder);
      } else {
        actions.setBuilder(newBuilder);
      }
    },
    [onChange, actions]
  );

  // Handle component selection from palette
  const handleComponentSelect = React.useCallback(
    (componentType: string) => {
      if (readOnly) return;

      const newBuilder = builder.addComponent(componentType as keyof C & string);
      handleBuilderChange(newBuilder);

      // Trigger onChange event
      if (handlers?.onChange) {
        handlers.onChange({
          type: 'change',
          action: { type: 'ADD_FIELD', payload: { componentType }, timestamp: Date.now() },
          state: { builder: newBuilder } as any,
        });
      }
    },
    [builder, handleBuilderChange, handlers, readOnly]
  );

  // Handle field selection
  const handleFieldSelect = React.useCallback(
    (fieldId?: string) => {
      const newBuilder = builder.selectField(fieldId);
      handleBuilderChange(newBuilder);
    },
    [builder, handleBuilderChange]
  );

  // Handle field removal
  const handleFieldRemove = React.useCallback(
    (fieldId: string) => {
      if (readOnly) return;

      const newBuilder = builder.removeField(fieldId);
      handleBuilderChange(newBuilder);
    },
    [builder, handleBuilderChange, readOnly]
  );

  // Handle property update
  const handlePropertyUpdate = React.useCallback(
    (fieldId: string, props: Record<string, any>) => {
      if (readOnly) return;

      const newBuilder = builder.updateField(fieldId, props);
      handleBuilderChange(newBuilder);
    },
    [builder, handleBuilderChange, readOnly]
  );

  // Handle save
  const handleSave = React.useCallback(() => {
    if (handlers?.onSave) {
      const serialized = builder.toJSON();
      handlers.onSave({
        type: 'save',
        data: serialized,
        timestamp: Date.now(),
      });
    }
  }, [builder, handlers]);

  // Handle export
  const handleExport = React.useCallback(
    (format: 'json' | 'typescript' | 'javascript') => {
      if (handlers?.onExport) {
        const content = builder.toJSON(); // Simplified for MVP
        handlers.onExport({
          type: 'export',
          format,
          content: JSON.stringify(content, null, 2),
          timestamp: Date.now(),
        });
      }
    },
    [builder, handlers]
  );

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const newBuilder = builder.undo();
        handleBuilderChange(newBuilder);
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const newBuilder = builder.redo();
        handleBuilderChange(newBuilder);
      }

      // Ctrl/Cmd + S = Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [builder, handleBuilderChange, handleSave, readOnly]);

  return (
    <div className={`rilay-builder ${className}`}>
      <div className="rilay-builder__toolbar">
        <div className="rilay-builder__toolbar-left">
          <button
            type="button"
            onClick={() => handleBuilderChange(builder.undo())}
            disabled={!builder.canUndo() || readOnly}
            className="rilay-builder__button"
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={() => handleBuilderChange(builder.redo())}
            disabled={!builder.canRedo() || readOnly}
            className="rilay-builder__button"
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>
        </div>

        <div className="rilay-builder__toolbar-right">
          <button
            type="button"
            onClick={handleSave}
            className="rilay-builder__button rilay-builder__button--primary"
            disabled={readOnly}
          >
            💾 Save
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="rilay-builder__button"
          >
            📤 Export
          </button>
        </div>
      </div>

      <div className="rilay-builder__content">
        <aside className="rilay-builder__sidebar rilay-builder__sidebar--left">
          <ComponentPalette
            rilConfig={rilConfig}
            onComponentSelect={handleComponentSelect}
            disabled={readOnly}
          />
        </aside>

        <main className="rilay-builder__main">
          <FormCanvas
            builder={builder}
            onFieldSelect={handleFieldSelect}
            onFieldRemove={handleFieldRemove}
            readOnly={readOnly}
          />
        </main>

        <aside className="rilay-builder__sidebar rilay-builder__sidebar--right">
          <PropertyPanel
            builder={builder}
            onPropertyUpdate={handlePropertyUpdate}
            disabled={readOnly}
          />
        </aside>
      </div>

      <style>{`
        .rilay-builder {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #f5f5f5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .rilay-builder__toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          gap: 1rem;
        }

        .rilay-builder__toolbar-left,
        .rilay-builder__toolbar-right {
          display: flex;
          gap: 0.5rem;
        }

        .rilay-builder__button {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          background: white;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .rilay-builder__button:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .rilay-builder__button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rilay-builder__button--primary {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .rilay-builder__button--primary:hover:not(:disabled) {
          background: #2563eb;
          border-color: #2563eb;
        }

        .rilay-builder__content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .rilay-builder__sidebar {
          width: 280px;
          background: white;
          border-right: 1px solid #e5e7eb;
          overflow-y: auto;
        }

        .rilay-builder__sidebar--right {
          border-right: none;
          border-left: 1px solid #e5e7eb;
        }

        .rilay-builder__main {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}
