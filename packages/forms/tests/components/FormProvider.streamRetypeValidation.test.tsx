import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Form } from '../../src/components/Form';
import { FormBody } from '../../src/components/FormBody';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';

const MockText = ({ field, id }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    data-error={JSON.stringify(field?.error ?? [])}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);
const MockTextarea = ({ field, id }: ComponentRenderContext) => (
  <textarea
    data-testid={`textarea-${id}`}
    data-error={JSON.stringify(field?.error ?? [])}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);
function createRil() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: MockText })
    .component('textarea', { name: 'Textarea', renderer: MockTextarea });
}

/**
 * R7-2 (in-flight variant): an async validation started for a field's PRE-retype
 * value resolves after a mid-stream RETYPE (`text`->`textarea`, id unchanged)
 * re-registers the field as a fresh empty control. The stale verdict must be
 * dropped, not written onto the new control the user never touched.
 */
describe('an in-flight async validation racing a mid-stream retype does not stamp the fresh control', () => {
  it('drops a verdict from a run whose component identity changed under it', async () => {
    const config = createRil();
    let resolveValidation: ((issues: { message: string }[] | undefined) => void) | undefined;
    const bindings = {
      validators: {
        slow: () => ({
          '~standard': {
            version: 1 as const,
            vendor: 'test',
            validate: (_v: unknown) =>
              new Promise<{ issues?: { message: string }[] }>((res) => {
                resolveValidation = (i) => res(i ? { issues: i } : {});
              }),
          },
        }),
      },
    };
    const validation = { rules: [{ type: 'slow' }], validateOnChange: true };
    const tornChunk: FormSchema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'bio', type: 'text', props: {}, validation }],
    };
    const completedChunk: FormSchema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'bio', type: 'textarea', props: {}, validation }],
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
          </Form>
        </>
      );
    }
    render(<Host />);
    fireEvent.change(screen.getByTestId('input-bio'), { target: { value: 'ab' } });
    await waitFor(() => expect(resolveValidation).toBeDefined());
    fireEvent.click(screen.getByTestId('complete'));
    await waitFor(() => expect(screen.getByTestId('textarea-bio')).toBeInTheDocument());
    expect(screen.getByTestId('textarea-bio')).toHaveValue('');
    await act(async () => {
      resolveValidation?.([{ message: 'Too short' }]);
      await Promise.resolve();
    });
    const errors = JSON.parse(
      screen.getByTestId('textarea-bio').getAttribute('data-error') ?? '[]'
    );
    expect(errors).toEqual([]);
  });
});
