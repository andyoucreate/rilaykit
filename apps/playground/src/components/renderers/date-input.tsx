import { Input } from '@/components/ui/input';
import type { ComponentRenderProps } from 'rilaykit';

interface DateInputProps {
  label?: string;
  description?: string;
  required?: boolean;
  min?: string;
  max?: string;
}

export function DateInput({
  id,
  props,
  value,
  onChange,
  onBlur,
  disabled,
  error,
  touched,
}: ComponentRenderProps<DateInputProps>) {
  const hasError = touched && error && error.length > 0;

  return (
    <Input
      id={id}
      type="date"
      value={(value as string) ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      min={props.min}
      max={props.max}
      className={hasError ? 'border-destructive' : ''}
    />
  );
}
