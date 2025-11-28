import type { FormFieldConfig, FormFieldRow } from '@rilaykit/core';
import type React from 'react';
import type { visualBuilder } from '../../builders/visual-builder';

/**
 * FormCanvas props
 */
export interface FormCanvasProps<C extends Record<string, any>> {
  /** Visual builder instance */
  readonly builder: visualBuilder<C>;
  /** Callback when field is selected */
  readonly onFieldSelect: (fieldId?: string) => void;
  /** Callback when field is removed */
  readonly onFieldRemove: (fieldId: string) => void;
  /** Whether canvas is read-only */
  readonly readOnly?: boolean;
}

/**
 * Form canvas for displaying and editing form fields
 *
 * Shows the current form structure with interactive field elements.
 * Supports field selection, removal, and basic drag & drop.
 *
 * @example
 * ```typescript
 * <FormCanvas
 *   builder={builder}
 *   onFieldSelect={(id) => console.log('Selected:', id)}
 *   onFieldRemove={(id) => console.log('Removed:', id)}
 *   onBuilderChange={setBuilder}
 * />
 * ```
 */
export function FormCanvas<C extends Record<string, any>>({
  builder,
  onFieldSelect,
  onFieldRemove,
  readOnly = false,
}: FormCanvasProps<C>): React.ReactElement {
  const rows = builder.getRows();
  const selectedFieldId = builder.getSelectedFieldId();

  // Handle click outside to deselect
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onFieldSelect(undefined);
    }
  };

  return (
    <div className="form-canvas" onMouseDown={handleCanvasClick}>
      {rows.length === 0 ? (
        <div className="form-canvas__empty">
          <div className="form-canvas__empty-icon">📝</div>
          <h3 className="form-canvas__empty-title">No fields yet</h3>
          <p className="form-canvas__empty-description">
            Select a component from the left sidebar to get started
          </p>
        </div>
      ) : (
        <div className="form-canvas__rows">
          {rows.map((row) => (
            <FormRowPreview
              key={row.id}
              row={row}
              selectedFieldId={selectedFieldId}
              onFieldSelect={onFieldSelect}
              onFieldRemove={onFieldRemove}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      <style>{`
        .form-canvas {
          min-height: 100%;
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .form-canvas__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 3rem;
          text-align: center;
        }

        .form-canvas__empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .form-canvas__empty-title {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .form-canvas__empty-description {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .form-canvas__rows {
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}

/**
 * Row preview component
 */
interface FormRowPreviewProps {
  readonly row: FormFieldRow;
  readonly selectedFieldId?: string;
  readonly onFieldSelect: (fieldId: string) => void;
  readonly onFieldRemove: (fieldId: string) => void;
  readonly readOnly?: boolean;
}

function FormRowPreview({
  row,
  selectedFieldId,
  onFieldSelect,
  onFieldRemove,
  readOnly,
}: FormRowPreviewProps): React.ReactElement {
  return (
    <div className="form-row">
      {row.fields.map((field) => (
        <FieldPreview
          key={field.id}
          field={field}
          isSelected={field.id === selectedFieldId}
          onSelect={() => onFieldSelect(field.id)}
          onRemove={() => onFieldRemove(field.id)}
          readOnly={readOnly}
        />
      ))}

      <style>{`
        .form-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
}

/**
 * Field preview component
 */
interface FieldPreviewProps {
  readonly field: FormFieldConfig;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly onRemove: () => void;
  readonly readOnly?: boolean;
}

function FieldPreview({
  field,
  isSelected,
  onSelect,
  onRemove,
  readOnly,
}: FieldPreviewProps): React.ReactElement {
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!readOnly) {
      onRemove();
    }
  };

  const label = field.props?.label || 'Untitled Field';
  const placeholder = field.props?.placeholder;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`field-preview ${isSelected ? 'field-preview--selected' : ''}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      // biome-ignore lint/a11y/useSemanticElements: we want to use a div as a button
      role="button"
      tabIndex={0}
      aria-label={`Field: ${label}`}
    >
      <div className="field-preview__header">
        <label htmlFor={field.id} className="field-preview__label">
          {label}
        </label>
        {!readOnly && (
          <button
            type="button"
            onClick={handleRemove}
            className="field-preview__remove"
            title="Remove field"
            aria-label="Remove field"
          >
            ×
          </button>
        )}
      </div>

      <div className="field-preview__input">
        <input
          type="text"
          placeholder={placeholder || 'Field preview'}
          disabled
          className="field-preview__input-element"
        />
      </div>

      {isSelected && (
        <div className="field-preview__selected-indicator">
          Selected - Edit properties in the right panel
        </div>
      )}

      <style>{`
        .field-preview {
          flex: 1;
          padding: 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .field-preview:hover {
          border-color: #3b82f6;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .field-preview--selected {
          border-color: #3b82f6;
          background: #eff6ff;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .field-preview__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .field-preview__label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .field-preview__remove {
          padding: 0.25rem 0.5rem;
          border: none;
          background: none;
          color: #ef4444;
          font-size: 1.25rem;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .field-preview__remove:hover {
          opacity: 1;
        }

        .field-preview__input {
          margin-bottom: 0;
        }

        .field-preview__input-element {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: #f9fafb;
        }

        .field-preview__selected-indicator {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #dbeafe;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          color: #1e40af;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
