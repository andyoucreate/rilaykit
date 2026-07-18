import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type React from 'react';
import type { FieldBinding } from 'rilaykit';

export interface FieldWrapperFieldProps {
  label?: string;
  description?: string;
  required?: boolean;
}

export interface FieldWrapperProps {
  id: string;
  props: FieldWrapperFieldProps;
  field?: FieldBinding;
  children: React.ReactNode;
}

export function hasFieldError(field?: FieldBinding): boolean {
  return Boolean(field?.touched && field?.error?.length);
}

export function FieldWrapper({ id, props, field, children }: FieldWrapperProps) {
  const { label, description, required } = props;
  const error = field?.error;
  const hasError = hasFieldError(field);

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id} className={cn(hasError && 'text-destructive')}>
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </Label>
      )}
      {children}
      {description && !hasError && <p className="text-sm text-muted-foreground">{description}</p>}
      {hasError && error && <p className="text-sm text-destructive">{error[0].message}</p>}
      {field?.isValidating && <p className="text-sm text-muted-foreground">Validating...</p>}
    </div>
  );
}
