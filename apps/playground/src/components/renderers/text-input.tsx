import { FieldWrapper } from '@/components/renderers/field-wrapper';
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
