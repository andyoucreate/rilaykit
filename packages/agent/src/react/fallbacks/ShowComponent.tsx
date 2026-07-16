import type React from 'react';
import type { ComponentRenderContext, RilayInstance } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import { toEmissionResult, validateNodeProps } from '../../errors/emission-error';
import type { ComponentNode } from '../../types/component-node';
import { EmissionErrorView } from './EmissionErrorView';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

function isNode(value: unknown): value is ComponentNode {
  return typeof value === 'object' && value !== null && typeof (value as ComponentNode).type === 'string';
}

/**
 * Renders one node. A failure here is LOCAL: it returns an error view rather than
 * throwing, so a sibling's typo cannot take down the tree. That is the spec's
 * "a failing node produces a structured error part, never a render crash".
 */
function renderNode(node: unknown, catalog: AnyCatalog, key: string): React.ReactNode {
  if (!isNode(node)) {
    return (
      <EmissionErrorView
        key={key}
        result={toEmissionResult('Malformed component node: expected { type, props?, children? }')}
      />
    );
  }

  const entry = catalog.getComponent(node.type);
  if (!entry) {
    return (
      <EmissionErrorView
        key={key}
        result={toEmissionResult(
          `Unknown component "${node.type}"`,
          catalog.getAllComponents().map((component) => component.type)
        )}
      />
    );
  }

  if (entry.propsSchema) {
    const invalid = validateNodeProps(entry.propsSchema, node.props ?? {});
    if (invalid) return <EmissionErrorView key={key} result={invalid} />;
  }

  const Renderer = entry.renderer;
  if (!Renderer) {
    return (
      <EmissionErrorView key={key} result={toEmissionResult(`No renderer attached for component "${node.type}"`)} />
    );
  }

  const children = node.children?.map((child, index) => renderNode(child, catalog, `${key}.${index}`));

  const context: ComponentRenderContext<Record<string, unknown>> = {
    id: node.type,
    props: node.props ?? {},
    children,
    meta: entry.meta,
  };

  return <Renderer key={key} {...context} />;
}

export function ShowComponent({ node }: { readonly node: unknown }) {
  const catalog = useCatalog();
  return <>{renderNode(node, catalog, 'root')}</>;
}
