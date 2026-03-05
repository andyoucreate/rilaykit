import type { ComponentRenderProps } from 'rilaykit';
import { Input } from '@/components/ui/input';

interface NumberInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
}

export function NumberInput({ id, props, value, onChange, onBlur, disabled, error, touched }: ComponentRenderProps<NumberInputProps>) {
  const hasError = touched && error && error.length > 0;

  return (
    <Input
      id={id}
      type="number"
      value={value != null ? String(value) : ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange?.(v === '' ? '' : Number(v));
      }}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      min={props.min}
      max={props.max}
      step={props.step}
      className={hasError ? 'border-destructive' : ''}
    />
  );
}
