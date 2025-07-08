import type { FormBodyRendererProps, RendererChildrenFunction } from '@rilaykit/core';
import { resolveRendererChildren } from '@rilaykit/core';
import { useMemo } from 'react';
import { useFormContext } from './FormProvider';
import FormRow from './FormRow';

export interface FormBodyProps {
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<FormBodyRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function FormBody({ className, children, renderAs }: FormBodyProps) {
  const { formConfig } = useFormContext();

  // Render all rows using FormRow component (default children)
  const defaultRenderedRows = useMemo(
    () => formConfig.rows.map((row) => <FormRow key={row.id} row={row} />),
    [formConfig.rows]
  );

  // If renderAs is 'children' or true, use children as renderer
  const shouldUseChildrenAsRenderer = renderAs === 'children' || renderAs === true;

  if (shouldUseChildrenAsRenderer) {
    if (typeof children !== 'function') {
      throw new Error(
        'When renderAs="children" is used, children must be a function that returns React elements'
      );
    }
    const baseProps = {
      formConfig,
      children: defaultRenderedRows, // Always React.ReactNode for renderer props
      className,
    };
    return children(baseProps);
  }

  // Default behavior: use configured renderer
  const bodyRenderer = formConfig.renderConfig?.bodyRenderer;

  if (!bodyRenderer) {
    throw new Error(
      `No bodyRenderer configured for form "${formConfig.id}". Please configure a bodyRenderer using config.setBodyRenderer() or config.setFormRenderConfig().`
    );
  }

  const baseProps = {
    formConfig,
    children: defaultRenderedRows, // Default children for props
    className,
  };

  // Resolve function children to React.ReactNode before passing to renderer
  const resolvedChildren = resolveRendererChildren(children, baseProps);

  const bodyProps: FormBodyRendererProps = {
    ...baseProps,
    children: resolvedChildren || defaultRenderedRows, // Always React.ReactNode
  };

  return bodyRenderer(bodyProps);
}

export default FormBody;
