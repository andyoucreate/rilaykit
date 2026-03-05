import type { FieldRendererProps } from 'rilaykit';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function FieldWrapper({
  children,
  id,
  error,
  touched,
  isValidating,
  ...props
}: FieldRendererProps) {
  const label = props.label as string | undefined;
  const description = props.description as string | undefined;
  const required = props.required as boolean | undefined;
  const hasError = touched && error && error.length > 0;

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id} className={cn(hasError && 'text-destructive')}>
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </Label>
      )}
      {children}
      {description && !hasError && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {hasError && (
        <p className="text-sm text-destructive">{error[0].message}</p>
      )}
      {isValidating && (
        <p className="text-sm text-muted-foreground">Validating...</p>
      )}
    </div>
  );
}
