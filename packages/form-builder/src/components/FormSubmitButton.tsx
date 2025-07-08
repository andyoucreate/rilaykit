import type { FormSubmitButtonRendererProps, RendererChildrenFunction } from '@rilaykit/core';
import { resolveRendererChildren } from '@rilaykit/core';
import type React from 'react';
import { useFormContext } from './FormProvider';

export interface FormSubmitButtonProps {
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<FormSubmitButtonRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function FormSubmitButton({ className, children, renderAs }: FormSubmitButtonProps) {
  const { formState, submit, formConfig } = useFormContext();

  const baseProps = {
    isSubmitting: formState.isSubmitting,
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    onSubmit: submit,
    className,
  };

  // If renderAs is 'children' or true, use children as renderer
  const shouldUseChildrenAsRenderer = renderAs === 'children' || renderAs === true;

  if (shouldUseChildrenAsRenderer) {
    if (typeof children !== 'function') {
      throw new Error(
        'When renderAs="children" is used, children must be a function that returns React elements'
      );
    }
    return children(baseProps);
  }

  // Default behavior: use configured renderer
  const renderer = formConfig.renderConfig?.submitButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No submitButtonRenderer configured for form "${formConfig.id}". Please configure a submitButtonRenderer using config.setSubmitButtonRenderer() or config.setFormRenderConfig().`
    );
  }

  // Resolve function children to React.ReactNode before passing to renderer
  const resolvedChildren = resolveRendererChildren(children, baseProps);

  const props: FormSubmitButtonRendererProps = {
    ...baseProps,
    children: resolvedChildren, // Always React.ReactNode
  };

  return renderer(props);
}

export default FormSubmitButton;
