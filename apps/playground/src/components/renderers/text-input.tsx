import { FieldWrapper, hasFieldError } from '@/components/renderers/field-wrapper';
import { Input } from '@/components/ui/input';
import type { ComponentRenderContext } from 'rilaykit';

interface TextInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
}

export function TextInput({ id, props, field }: ComponentRenderContext<TextInputProps>) {
  const hasError = hasFieldError(field);

  return (
    <FieldWrapper id={id} props={props} field={field}>
      <Input
        id={id}
        type="text"
        value={(field?.value as string) ?? ''}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
        disabled={field?.disabled}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        className={hasError ? 'border-destructive' : ''}
      />
    </FieldWrapper>
  );
}
