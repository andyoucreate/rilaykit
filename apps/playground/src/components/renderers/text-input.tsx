import type { ComponentRenderProps } from 'rilaykit';
import { Input } from '@/components/ui/input';

interface TextInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
}

export function TextInput({ id, props, value, onChange, onBlur, disabled, error, touched }: ComponentRenderProps<TextInputProps>) {
  const hasError = touched && error && error.length > 0;

  return (
    <Input
      id={id}
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      className={hasError ? 'border-destructive' : ''}
    />
  );
}
