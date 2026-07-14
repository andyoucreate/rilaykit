import { FieldWrapper } from '@/components/renderers/field-wrapper';
import { Input } from '@/components/ui/input';
import type { ComponentRenderContext } from 'rilaykit';

interface DateInputProps {
  label?: string;
  description?: string;
  required?: boolean;
  min?: string;
  max?: string;
}

export function DateInput({ id, props, field }: ComponentRenderContext<DateInputProps>) {
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
        type="date"
        value={(field?.value as string) ?? ''}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
        disabled={field?.disabled}
        min={props.min}
        max={props.max}
        className={hasError ? 'border-destructive' : ''}
      />
    </FieldWrapper>
  );
}
