import type { FormRowRendererProps } from 'rilaykit';

export function FormRowRenderer({ children, className }: FormRowRendererProps) {
  return <div className={className}>{children}</div>;
}
