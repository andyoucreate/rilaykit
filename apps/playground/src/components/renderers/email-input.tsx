import { Input } from '@/components/ui/input';
import type { ComponentRenderProps } from 'rilaykit';

interface EmailInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export function EmailInput({
  id,
  props,
  value,
  onChange,
  onBlur,
  disabled,
  error,
  touched,
}: ComponentRenderProps<EmailInputProps>) {
  const hasError = touched && error && error.length > 0;

  return (
    <Input
      id={id}
      type="email"
      value={(value as string) ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={props.placeholder ?? 'email@example.com'}
      className={hasError ? 'border-destructive' : ''}
    />
  );
}
