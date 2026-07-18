import type { FormFieldConfig, FormFieldRow } from '@rilaykit/core';

export interface RowVisibilityHelpers {
  isFieldVisible: (fieldId: string) => boolean;
}

/**
 * Computes the condition-visible fields of a row.
 *
 * Callers must drop the row entirely when the result is empty to avoid
 * rendering empty wrapper divs (which would break gap/spacing selectors
 * in the data-attribute styling contract).
 */
export function visibleRowFields(
  row: FormFieldRow,
  helpers: RowVisibilityHelpers
): FormFieldConfig[] {
  return row.fields.filter((field) => helpers.isFieldVisible(field.id));
}
