import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';
import { type FormStore, useFieldState, useFormActions, useFormStoreApi } from '../../src/stores';

const MockTextInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label>{String(props.label ?? '')}</label>
    <input
      data-testid={`input-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  </div>
);

function createRil() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: MockTextInput,
    defaultProps: { label: '' },
  });
}

let rilConfig: ReturnType<typeof createRil>;

function buildFormA(): FormConfiguration {
  return form
    .create(rilConfig, 'formA')
    .add({ id: 'name', type: 'text', props: { label: 'Name' } })
    .addRepeatable('items', (r) =>
      r
        .add({ id: 'label', type: 'text', props: { label: 'L' } })
        .min(1)
        .defaultValue({ label: '' })
    )
    .build();
}

function buildFormB(): FormConfiguration {
  return form
    .create(rilConfig, 'formB')
    .add({ id: 'other', type: 'text', props: { label: 'Other' } })
    .addRepeatable('tags', (r) =>
      r
        .add({ id: 'tag', type: 'text', props: { label: 'T' } })
        .min(1)
        .defaultValue({ tag: '' })
    )
    .build();
}

let capturedStore: FormStore | null = null;

function IdChangeChild() {
  capturedStore = useFormStoreApi();
  const { reset } = useFormActions();
  const other = useFieldState('other');

  return (
    <div>
      <FormBody />
      <div data-testid="other-dirty">{String(other.dirty)}</div>
      <button type="button" data-testid="reset" onClick={() => reset()}>
        Reset
      </button>
    </div>
  );
}

describe("reset() after a form-id change restores the CURRENT form's defaults", () => {
  beforeEach(() => {
    rilConfig = createRil();
    capturedStore = null;
  });

  it("no-arg reset() must not leak the previous form's defaults", () => {
    const configA = buildFormA();
    const configB = buildFormB();

    const { rerender } = render(
      <FormProvider formConfig={configA} defaultValues={{ name: 'init' }}>
        <IdChangeChild />
      </FormProvider>
    );

    // Switch to form B (different id, different repeatable, different defaults).
    rerender(
      <FormProvider formConfig={configB} defaultValues={{ other: 'x' }}>
        <IdChangeChild />
      </FormProvider>
    );

    // No-arg reset must restore form B's defaults, not form A's.
    fireEvent.click(screen.getByTestId('reset'));

    const values = capturedStore?.getState().values ?? {};

    // No stale composite keys from form A's 'items' repeatable.
    expect(Object.keys(values).some((k) => k.startsWith('items['))).toBe(false);
    // No stale static default from form A.
    expect(values.name).toBeUndefined();
    // Form B's default is present and not dirty.
    expect(values.other).toBe('x');
    expect(screen.getByTestId('other-dirty')).toHaveTextContent('false');
  });
});
