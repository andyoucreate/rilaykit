import type {
  FormConfiguration,
  FormFieldRow,
  StreamlineConfig,
} from "@streamline/core";
import React from "react";
import { FormField } from "./FormField";
import { useFormContext } from "./FormProvider";

export interface FormRowProps {
  row: FormFieldRow;
  className?: string;
}

/**
 * FormRow component that renders a row of fields
 */
export const FormRow: React.FC<FormRowProps> = ({ row, className = "" }) => {
  const { state, configuration, setValue, setTouched, isFieldValidating } =
    useFormContext();

  // Calculate spacing classes with Tailwind
  const getSpacingClass = (spacing?: string) => {
    switch (spacing) {
      case "tight":
        return "gap-2";
      case "loose":
        return "gap-6";
      default:
        return "gap-4";
    }
  };

  // Calculate alignment classes with Tailwind
  const getAlignmentClass = (alignment?: string) => {
    switch (alignment) {
      case "start":
        return "items-start";
      case "center":
        return "items-center";
      case "end":
        return "items-end";
      case "stretch":
        return "items-stretch";
      default:
        return "items-stretch";
    }
  };

  // Calculate column width for responsive layout with Tailwind
  const getColumnClass = (fieldsCount: number) => {
    if (fieldsCount === 1) return "w-full";
    if (fieldsCount === 2) return "w-full md:w-1/2";
    if (fieldsCount === 3) return "w-full md:w-1/3";
    return "w-full md:flex-1"; // fallback
  };

  const rowClasses = [
    "flex flex-col md:flex-row w-full",
    getSpacingClass(row.spacing),
    getAlignmentClass(row.alignment),
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const columnClass = getColumnClass(row.fields.length);

  return (
    <div
      className={rowClasses}
      data-row-id={row.id}
      data-fields-count={row.fields.length}
      data-max-columns={row.maxColumns}
    >
      {row.fields.map((fieldConfig) => (
        <div
          key={fieldConfig.id}
          className={`flex flex-col min-w-0 ${columnClass}`}
        >
          <FormField
            id={fieldConfig.id}
            formData={state.formData}
            errors={state.errors}
            touched={state.touched}
            disabled={state.isSubmitting}
            onChange={setValue}
            onBlur={setTouched}
            configuration={configuration}
            fieldConfig={fieldConfig}
            isValidating={isFieldValidating(fieldConfig.id)}
          />
        </div>
      ))}
    </div>
  );
};

FormRow.displayName = "FormRow";

export interface FormRendererProps {
  className?: string;
  showSubmitButton?: boolean;
  submitButtonText?: string;
  showResetButton?: boolean;
  resetButtonText?: string;
  customActions?: React.ReactNode;
  renderField?: (
    fieldId: string,
    fieldElement: React.ReactElement
  ) => React.ReactElement;
  renderRow?: (
    row: FormFieldRow,
    rowElement: React.ReactElement
  ) => React.ReactElement;
  onSubmit?: (event: React.FormEvent) => void;
  onReset?: (event: React.FormEvent) => void;
}

/**
 * FormRenderer component that renders the complete form
 * Uses FormProvider context for state management
 */
export const FormRenderer: React.FC<FormRendererProps> = ({
  className = "",
  showSubmitButton = true,
  submitButtonText = "Submit",
  showResetButton = false,
  resetButtonText = "Reset",
  customActions,
  renderField,
  renderRow,
  onSubmit,
  onReset,
}) => {
  const { state, formConfig, submitForm, resetForm, validateForm } =
    useFormContext();

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (onSubmit) {
      onSubmit(event);
    } else {
      await submitForm();
    }
  };

  // Handle form reset
  const handleReset = (event: React.FormEvent) => {
    event.preventDefault();

    if (onReset) {
      onReset(event);
    } else {
      resetForm();
    }
  };

  // Check if form has any errors
  const hasErrors = Object.values(state.errors).some(
    (errors) => errors.length > 0
  );

  const formClasses = [
    "flex flex-col gap-4 max-w-full",
    state.isSubmitting ? "opacity-80 pointer-events-none" : "",
    state.isDirty ? "form-dirty" : "form-pristine",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      className={formClasses}
      onSubmit={handleSubmit}
      onReset={handleReset}
      data-form-id={formConfig.id}
      noValidate
    >
      <div className="flex flex-col gap-4">
        {formConfig.rows.map((row) => {
          const rowElement = <FormRow key={row.id} row={row} />;

          // Allow custom row rendering
          return renderRow ? renderRow(row, rowElement) : rowElement;
        })}
      </div>

      {/* Form Actions */}
      {(showSubmitButton || showResetButton || customActions) && (
        <div className="flex gap-4 justify-end items-center flex-wrap pt-4 border-t border-gray-200 mt-4">
          {showResetButton && (
            <button
              type="reset"
              className="px-6 py-3 border border-gray-300 rounded-md bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              disabled={state.isSubmitting || !state.isDirty}
            >
              {resetButtonText}
            </button>
          )}

          {showSubmitButton && (
            <button
              type="submit"
              className="px-6 py-3 border border-blue-600 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 hover:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              disabled={state.isSubmitting || hasErrors}
            >
              {state.isSubmitting ? "Submitting..." : submitButtonText}
            </button>
          )}

          {customActions}
        </div>
      )}
    </form>
  );
};

FormRenderer.displayName = "FormRenderer";

export interface FormWithProviderProps extends FormRendererProps {
  configuration: StreamlineConfig;
  formConfig: FormConfiguration;
  initialData?: Record<string, any>;
  onFormSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onFormValidate?: (data: Record<string, any>) => any;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
}

/**
 * FormWithProvider component that wraps FormRenderer with FormProvider
 * Use this for standalone forms that don't already have a FormProvider
 */
export const FormWithProvider: React.FC<FormWithProviderProps> = ({
  configuration,
  formConfig,
  initialData,
  onFormSubmit,
  onFormValidate,
  validateOnChange,
  validateOnBlur,
  debounceMs,
  ...rendererProps
}) => {
  // Import FormProvider here to avoid circular dependencies
  const { FormProvider } = require("./FormProvider");

  return (
    <FormProvider
      configuration={configuration}
      formConfig={formConfig}
      initialData={initialData}
      onSubmit={onFormSubmit}
      onValidate={onFormValidate}
      validateOnChange={validateOnChange}
      validateOnBlur={validateOnBlur}
      debounceMs={debounceMs}
    >
      <FormRenderer {...rendererProps} />
    </FormProvider>
  );
};

FormWithProvider.displayName = "FormWithProvider";
