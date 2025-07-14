import type { RendererChildrenFunction } from '../types';

// Helper function to resolve children (either React.ReactNode or function)
export function resolveRendererChildren<TProps>(
  children: React.ReactNode | RendererChildrenFunction<TProps> | undefined,
  props: TProps
): React.ReactNode {
  if (typeof children === 'function') {
    return children(props);
  }
  return children;
}
