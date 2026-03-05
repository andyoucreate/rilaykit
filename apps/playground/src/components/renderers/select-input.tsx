import type { ComponentRenderProps } from 'rilaykit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: SelectOption[];
}

export function SelectInput({ id, props, value, onChange, disabled, error, touched }: ComponentRenderProps<SelectInputProps>) {
  const hasError = touched && error && error.length > 0;
  const options = props.options ?? [];

  return (
    <Select
      value={(value as string) ?? ''}
      onValueChange={(v) => onChange?.(v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={hasError ? 'border-destructive' : ''}>
        <SelectValue placeholder={props.placeholder ?? 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
