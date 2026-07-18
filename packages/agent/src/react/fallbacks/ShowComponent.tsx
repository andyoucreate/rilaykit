import type { ComponentRenderContext, RilayInstance } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
  type EmissionResult,
  toEmissionResult,
  validateNodeProps,
} from '../../errors/emission-error';
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
  return (
    typeof value === 'object' && value !== null && typeof (value as ComponentNode).type === 'string'
  );
}

/**
 * Renders one node. A failure here is LOCAL: it returns an error view rather than
 * throwing, so a sibling's typo cannot take down the tree. That is the spec's
 * "a failing node produces a structured error part, never a render crash".
 */
function renderNode(
  node: unknown,
  catalog: AnyCatalog,
  key: string,
  depth: number,
  report: (result: EmissionResult) => void
): React.ReactNode {
  // Every error view is ALSO reported to the collector: the view keeps the
  // failure local in the DOM, the report feeds the retry channel (spec §8).
  const emissionError = (result: EmissionResult): React.ReactNode => {
    report(result);
    return <EmissionErrorView key={key} result={result} />;
  };

  if (depth >= MAX_NODE_DEPTH) {
    return emissionError(
      toEmissionResult(`Component tree too deep: the maximum depth is ${MAX_NODE_DEPTH}`)
    );
  }

  if (!isNode(node)) {
    return emissionError(
      toEmissionResult('Malformed component node: expected { type, props?, children? }')
    );
  }

  const entry = catalog.getComponent(node.type);
  if (!entry) {
    return emissionError(
      toEmissionResult(
        `Unknown component "${node.type}"`,
        catalog.getAllComponents().map((component) => component.type)
      )
    );
  }

  let props: Record<string, unknown> = node.props ?? {};
  if (entry.propsSchema) {
    const validation = validateNodeProps(entry.propsSchema, node.props ?? {});
    if (!validation.ok) return emissionError(validation.result);
    // The PARSED value, never the raw props: zod strip mode only drops excess
    // keys (dangerouslySetInnerHTML, ...) in its output, not in its input.
    props = validation.value as Record<string, unknown>;
  }

  const Renderer = entry.renderer;
  if (!Renderer) {
    return emissionError(toEmissionResult(`No renderer attached for component "${node.type}"`));
  }

  if (node.children !== undefined && !Array.isArray(node.children)) {
    return emissionError(
      toEmissionResult(
        `Invalid "children" on component "${node.type}": expected an array of component nodes, got ${typeof node.children}`
      )
    );
  }

  const children = node.children?.map((child, index) =>
    renderNode(child, catalog, `${key}.${index}`, depth + 1, report)
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

export interface ShowComponentProps {
  /** The agent-emitted component node, untrusted JSON. */
  readonly node: unknown;
  /**
   * The retry channel (spec §8), armed by <Part> at `ready` ONLY — at
   * `done`/`error` the call is already settled (rehydration) and must not
   * re-fire a tool result. `show_component` is display-only, so a VALID render
   * never resolves; only an emission error delivers, telling the model its
   * call failed and with what, so it can retry.
   */
  readonly resolve?: (output: unknown) => void;
}

export function ShowComponent({ node, resolve }: ShowComponentProps) {
  const catalog = useCatalog();
  // One-shot per tool call (<Part> keys the built-in on `toolCallId`): a
  // re-render with the same bad node delivers at most once, while a corrected
  // re-emission still recovers in place — the latch guards double-DELIVERY of
  // the error, never re-rendering.
  const errorDelivered = useRef(false);
  // `renderNode` runs eagerly (a plain function, not a component), so the
  // collection is complete before the effect below reads it. A tree can hold
  // several failing nodes; the FIRST error is the delivered one — each retry
  // round trip fixes at least that node, and the views keep showing the rest.
  const emissionErrors: EmissionResult[] = [];
  const tree = renderNode(node, catalog, 'root', 0, (result) => {
    emissionErrors.push(result);
  });
  const firstError = emissionErrors.length > 0 ? emissionErrors[0] : null;

  useEffect(() => {
    if (!resolve || !firstError || errorDelivered.current) return;
    errorDelivered.current = true;
    resolve({ status: 'error', ...firstError });
  }, [resolve, firstError]);

  return <>{tree}</>;
}
