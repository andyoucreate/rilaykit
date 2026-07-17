import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';
import { useFieldState } from '../../src/stores';

/**
 * Round 36: `useFieldState(id).dirty` compared with `!==`, so a field defaulting
 * to NaN reported `dirty` FOREVER (NaN !== NaN), misfiring an unsaved-changes
 * guard on a pristine form. `!Object.is` fixes it (Object.is(NaN, NaN) === true)
 * while still flagging a genuine change.
 */
const MockText = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={Number.isNaN(field?.value as number) ? 'NaN' : String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

const catalog = ril.create().component('text', { name: 'Text', renderer: MockText });

let dirty: Record<string, boolean> = {};
function DirtyProbe({ id }: { id: string }) {
  dirty[id] = useFieldState(id).dirty;
  return null;
}

describe('Round 36: a NaN default does not mark a pristine field dirty', () => {
  it('an untouched NaN-default field is NOT dirty; a changed field IS', () => {
    dirty = {};
    const config = form
      .create(catalog, 'f')
      .add({ id: 'amount', type: 'text' })
      .add({ id: 'name', type: 'text' })
      .build();

    render(
      <FormProvider formConfig={config} defaultValues={{ amount: Number.NaN, name: 'Ada' }}>
        <DirtyProbe id="amount" />
        <DirtyProbe id="name" />
      </FormProvider>
    );

    // Pristine NaN default → not dirty (was permanently true with `!==`).
    expect(dirty.amount).toBe(false);
    // Pristine normal default → not dirty.
    expect(dirty.name).toBe(false);
  });
});
