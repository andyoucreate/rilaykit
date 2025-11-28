import type React from 'react';
import type { visualBuilder } from '../../builders/visual-builder';
import { getEditablePropsForComponent } from '../../utils/builder-helpers';

/**
 * PropertyPanel props
 */
export interface PropertyPanelProps<C extends Record<string, any>> {
  /** Visual builder instance */
  readonly builder: visualBuilder<C>;
  /** Callback when property is updated */
  readonly onPropertyUpdate: (fieldId: string, props: Record<string, any>) => void;
  /** Whether panel is disabled */
  readonly disabled?: boolean;
}

/**
 * Property panel for editing field properties
 *
 * Shows editable properties for the selected field.
 * Supports different editor types (text, number, boolean, etc.).
 *
 * @example
 * ```typescript
 * <PropertyPanel
 *   builder={builder}
 *   onPropertyUpdate={(fieldId, props) => {
 *     console.log('Updated:', fieldId, props);
 *   }}
 * />
 * ```
 */
export function PropertyPanel<C extends Record<string, any>>({
  builder,
  onPropertyUpdate,
  disabled = false,
}: PropertyPanelProps<C>): React.ReactElement {
  const selectedField = builder.getSelectedField();
  const rilConfig = builder.getRilConfig();

  if (!selectedField) {
    return (
      <div className="property-panel">
        <div className="property-panel__empty">
          <div className="property-panel__empty-icon">⚙️</div>
          <h3 className="property-panel__empty-title">No field selected</h3>
          <p className="property-panel__empty-description">
            Select a field from the canvas to edit its properties
          </p>
        </div>

        <style>{`
          .property-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            padding: 1rem;
          }

          .property-panel__empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            text-align: center;
          }

          .property-panel__empty-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
            opacity: 0.5;
          }

          .property-panel__empty-title {
            margin: 0 0 0.5rem 0;
            font-size: 1rem;
            font-weight: 600;
            color: #111827;
          }

          .property-panel__empty-description {
            margin: 0;
            font-size: 0.875rem;
            color: #6b7280;
          }
        `}</style>
      </div>
    );
  }

  const component = rilConfig.getComponent(selectedField.componentId);
  if (!component) {
    return <div>Component not found</div>;
  }

  const editableProps = getEditablePropsForComponent(component);

  const handlePropertyChange = (key: string, value: any) => {
    if (disabled) return;

    onPropertyUpdate(selectedField.id, {
      ...selectedField.props,
      [key]: value,
    });
  };

  return (
    <div className="property-panel">
      <div className="property-panel__header">
        <h3 className="property-panel__title">Properties</h3>
        <div className="property-panel__subtitle">{component.name}</div>
      </div>

      <div className="property-panel__content">
        {editableProps.length === 0 ? (
          <div className="property-panel__no-props">No editable properties</div>
        ) : (
          editableProps.map((propDef) => (
            <PropertyEditor
              key={propDef.key}
              definition={propDef}
              value={selectedField.props?.[propDef.key]}
              onChange={(value) => handlePropertyChange(propDef.key, value)}
              disabled={disabled}
            />
          ))
        )}
      </div>

      <style>{`
        .property-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .property-panel__header {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .property-panel__title {
          margin: 0 0 0.25rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }

        .property-panel__subtitle {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .property-panel__content {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .property-panel__no-props {
          padding: 2rem 1rem;
          text-align: center;
          color: #6b7280;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

/**
 * Property editor component
 */
interface PropertyEditorProps {
  readonly definition: any;
  readonly value: any;
  readonly onChange: (value: any) => void;
  readonly disabled?: boolean;
}

function PropertyEditor({
  definition,
  value,
  onChange,
  disabled,
}: PropertyEditorProps): React.ReactElement {
  const { label, editorType, helpText, placeholder, options } = definition;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;

    switch (editorType) {
      case 'number':
        onChange(newValue === '' ? undefined : Number(newValue));
        break;
      case 'boolean':
        onChange((e.target as HTMLInputElement).checked);
        break;
      default:
        onChange(newValue);
    }
  };

  const renderEditor = () => {
    switch (editorType) {
      case 'boolean':
        return (
          <label className="property-editor__checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={handleChange}
              disabled={disabled}
              className="property-editor__checkbox"
            />
            <span>{label}</span>
          </label>
        );

      case 'number':
        return (
          <input
            id={definition.key}
            type="number"
            value={value ?? ''}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            className="property-editor__input"
          />
        );

      case 'select':
        return (
          <select
            id={definition.key}
            value={value ?? ''}
            onChange={handleChange}
            disabled={disabled}
            className="property-editor__select"
          >
            <option value="">Select {label}</option>
            {options?.map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            id={definition.key}
            value={value ?? ''}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            rows={4}
            className="property-editor__textarea"
          />
        );

      default:
        return (
          <input
            id={definition.key}
            type="text"
            value={value ?? ''}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            className="property-editor__input"
          />
        );
    }
  };

  return (
    <div className="property-editor">
      {editorType !== 'boolean' && (
        <label htmlFor={definition.key} className="property-editor__label">
          {label}
        </label>
      )}
      {renderEditor()}
      {helpText && <div className="property-editor__help">{helpText}</div>}

      <style>{`
        .property-editor {
          margin-bottom: 1.5rem;
        }

        .property-editor__label {
          display: block;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .property-editor__input,
        .property-editor__select,
        .property-editor__textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          transition: border-color 0.2s;
        }

        .property-editor__input:focus,
        .property-editor__select:focus,
        .property-editor__textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .property-editor__input:disabled,
        .property-editor__select:disabled,
        .property-editor__textarea:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
        }

        .property-editor__textarea {
          resize: vertical;
          min-height: 80px;
        }

        .property-editor__checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          color: #374151;
        }

        .property-editor__checkbox {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }

        .property-editor__help {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
