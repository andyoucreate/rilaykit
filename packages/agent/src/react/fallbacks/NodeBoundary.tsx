import React from 'react';
import { toEmissionResult, type EmissionResult } from '../../errors/emission-error';
import { EmissionErrorView } from './EmissionErrorView';

interface NodeBoundaryProps {
  readonly children: React.ReactNode;
}

interface NodeBoundaryState {
  readonly result: EmissionResult | null;
}

/**
 * Per-node render containment. `validateNodeProps` catches bad DATA before the
 * renderer runs; this catches the renderer itself THROWING — the one failure mode
 * only a class-based error boundary can intercept (React has no hook for it).
 * A caught throw becomes the same structured EmissionErrorView as a validation
 * failure, so a rogue renderer cannot take down its siblings — the spec's
 * "a failing node produces a structured error part, never a render crash".
 */
export class NodeBoundary extends React.Component<NodeBoundaryProps, NodeBoundaryState> {
  override state: NodeBoundaryState = { result: null };

  static getDerivedStateFromError(error: unknown): NodeBoundaryState {
    return { result: toEmissionResult(error) };
  }

  override render(): React.ReactNode {
    if (this.state.result) return <EmissionErrorView result={this.state.result} />;
    return this.props.children;
  }
}
