import { ril } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import { Form, FormField } from '@rilaykit/forms/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Companion to FormList.prototype-keys: the store's per-field tables
 * (`values` / `errors` / `touched` / `validationStates` / `_fieldConditions` /
 * `_fieldProps`) are plain objects indexed by a FIELD id that came from an
 * untrusted schema. Read by plain index, a field named `toString` resolves the
 * inherited method — `_fieldConditions.toString` is truthy but has no `visible`
 * key, so the field renders as HIDDEN and silently disappears from the form.
 */
const PROTOTYPE_KEYS = ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'];

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: ({ id, field }) => (
      <input
        data-testid={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
      />
    ),
  });
}

describe('<FormField> with a prototype-key field id', () => {
  for (const fieldId of PROTOTYPE_KEYS) {
    it(`renders and round-trips a value for a field named "${fieldId}"`, () => {
      const { formConfig, defaultValues } = compileForm(
        { version: 1, id: 'f', fields: [{ id: fieldId, type: 'text', props: {} }] },
        makeCatalog()
      );

      render(
        <Form of={formConfig} defaults={defaultValues}>
          <FormField id={fieldId} />
        </Form>
      );

      const input = screen.getByTestId(fieldId) as HTMLInputElement;
      expect(input.value).toBe('');

      fireEvent.change(input, { target: { value: 'typed' } });
      expect((screen.getByTestId(fieldId) as HTMLInputElement).value).toBe('typed');
    });
  }
});
