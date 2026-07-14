import { FieldWrapper } from '@/components/renderers/field-wrapper';
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
  const hasError = Boolean(field?.touched && field?.error?.length);
  const options = props.options ?? [];

  return (
    <FieldWrapper
      id={id}
      label={props.label}
      description={props.description}
      required={props.required}
      error={field?.error}
      touched={field?.touched}
      isValidating={field?.isValidating}
    >
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
