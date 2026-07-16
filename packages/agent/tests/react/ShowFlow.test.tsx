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

function showFlow(
  schema: unknown,
  onResolve?: (id: string, output: unknown) => void,
  state: 'streaming' | 'ready' = 'ready'
) {
  return render(
    <Catalog value={catalog}>
      <Part
        part={{ type: 'tool', toolCallId: 'c1', name: 'show_flow', state, input: { schema } }}
        onResolve={onResolve}
      />
    </Catalog>
  );
}

const schema = {
  id: 'onboarding',
  name: 'Onboarding',
  steps: [
    {
      id: 'personal',
      title: 'Personal',
      form: { id: 'personal', fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }] },
    },
    {
      id: 'company',
      title: 'Company',
      form: { id: 'company', fields: [{ id: 'siren', type: 'text', props: { label: 'Siren' } }] },
    },
  ],
};

describe('show_flow built-in renderer (HITL)', () => {
  it('compiles the emitted schema and renders the first step through WorkflowProvider', () => {
    showFlow(schema);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Siren')).not.toBeInTheDocument();
  });

  it('navigates to the next step with the real Flow chrome', async () => {
    showFlow(schema);
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByLabelText('Siren')).toBeInTheDocument();
  });

  it('resolves { status: "submitted", values } with the ENGINE-VALIDATED step-keyed data on completion', async () => {
    const onResolve = vi.fn();
    showFlow(schema, onResolve);

    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByLabelText('Siren');
    await userEvent.type(screen.getByLabelText('Siren'), '123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', {
        status: 'submitted',
        values: { personal: { name: 'Karl' }, company: { siren: '123456789' } },
      })
    );
  });

  it('resolves { status: "cancelled" } — cancellation is in the contract from day one', async () => {
    const onResolve = vi.fn();
    showFlow(schema, onResolve);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { status: 'cancelled' });
  });

  it('renders a structured error for a malformed schema instead of crashing', () => {
    showFlow({
      id: 'bad',
      name: 'Bad',
      steps: [
        {
          id: 's',
          title: 'S',
          form: { id: 'f', fields: [{ id: 'x', type: 'nonexistent' }] },
        },
      ],
    });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });

  it('renders NOTHING while streaming — flows render at ready ONLY (deliberate spec cut)', () => {
    const { container } = showFlow(schema, undefined, 'streaming');
    expect(container).toBeEmptyDOMElement();
  });
});
