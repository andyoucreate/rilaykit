import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('text', {
    description: 'Text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <input
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </label>
    ),
  })
  .use(uiTools());

function showForm(
  schema: unknown,
  onResolve?: (id: string, output: unknown) => void,
  state: 'streaming' | 'ready' = 'ready'
) {
  return render(
    <Catalog value={catalog}>
      <Part
        part={{ type: 'tool', toolCallId: 'c1', name: 'show_form', state, input: { schema } }}
        onResolve={onResolve}
      />
    </Catalog>
  );
}

/** Lets every in-flight submit chain (async validation → onSubmit) settle. */
async function flushSubmissions() {
  await waitFor(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const schema = {
  id: 'contact',
  fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
};

describe('show_form built-in renderer (HITL)', () => {
  it('compiles the emitted schema and renders it', () => {
    showForm(schema);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('resolves { status: "submitted", values } — the agent receives ENGINE-VALIDATED values', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', {
        status: 'submitted',
        values: { name: 'Karl' },
      })
    );
  });

  it('resolves { status: "cancelled" } — cancellation is in the contract from day one', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { status: 'cancelled' });
  });

  it('renders a structured error for a malformed schema instead of crashing', () => {
    showForm({ id: 'bad', fields: [{ id: 'x', type: 'nonexistent' }] });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });

  it('does not resolve twice on a double submit', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    const submit = screen.getByRole('button', { name: /submit/i });
    await userEvent.dblClick(submit);
    await flushSubmissions();
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('renders NOTHING while the part is streaming — progressive mounting is deferred to Task 12', () => {
    const { container } = showForm(schema, undefined, 'streaming');
    expect(container).toBeEmptyDOMElement();
  });
});
