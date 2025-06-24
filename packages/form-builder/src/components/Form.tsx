import type { FormConfiguration } from "@streamline/core";
import { FormProvider, useFormContext } from "./FormProvider";
import { FormRenderer } from "./FormRenderer";

export interface FormProps {
  formConfig: FormConfiguration;
  defaultValues?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onFieldChange?: (
    fieldId: string,
    value: any,
    formData: Record<string, any>
  ) => void;
  className?: string;
  rowClassName?: string;
  showFieldErrors?: boolean;
  showValidationIndicators?: boolean;
  showSubmitButton?: boolean;
  submitButtonText?: string;
  submitButtonLoadingText?: string;
  submitButtonClassName?: string;
}

function FormContent({
  formConfig,
  className,
  rowClassName,
  showFieldErrors,
  showValidationIndicators,
  showSubmitButton,
  submitButtonText,
  submitButtonLoadingText,
  submitButtonClassName,
}: Omit<FormProps, "defaultValues" | "onSubmit" | "onFieldChange">) {
  return (
    <>
      <FormRenderer
        formConfig={formConfig}
        className={className}
        rowClassName={rowClassName}
        showFieldErrors={showFieldErrors}
        showValidationIndicators={showValidationIndicators}
        showSubmitButton={showSubmitButton}
        submitButtonProps={{
          text: submitButtonText,
          loadingText: submitButtonLoadingText,
          className: submitButtonClassName,
        }}
      />

      {/* Form State Debug Info (development only) */}
      {process.env.NODE_ENV === "development" && <FormDebugInfo />}
    </>
  );
}

function FormDebugInfo() {
  const { formState } = useFormContext();

  return (
    <details className="mt-6 p-4 bg-gray-100 rounded">
      <summary className="cursor-pointer font-medium">Form Debug Info</summary>
      <pre className="mt-2 text-sm overflow-auto">
        {JSON.stringify(
          {
            values: formState.values,
            errors: Object.fromEntries(
              Object.entries(formState.errors).filter(
                ([, errors]) => errors.length > 0
              )
            ),
            warnings: Object.fromEntries(
              Object.entries(formState.warnings).filter(
                ([, warnings]) => warnings.length > 0
              )
            ),
            touched: Array.from(formState.touched),
            isValidating: Array.from(formState.isValidating),
            isDirty: formState.isDirty,
            isValid: formState.isValid,
            isSubmitting: formState.isSubmitting,
          },
          null,
          2
        )}
      </pre>
    </details>
  );
}

export function Form({
  formConfig,
  defaultValues,
  onSubmit,
  onFieldChange,
  className,
  rowClassName,
  showFieldErrors = true,
  showValidationIndicators = true,
  showSubmitButton = true,
  submitButtonText,
  submitButtonLoadingText,
  submitButtonClassName,
}: FormProps) {
  return (
    <FormProvider
      formConfig={formConfig}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onFieldChange={onFieldChange}
      className="streamline-form"
    >
      <FormContent
        formConfig={formConfig}
        className={className}
        rowClassName={rowClassName}
        showFieldErrors={showFieldErrors}
        showValidationIndicators={showValidationIndicators}
        showSubmitButton={showSubmitButton}
        submitButtonText={submitButtonText}
        submitButtonLoadingText={submitButtonLoadingText}
        submitButtonClassName={submitButtonClassName}
      />
    </FormProvider>
  );
}

export default Form;
