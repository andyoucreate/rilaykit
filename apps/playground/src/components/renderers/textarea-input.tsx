import { FieldWrapper, hasFieldError } from '@/components/renderers/field-wrapper';
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
  const hasError = hasFieldError(field);

  return (
    <FieldWrapper id={id} props={props} field={field}>
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
