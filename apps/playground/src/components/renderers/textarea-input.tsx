import { FieldWrapper } from '@/components/renderers/field-wrapper';
import { Textarea } from '@/components/ui/textarea';
import type { ComponentRenderContext } from 'rilaykit';

interface TextareaInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  rows?: number;
}

export function TextareaInput({ id, props, field }: ComponentRenderContext<TextareaInputProps>) {
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
      <Textarea
        id={id}
        value={(field?.value as string) ?? ''}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
        disabled={field?.disabled}
        placeholder={props.placeholder}
        rows={props.rows ?? 4}
        className={hasError ? 'border-destructive' : ''}
      />
    </FieldWrapper>
  );
}
