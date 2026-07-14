import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type React from 'react';
import type { FieldError } from 'rilaykit';

export interface FieldWrapperProps {
  id: string;
  label?: string;
  description?: string;
  required?: boolean;
  error?: FieldError[];
  touched?: boolean;
  isValidating?: boolean;
  children: React.ReactNode;
}

export function FieldWrapper({
  id,
  label,
  description,
  required,
  error,
  touched,
  isValidating,
  children,
}: FieldWrapperProps) {
  const hasError = Boolean(touched && error && error.length > 0);

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
      {isValidating && <p className="text-sm text-muted-foreground">Validating...</p>}
    </div>
  );
}
