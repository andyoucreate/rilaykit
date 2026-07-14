import { FieldWrapper } from '@/components/renderers/field-wrapper';
import { Input } from '@/components/ui/input';
import type { ComponentRenderContext } from 'rilaykit';

interface EmailInputProps {
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export function EmailInput({ id, props, field }: ComponentRenderContext<EmailInputProps>) {
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
        type="email"
        value={(field?.value as string) ?? ''}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
        disabled={field?.disabled}
        placeholder={props.placeholder ?? 'email@example.com'}
        className={hasError ? 'border-destructive' : ''}
      />
    </FieldWrapper>
  );
}
