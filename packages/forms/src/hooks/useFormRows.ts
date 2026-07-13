import type { FormRowEntry } from '@rilaykit/core';
import { useMemo } from 'react';
import { useFormConfigContext } from '../components/FormProvider';

export type VisibleRow = FormRowEntry;

export function useFormRows(): VisibleRow[] {
  const { formConfig, conditionsHelpers } = useFormConfigContext();

  return useMemo(() => {
    const rows: VisibleRow[] = [];
    for (const row of formConfig.rows) {
      if (row.kind === 'repeatable') {
        rows.push(row);
        continue;
      }
      const fields = row.fields.filter((field) => conditionsHelpers.isFieldVisible(field.id));
      if (fields.length > 0) {
        rows.push({ ...row, fields });
      }
    }
    return rows;
  }, [formConfig.rows, conditionsHelpers]);
}
