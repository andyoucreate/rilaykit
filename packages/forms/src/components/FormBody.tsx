import type { ComponentRendererBaseProps, FormBodyRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { useFormConfigContext } from './FormProvider';
import FormRow from './FormRow';

export const FormBody = React.memo(function FormBody({
  className,
  ...props
}: ComponentRendererBaseProps<FormBodyRendererProps>) {
  const { formConfig } = useFormConfigContext();

  // Render all rows using FormRow component (default children)
  const defaultRenderedRows = useMemo<React.ReactNode>(
    () => formConfig.rows.map((row) => <FormRow key={row.id} row={row} />),
    [formConfig.rows]
  );

  // Memoize base props to avoid recreating object
  const baseProps: FormBodyRendererProps = useMemo(
    () => ({
      formConfig,
      children: defaultRenderedRows,
      className,
    }),
    [formConfig, defaultRenderedRows, className]
  );

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
});

export default FormBody;
