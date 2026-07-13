import type { FormFieldConfig, FormRowEntry, RepeatableFieldConfig } from '@rilaykit/core';
import { useMemo } from 'react';
import { useFormConfigContext } from '../components/FormProvider';

export type VisibleRow =
  | { readonly kind: 'fields'; readonly id: string; readonly fields: FormFieldConfig[] }
  | { readonly kind: 'repeatable'; readonly id: string; readonly repeatable: RepeatableFieldConfig };

export function useFormRows(): VisibleRow[] {
  const { formConfig, conditionsHelpers } = useFormConfigContext();

  return useMemo(() => {
    const rows: VisibleRow[] = [];
    for (const row of formConfig.rows as FormRowEntry[]) {
      if (row.kind === 'repeatable') {
        rows.push({ kind: 'repeatable', id: row.id, repeatable: row.repeatable });
        continue;
      }
      const fields = row.fields.filter((field) => conditionsHelpers.isFieldVisible(field.id));
      if (fields.length > 0) {
        rows.push({ kind: 'fields', id: row.id, fields });
      }
    }
    return rows;
  }, [formConfig.rows, conditionsHelpers]);
}
