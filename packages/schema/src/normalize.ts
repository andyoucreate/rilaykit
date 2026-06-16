import { type JsonPath, formatJsonPath } from './errors';
import type {
  RuntimeGraph,
  RuntimeGraphIndexes,
  RuntimeStep,
  SurfaceNode,
  SurfaceSchema,
} from './types';

const SCREEN_STEP_ID = '__screen';

export function normalizeSurface(surface: SurfaceSchema): RuntimeGraph {
  const steps = normalizeSteps(surface);
  const indexes = buildIndexes(steps);

  return {
    surfaceId: surface.id,
    mode: surface.mode,
    steps,
    indexes,
  };
}

function normalizeSteps(surface: SurfaceSchema): RuntimeStep[] {
  if (surface.mode === 'screen') {
    return [
      {
        id: SCREEN_STEP_ID,
        title: surface.title,
        description: surface.description,
        metadata: surface.metadata,
        nodes: cloneNodes(surface.nodes),
        implicit: true,
      },
    ];
  }

  return surface.steps.map((step) => ({
    ...step,
    nodes: cloneNodes(step.nodes),
  }));
}

function cloneNodes(nodes: readonly SurfaceNode[]): SurfaceNode[] {
  return nodes.map(cloneNode);
}

function cloneNode(node: SurfaceNode): SurfaceNode {
  if (node.kind === 'group') {
    return {
      ...node,
      nodes: cloneNodes(node.nodes),
    };
  }

  return node;
}

function buildIndexes(steps: readonly RuntimeStep[]): RuntimeGraphIndexes {
  const indexes: RuntimeGraphIndexes = {
    fields: {},
    actions: {},
    nodesByPath: {},
  };

  steps.forEach((step, stepIndex) => {
    const stepPath = ['steps', stepIndex] as const;

    indexes.nodesByPath[formatJsonPath(stepPath)] = step;
    indexNodes(step.nodes, [...stepPath, 'nodes'], indexes);
  });

  return indexes;
}

function indexNodes(
  nodes: readonly SurfaceNode[],
  nodesPath: readonly [...JsonPath, 'nodes'],
  indexes: RuntimeGraphIndexes
): void {
  nodes.forEach((node, nodeIndex) => {
    const nodePath = [...nodesPath, nodeIndex];

    indexes.nodesByPath[formatJsonPath(nodePath)] = node;
    indexNodeByKind(node, indexes);

    if (node.kind === 'group') {
      indexNodes(node.nodes, [...nodePath, 'nodes'], indexes);
    }
  });
}

function indexNodeByKind(node: SurfaceNode, indexes: RuntimeGraphIndexes): void {
  switch (node.kind) {
    case 'field':
      indexes.fields[node.id] = node;
      return;
    case 'action':
      if (node.id) {
        indexes.actions[node.id] = node;
      }
      return;
    case 'content':
    case 'group':
    case 'slot':
      return;
    default: {
      const exhaustive: never = node;
      void exhaustive;
    }
  }
}
