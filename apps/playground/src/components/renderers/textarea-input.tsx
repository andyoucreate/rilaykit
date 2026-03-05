import { Textarea } from '@/components/ui/textarea';
import type { ComponentRenderProps } from 'rilaykit';

interface TextareaInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  rows?: number;
}

export function TextareaInput({
  id,
  props,
  value,
  onChange,
  onBlur,
  disabled,
  error,
  touched,
}: ComponentRenderProps<TextareaInputProps>) {
  const hasError = touched && error && error.length > 0;

  return (
    <Textarea
      id={id}
      value={(value as string) ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={props.placeholder}
      rows={props.rows ?? 4}
      className={hasError ? 'border-destructive' : ''}
    />
  );
}
