import type { ComponentRendererBaseProps, FormBodyRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { useFormConfigContext } from './FormProvider';
import FormRow from './FormRow';
import { RepeatableField } from './repeatable-field';

export const FormBody = React.memo(function FormBody({
  className,
  ...props
}: ComponentRendererBaseProps<FormBodyRendererProps>) {
  const { formConfig } = useFormConfigContext();

  // Render all rows — dispatch by kind
  const defaultRenderedRows = useMemo<React.ReactNode>(
    () =>
      formConfig.rows.map((row) => {
        if (row.kind === 'repeatable') {
          return (
            <RepeatableField
              key={row.id}
              repeatableId={row.repeatable.id}
              repeatableConfig={row.repeatable}
            />
          );
        }
        return <FormRow key={row.id} row={row} />;
      }),
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
