import type { FormBodyRendererProps } from 'rilaykit';

export function FormBodyRenderer({ children, className }: FormBodyRendererProps) {
  return <div className={className}>{children}</div>;
}
