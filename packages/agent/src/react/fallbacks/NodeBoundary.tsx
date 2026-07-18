import React from 'react';
import { type EmissionResult, toEmissionResult } from '../../errors/emission-error';
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
 *
 * KNOWN LIMITATION (accepted for P3): the boundary is STICKY. Once a node's
 * renderer throws, the error view persists for this boundary instance's
 * lifetime — a public consumer re-rendering the same <Part> with corrected
 * input keeps seeing the error, because the caught state is never reset
 * (React has no built-in reset hook for getDerivedStateFromError). The
 * nominal pipeline is unaffected: a corrected emission arrives as a NEW tool
 * call, whose new toolCallId keys a fresh <Part> subtree — and with it a
 * fresh boundary. If a live-mutation host ever needs in-place recovery, the
 * fix is a reset keyed on node identity (getDerivedStateFromProps), not a
 * redesign.
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
