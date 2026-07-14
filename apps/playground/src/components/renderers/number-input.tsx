import { FieldWrapper } from '@/components/renderers/field-wrapper';
import { Input } from '@/components/ui/input';
import type { ComponentRenderContext } from 'rilaykit';

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

export function NumberInput({ id, props, field }: ComponentRenderContext<NumberInputProps>) {
  const hasError = Boolean(field?.touched && field?.error?.length);

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
      <Input
        id={id}
        type="number"
        value={field?.value != null ? String(field.value) : ''}
        onChange={(e) => {
          const v = e.target.value;
          field?.onChange(v === '' ? '' : Number(v));
        }}
        onBlur={() => field?.onBlur()}
        disabled={field?.disabled}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        min={props.min}
        max={props.max}
        step={props.step}
        className={hasError ? 'border-destructive' : ''}
      />
    </FieldWrapper>
  );
}
