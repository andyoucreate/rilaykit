import type { ComponentRendererBaseProps, FormBodyRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useMemo } from 'react';
import { useFormContext } from './FormProvider';
import FormRow from './FormRow';

export function FormBody({
  className,
  ...props
}: ComponentRendererBaseProps<FormBodyRendererProps>) {
  const { formConfig } = useFormContext();

  // Render all rows using FormRow component (default children)
  const defaultRenderedRows = useMemo<React.ReactNode>(
    () => formConfig.rows.map((row) => <FormRow key={row.id} row={row} />),
    [formConfig.rows]
  );

  const baseProps: FormBodyRendererProps = {
    formConfig,
    children: defaultRenderedRows,
    className,
  };

  return (
    <ComponentRendererWrapper
      name="FormBody"
      renderer={formConfig.renderConfig?.bodyRenderer}
      props={baseProps}
      {...props}
    >
      {defaultRenderedRows}
    </ComponentRendererWrapper>
  );
}

export default FormBody;
