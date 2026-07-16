import type React from 'react';
import type { ComponentRenderContext, RilayInstance } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import { toEmissionResult, validateNodeProps } from '../../errors/emission-error';
import type { ComponentNode } from '../../types/component-node';
import { EmissionErrorView } from './EmissionErrorView';
import { NodeBoundary } from './NodeBoundary';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

/**
 * The deepest node `renderNode` will recurse into. The tool schema is recursive
 * with no static bound (see component-node-schema.ts), so the bound lives here:
 * a node at this depth yields an EmissionErrorView instead of a stack overflow.
 */
export const MAX_NODE_DEPTH = 64;

function isNode(value: unknown): value is ComponentNode {
  return typeof value === 'object' && value !== null && typeof (value as ComponentNode).type === 'string';
}

/**
 * Renders one node. A failure here is LOCAL: it returns an error view rather than
 * throwing, so a sibling's typo cannot take down the tree. That is the spec's
 * "a failing node produces a structured error part, never a render crash".
 */
function renderNode(node: unknown, catalog: AnyCatalog, key: string, depth: number): React.ReactNode {
  if (depth >= MAX_NODE_DEPTH) {
    return (
      <EmissionErrorView
        key={key}
        result={toEmissionResult(`Component tree too deep: the maximum depth is ${MAX_NODE_DEPTH}`)}
      />
    );
  }

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

  let props: Record<string, unknown> = node.props ?? {};
  if (entry.propsSchema) {
    const validation = validateNodeProps(entry.propsSchema, node.props ?? {});
    if (!validation.ok) return <EmissionErrorView key={key} result={validation.result} />;
    // The PARSED value, never the raw props: zod strip mode only drops excess
    // keys (dangerouslySetInnerHTML, ...) in its output, not in its input.
    props = validation.value as Record<string, unknown>;
  }

  const Renderer = entry.renderer;
  if (!Renderer) {
    return (
      <EmissionErrorView key={key} result={toEmissionResult(`No renderer attached for component "${node.type}"`)} />
    );
  }

  if (node.children !== undefined && !Array.isArray(node.children)) {
    return (
      <EmissionErrorView
        key={key}
        result={toEmissionResult(
          `Invalid "children" on component "${node.type}": expected an array of component nodes, got ${typeof node.children}`
        )}
      />
    );
  }

  const children = node.children?.map((child, index) =>
    renderNode(child, catalog, `${key}.${index}`, depth + 1)
  );

  const context: ComponentRenderContext<Record<string, unknown>> = {
    id: node.type,
    props,
    children,
    meta: entry.meta,
  };

  return (
    <NodeBoundary key={key}>
      <Renderer {...context} />
    </NodeBoundary>
  );
}

export function ShowComponent({ node }: { readonly node: unknown }) {
  const catalog = useCatalog();
  return <>{renderNode(node, catalog, 'root', 0)}</>;
}
