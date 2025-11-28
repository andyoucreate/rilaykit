import type { ComponentConfig, ril } from '@rilaykit/core';
import React from 'react';
import type { PaletteCategory } from '../../types';
import { createPaletteFromComponents } from '../../utils/builder-helpers';

/**
 * ComponentPalette props
 */
export interface ComponentPaletteProps {
  /** RilayKit configuration */
  readonly rilConfig: ril<any>;
  /** Callback when component is selected */
  readonly onComponentSelect: (componentType: string) => void;
  /** Whether the palette is disabled */
  readonly disabled?: boolean;
}

/**
 * Component palette for selecting and adding components
 *
 * Displays available components organized by category.
 * Components are auto-discovered from ril configuration.
 *
 * @example
 * ```typescript
 * <ComponentPalette
 *   rilConfig={rilConfig}
 *   onComponentSelect={(type) => console.log('Selected:', type)}
 * />
 * ```
 */
export function ComponentPalette({
  rilConfig,
  onComponentSelect,
  disabled = false,
}: ComponentPaletteProps): React.ReactElement {
  // Get all components and organize by category
  const categories = React.useMemo(() => {
    const components = rilConfig.getAllComponents();
    return createPaletteFromComponents(components);
  }, [rilConfig]);

  // Search state
  const [searchQuery, setSearchQuery] = React.useState('');

  // Filter categories and components by search
  const filteredCategories = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return categories;
    }

    const query = searchQuery.toLowerCase();

    return categories
      .map((category) => ({
        ...category,
        components: category.components.filter(
          (component) =>
            component.name.toLowerCase().includes(query) ||
            component.description?.toLowerCase().includes(query) ||
            component.tags?.some((tag: string) => tag.toLowerCase().includes(query))
        ),
      }))
      .filter((category) => category.components.length > 0);
  }, [categories, searchQuery]);

  // Handle component click
  const handleComponentClick = (componentType: string) => {
    if (disabled) return;
    onComponentSelect(componentType);
  };

  return (
    <div className="component-palette">
      <div className="component-palette__header">
        <h3 className="component-palette__title">Components</h3>
        <input
          type="text"
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="component-palette__search"
          disabled={disabled}
        />
      </div>

      <div className="component-palette__content">
        {filteredCategories.length === 0 ? (
          <div className="component-palette__empty">
            {searchQuery ? 'No components found' : 'No components available'}
          </div>
        ) : (
          filteredCategories.map((category) => (
            <PaletteCategorySection
              key={category.id}
              category={category}
              onComponentClick={handleComponentClick}
              disabled={disabled}
            />
          ))
        )}
      </div>

      <style>{`
        .component-palette {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .component-palette__header {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .component-palette__title {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }

        .component-palette__search {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .component-palette__search:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .component-palette__content {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }

        .component-palette__empty {
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
 * Category section component
 */
interface PaletteCategorySectionProps {
  readonly category: PaletteCategory;
  readonly onComponentClick: (componentType: string) => void;
  readonly disabled?: boolean;
}

function PaletteCategorySection({
  category,
  onComponentClick,
  disabled,
}: PaletteCategorySectionProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <div className="palette-category">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="palette-category__header"
        disabled={disabled}
      >
        <span className="palette-category__icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="palette-category__name">{category.name}</span>
        <span className="palette-category__count">({category.components.length})</span>
      </button>

      {isExpanded && (
        <div className="palette-category__items">
          {category.components.map((component) => (
            <ComponentPaletteItem
              key={component.id}
              component={component.config}
              onClick={() => onComponentClick(component.type)}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      <style>{`
        .palette-category {
          margin-bottom: 0.5rem;
        }

        .palette-category__header {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          text-align: left;
          transition: background 0.2s;
        }

        .palette-category__header:hover:not(:disabled) {
          background: #f9fafb;
        }

        .palette-category__header:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .palette-category__icon {
          margin-right: 0.5rem;
          font-size: 0.75rem;
        }

        .palette-category__name {
          flex: 1;
        }

        .palette-category__count {
          color: #9ca3af;
          font-size: 0.75rem;
        }

        .palette-category__items {
          padding: 0.25rem 0;
        }
      `}</style>
    </div>
  );
}

/**
 * Individual component item
 */
interface ComponentPaletteItemProps {
  readonly component: ComponentConfig;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

function ComponentPaletteItem({
  component,
  onClick,
  disabled,
}: ComponentPaletteItemProps): React.ReactElement {
  const icon = component.builder?.icon;
  const description = component.description;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="palette-item"
      title={description}
    >
      {icon && <span className="palette-item__icon">{icon}</span>}
      <div className="palette-item__content">
        <div className="palette-item__name">{component.name}</div>
        {description && <div className="palette-item__description">{description}</div>}
      </div>

      <style>{`
        .palette-item {
          display: flex;
          align-items: flex-start;
          width: 100%;
          padding: 0.75rem;
          margin: 0.25rem 0;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
          background: white;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }

        .palette-item:hover:not(:disabled) {
          border-color: #3b82f6;
          background: #eff6ff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .palette-item:active:not(:disabled) {
          transform: translateY(1px);
        }

        .palette-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .palette-item__icon {
          margin-right: 0.75rem;
          font-size: 1.25rem;
        }

        .palette-item__content {
          flex: 1;
          min-width: 0;
        }

        .palette-item__name {
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
          margin-bottom: 0.125rem;
        }

        .palette-item__description {
          font-size: 0.75rem;
          color: #6b7280;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </button>
  );
}
