import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function createRil() {
  return ril.create().component('text', { name: 'Text Input', renderer: MockText });
}

let capturedStore: FormStore | null = null;
function Probe() {
  capturedStore = useFormStoreApi();
  const isValid = useFormValid();
  return <output data-testid="isValid">{String(isValid)}</output>;
}

/**
 * R7-1 (HIGH): an in-flight async validation started for a torn streamed field
 * id `na` resolves AFTER the chunk completes the id to `name` (an in-place
 * rename). Its verdict must NOT write errors['na'] — a ghost key no live field
 * owns, that validateForm's allFields-only clearing can never reach, and that
 * _updateIsValid (counting every error entry) turns into a permanent invalid
 * wedge with no visible error. The verdict is dropped; the form stays usable.
 */
describe('an in-flight async validation racing a torn-id rename does not wedge the form', () => {
  it('drops the late verdict for the renamed-away id and keeps isValid recoverable', async () => {
    const config = createRil();

    let resolveValidation: ((issues: { message: string }[] | undefined) => void) | undefined;
    const bindings = {
      validators: {
        slow: () => ({
          '~standard': {
            version: 1 as const,
            vendor: 'test',
            validate: (_value: unknown) =>
              new Promise<{ issues?: { message: string }[] }>((res) => {
                resolveValidation = (issues) => res(issues ? { issues } : {});
              }),
          },
        }),
      },
    };

    const validation = { rules: [{ type: 'slow' }], validateOnChange: true };
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
    fireEvent.change(screen.getByTestId('input-na'), { target: { value: 'ab' } });
    await waitFor(() => expect(resolveValidation).toBeDefined());

    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());
    expect(screen.getByTestId('input-name')).toHaveValue('ab');

    await act(async () => {
      resolveValidation?.([{ message: 'Too short' }]);
      await Promise.resolve();
    });

    // FIXED behavior: no ghost key, the form is not wedged.
    const state = capturedStore?.getState();
    expect(state?.errors.na ?? []).toEqual([]);
    expect(screen.getByTestId('isValid').textContent).toBe('true');
  });
});
