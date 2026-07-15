import { ril } from '@rilaykit/core';
import { Form, FormList, compileForm } from '@rilaykit/forms';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Every key that resolves on `Object.prototype`. The store's repeatable tables
 * (`_repeatableOrder` / `_repeatableNextKey` / `_repeatableConfigs`) and the
 * compiled `formConfig.repeatableFields` table are plain objects indexed by a
 * repeatable id that came from an untrusted schema, so each of these keys must
 * be proven inert end-to-end on a LIVE form.
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

function makeSchema(repeatableId: string) {
  return {
    version: 1 as const,
    id: 'f',
    rows: [
      {
        kind: 'repeatable' as const,
        repeatable: {
          id: repeatableId,
          rows: [
            {
              kind: 'fields' as const,
              fields: [{ id: 'name', type: 'text', props: {} }],
            },
          ],
        },
      },
    ],
  };
}

describe('<FormList> with a prototype-key repeatable id', () => {
  for (const repeatableId of PROTOTYPE_KEYS) {
    it(`renders and appends for a repeatable named "${repeatableId}"`, () => {
      const { formConfig, defaultValues } = compileForm(makeSchema(repeatableId), makeCatalog());

      render(
        <Form of={formConfig} defaults={defaultValues}>
          <FormList id={repeatableId} />
        </Form>
      );

      const addButton = document.querySelector(`[data-form-list-add="${repeatableId}"]`);
      expect(addButton).not.toBeNull();

      const before = screen.queryAllByRole('textbox').length;
      fireEvent.click(addButton as HTMLElement);
      expect(screen.queryAllByRole('textbox').length).toBe(before + 1);
    });
  }
});
