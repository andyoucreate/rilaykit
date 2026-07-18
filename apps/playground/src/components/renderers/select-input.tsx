import { FieldWrapper, hasFieldError } from '@/components/renderers/field-wrapper';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ComponentRenderContext } from 'rilaykit';

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

export function SelectInput({ id, props, field }: ComponentRenderContext<SelectInputProps>) {
  const hasError = hasFieldError(field);
  const options = props.options ?? [];

  return (
    <FieldWrapper id={id} props={props} field={field}>
      <Select
        value={(field?.value as string) ?? ''}
        onValueChange={(v) => field?.onChange(v)}
        disabled={field?.disabled}
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
    </FieldWrapper>
  );
}
