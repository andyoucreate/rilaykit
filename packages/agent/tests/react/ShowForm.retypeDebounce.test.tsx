import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('text', {
    description: 'Text',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <input
          data-error={JSON.stringify(field?.error ?? [])}
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </label>
    ),
  })
  .component('textarea', {
    description: 'Textarea',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <textarea
          data-error={JSON.stringify(field?.error ?? [])}
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </label>
    ),
  })
  .use(uiTools());

const validation = {
  rules: [{ type: 'minLength', params: { min: 5 }, message: 'Too short' }],
  debounceMs: 200,
};
// Form-level: validate from the first keystroke (debounced) so the retype-race
// path these tests pin is actually exercised without a blur.
const formValidation = { mode: 'onChange' as const };
const TORN = {
  schema: {
    id: 'bio-form',
    validation: formValidation,
    fields: [{ id: 'bio', props: { label: 'Bio' }, validation, type: 'text' }],
  },
};
const FULL = {
  schema: {
    id: 'bio-form',
    validation: formValidation,
    fields: [{ id: 'bio', props: { label: 'Bio' }, validation, type: 'textarea' }],
  },
};
const GROWN = {
  schema: {
    id: 'bio-form',
    validation: formValidation,
    fields: [
      { id: 'bio', props: { label: 'Bio' }, validation, type: 'text' },
      { id: 'extra', props: { label: 'Extra' }, type: 'text' },
    ],
  },
};
function partWith(input: unknown) {
  return {
    type: 'tool' as const,
    toolCallId: 'call-1',
    name: 'show_form',
    state: 'streaming' as const,
    input,
    rawInput: undefined,
  };
}

describe('debounced validation pending across a mid-stream retype', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a pending debounced run does NOT stamp the orphaned verdict onto the freshly retyped field', async () => {
    const { rerender } = render(
      <Catalog value={catalog}>
        <Part part={partWith(TORN)} />
      </Catalog>
    );
    const input = screen.getByLabelText('Bio');
    expect(input.tagName).toBe('INPUT');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ab' } });
    });
    rerender(
      <Catalog value={catalog}>
        <Part part={partWith(FULL)} />
      </Catalog>
    );
    const ta = screen.getByLabelText('Bio');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta).toHaveValue('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const errors = JSON.parse(screen.getByLabelText('Bio').getAttribute('data-error') ?? '[]');
    expect(errors).toEqual([]);
  });

  it('SWEEP: a pending debounced run across a GROWTH chunk still lands on the right field', async () => {
    const { rerender } = render(
      <Catalog value={catalog}>
        <Part part={partWith(TORN)} />
      </Catalog>
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'ab' } });
    });
    rerender(
      <Catalog value={catalog}>
        <Part part={partWith(GROWN)} />
      </Catalog>
    );
    expect(screen.getByLabelText('Extra')).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toHaveValue('ab');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const bioErrors = JSON.parse(screen.getByLabelText('Bio').getAttribute('data-error') ?? '[]');
    expect(bioErrors.map((e: { message: string }) => e.message)).toEqual(['Too short']);
  });
});
