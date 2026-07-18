import { ril } from '@rilaykit/core';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';
import { useFieldActions } from '../../src/stores';

/**
 * The host mirror must not have a blind window on mount.
 *
 * `onFieldChange` / `onFieldsRemove` are the ONLY channel through which a host
 * (a workflow step capturing its data) learns what the form holds. Registering
 * that subscription in a PASSIVE effect leaves a window between commit and the
 * scheduler's macrotask flush in which the form is already committed and
 * interactive while nothing is listening: every write landing there is silently
 * never mirrored — and, worse, it becomes the subscription's own `prevValues`
 * baseline, so it is lost forever rather than merely late.
 *
 * The window is not theoretical: a child that prefills on mount runs its
 * effects BEFORE its parent's, and a step re-keyed by a resolving persistence
 * load re-mounts the whole form under exactly these conditions.
 *
 * Same class, same cure as the form-id reset: a layout effect runs
 * synchronously after the commit, so the subscription is live before anything
 * can write.
 */

const catalog = ril.create().component('text', {
  name: 'Text',
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

const formConfig = form
  .create(catalog, 'mirror-form')
  .add({ id: 'name', type: 'text', props: {} })
  .build();

/** A child that prefills on mount — its passive effect runs before its parent's. */
function PrefillOnMount() {
  const { setValue } = useFieldActions('name');
  useEffect(() => {
    setValue('mounted-write');
  }, [setValue]);
  return null;
}

describe('FormProvider — mirror subscription window', () => {
  it('reports a value written by a child effect during mount', async () => {
    const onFieldChange = vi.fn();

    render(
      <FormProvider formConfig={formConfig} onFieldChange={onFieldChange}>
        <PrefillOnMount />
      </FormProvider>
    );

    await waitFor(() => expect(onFieldChange).toHaveBeenCalledTimes(1));
    expect(onFieldChange.mock.calls[0][0]).toBe('name');
    expect(onFieldChange.mock.calls[0][1]).toBe('mounted-write');
  });
});
