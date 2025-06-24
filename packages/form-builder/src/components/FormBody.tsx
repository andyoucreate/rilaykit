import type { FormBodyRendererProps } from "@streamline/core";
import clsx from "clsx";

export interface FormBodyProps extends FormBodyRendererProps {}

export const DefaultFormBodyRenderer = ({
  formConfig,
  children,
  className,
}: FormBodyRendererProps) => {
  return (
    <div
      className={clsx("streamline-form-body", className)}
      data-form-id={formConfig.id}
    >
      {children}
    </div>
  );
};

export function FormBody(props: FormBodyProps) {
  const renderer =
    props.formConfig.renderConfig?.bodyRenderer || DefaultFormBodyRenderer;

  return renderer(props);
}

export default FormBody;
