import React from 'react';
import { useFormRows, type VisibleRow } from '../hooks/useFormRows';
import { FormField } from './FormField';
import { FormList } from './FormList';

export interface FormBodyProps {
  children?: (ctx: { rows: VisibleRow[] }) => React.ReactNode;
  className?: string;
}

export const FormBody = React.memo(function FormBody({ children, className }: FormBodyProps) {
  const rows = useFormRows();

  if (children) {
    return <>{children({ rows })}</>;
  }

  return (
    <div className={className} data-form-body>
      {rows.map((row) =>
        row.kind === 'repeatable' ? (
          <FormList key={row.id} id={row.repeatable.id} />
        ) : (
          <div key={row.id} data-form-row={row.id}>
            {row.fields.map((field) => (
              <FormField key={field.id} id={field.id} />
            ))}
          </div>
        )
      )}
    </div>
  );
});

export default FormBody;
