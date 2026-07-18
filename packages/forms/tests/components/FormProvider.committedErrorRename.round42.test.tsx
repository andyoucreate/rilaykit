import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Form } from '../../src/components/Form';
import { FormBody } from '../../src/components/FormBody';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';
import { type FormStore, useFormStoreApi, useFormValid } from '../../src/stores';

const MockText = ({ field, id }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

let capturedStore: FormStore | null = null;
function Probe() {
  capturedStore = useFormStoreApi();
  const isValid = useFormValid();
  return <output data-testid="isValid">{String(isValid)}</output>;
}

/**
 * Round 42 (#3): a SYNC validation COMMITS an error under a torn streamed id
 * `na` (not in-flight — already written to the store), THEN the chunk completes
 * the id to `name` (an in-place rename). The committed errors['na'] is now a
 * ghost key no live field owns; `_updateIsValid` counts every error entry, so it
 * would wedge the form invalid with no visible error. The rename must prune the
 * departed id's committed error/validation state.
 */
describe('a committed error under a torn-id that is then renamed does not wedge the form', () => {
  it('prunes the renamed-away id committed error and keeps isValid recoverable', async () => {
    const config = ril.create().component('text', { name: 'Text Input', renderer: MockText });

    // A synchronous validator that fails for a too-short value — commits immediately.
    const bindings = {
      validators: {
        minLen: () => ({
          '~standard': {
            version: 1 as const,
            vendor: 'test',
            validate: (value: unknown) =>
              String(value ?? '').length >= 3 ? { value } : { issues: [{ message: 'Too short' }] },
          },
        }),
      },
    };
    const validation = { rules: [{ type: 'minLen' }], validateOnChange: true };
    const tornChunk: FormSchema = {
      version: 1,
      id: 'contact-form',
      fields: [{ id: 'na', type: 'text', props: {}, validation }],
    };
    const completedChunk: FormSchema = {
      version: 1,
      id: 'contact-form',
      fields: [{ id: 'name', type: 'text', props: {}, validation }],
    };
    const torn = compileForm(tornChunk, config, { lenient: true, bindings });
    const completed = compileForm(completedChunk, config, { bindings });

    function Host() {
      const [compiled, setCompiled] = useState(torn);
      return (
        <>
          <button type="button" data-testid="complete" onClick={() => setCompiled(completed)}>
            complete
          </button>
          <Form formConfig={compiled.formConfig} defaultValues={compiled.defaultValues}>
            <FormBody />
            <Probe />
          </Form>
        </>
      );
    }

    render(<Host />);
    // Commit an error under `na` (too short) — sync validation writes it now.
    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'ab' } });
    await waitFor(() => expect(capturedStore?.getState().errors.na?.length).toBeGreaterThan(0));
    expect(screen.getByTestId('isValid').textContent).toBe('false');

    // Complete the id `na` -> `name` (in-place rename). The `ab` value carries over.
    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());

    // The committed errors['na'] must be pruned — no ghost key wedging isValid.
    await waitFor(() => {
      expect(capturedStore?.getState().errors.na ?? []).toEqual([]);
    });
  });
});
