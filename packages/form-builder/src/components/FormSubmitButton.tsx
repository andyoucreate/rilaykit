import type { FormSubmitButtonRendererProps } from "@streamline/core";
import clsx from "clsx";
import { useFormContext } from "./FormProvider";

export interface FormSubmitButtonProps
  extends Omit<
    FormSubmitButtonRendererProps,
    "isSubmitting" | "isValid" | "isDirty" | "onSubmit"
  > {
  text?: string;
  loadingText?: string;
  // Props héritées du contexte automatiquement
}

export const DefaultFormSubmitButtonRenderer = ({
  isSubmitting,
  isValid,
  isDirty,
  onSubmit,
  className,
  children,
}: FormSubmitButtonRendererProps) => {
  return (
    <button
      type="submit"
      onClick={onSubmit}
      disabled={isSubmitting || !isValid}
      className={clsx(
        "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200",
        className
      )}
    >
      {children || (
        <>
          {isSubmitting ? (
            <>
              <span className="inline-block animate-spin mr-2">⏳</span>
              Submitting...
            </>
          ) : (
            "Submit"
          )}
        </>
      )}
    </button>
  );
};

export function FormSubmitButton({
  text = "Submit",
  loadingText = "Submitting...",
  className,
  children,
}: FormSubmitButtonProps) {
  const { formState, submit, formConfig } = useFormContext();

  // Utilise le renderer personnalisé s'il est configuré, sinon utilise le défaut
  const renderer =
    formConfig.renderConfig?.submitButtonRenderer ||
    DefaultFormSubmitButtonRenderer;

  const props: FormSubmitButtonRendererProps = {
    isSubmitting: formState.isSubmitting,
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    onSubmit: submit,
    className,
    children: children || (
      <>
        {formState.isSubmitting ? (
          <>
            <span className="inline-block animate-spin mr-2">⏳</span>
            {loadingText}
          </>
        ) : (
          text
        )}
      </>
    ),
  };

  return renderer(props);
}

export default FormSubmitButton;
