import type { FormRowEntry } from '@rilaykit/core';
import { useMemo } from 'react';
import { useForm } from '../components/FormProvider';
import { visibleRowFields } from '../utils/visible-row-fields';

export type VisibleRow = FormRowEntry;

export function useFormRows(): VisibleRow[] {
  const { formConfig, conditionsHelpers } = useForm();

  return useMemo(() => {
    const rows: VisibleRow[] = [];
    for (const row of formConfig.rows) {
      if (row.kind === 'repeatable') {
        rows.push(row);
        continue;
      }
      const fields = visibleRowFields(row, conditionsHelpers);
      if (fields.length > 0) {
        rows.push({ ...row, fields });
      }
    }
    return rows;
  }, [formConfig.rows, conditionsHelpers]);
}
