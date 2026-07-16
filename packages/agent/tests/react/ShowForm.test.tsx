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
  state: 'streaming' | 'ready' | 'done' | 'error' = 'ready'
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
    // Not just the container: a specific issue must be rendered, so a regression
    // emptying `issues[]` fails here.
    const issue = document.querySelector('[data-agent-error-path="fields[0].type"]');
    expect(issue).not.toBeNull();
    expect(issue).toHaveTextContent(
      'Unknown component type "nonexistent". Must be registered in ril config.'
    );
  });

  it('validates props of KNOWN components: a wrong prop key yields an emission error carrying per-issue expectedKeys', () => {
    showForm({ id: 'bad-props', fields: [{ id: 'x', type: 'text', props: { labell: 'Name' } }] });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    const issue = document.querySelector('[data-agent-error-path="fields[0].props.label"]');
    expect(issue).not.toBeNull();
    expect(issue?.getAttribute('data-agent-error-expected-keys')).toBe('label');
  });

  it('warning-severity issues do not block an otherwise-valid schema — only errors block', () => {
    // A leaf condition with no "field" is classified severity: 'warning' by
    // validateSchema; the form must still mount.
    showForm({
      id: 'warned',
      fields: [
        { id: 'name', type: 'text', props: { label: 'Name' }, conditions: { visible: {} } },
      ],
    });
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
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

  it.each(['done', 'error'] as const)(
    'at %s: no form controls, no resolve — only the bare DefaultTool marker (a rehydrated part must not re-arm the HITL loop)',
    (state) => {
      const onResolve = vi.fn();
      showForm(schema, onResolve, state);
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      const marker = document.querySelector('[data-part="tool"]');
      expect(marker).not.toBeNull();
      expect(marker?.getAttribute('data-tool-name')).toBe('show_form');
      expect(marker?.getAttribute('data-tool-state')).toBe(state);
      expect(onResolve).not.toHaveBeenCalled();
    }
  );

  describe('emitted submitOptions cannot skip engine validation', () => {
    const forcedSchema = {
      id: 'guarded',
      fields: [
        {
          id: 'name',
          type: 'text',
          props: { label: 'Name' },
          validation: { rules: ['required'] },
        },
      ],
      submitOptions: { force: true },
    };

    it('force: true with an invalid required field → submit does NOT resolve', async () => {
      const onResolve = vi.fn();
      showForm(forcedSchema, onResolve);
      await userEvent.click(screen.getByRole('button', { name: /submit/i }));
      await flushSubmissions();
      expect(onResolve).not.toHaveBeenCalled();
    });

    it('force: true with the field filled validly → resolves with the exact values', async () => {
      const onResolve = vi.fn();
      showForm(forcedSchema, onResolve);
      await userEvent.type(screen.getByLabelText('Name'), 'Karl');
      await userEvent.click(screen.getByRole('button', { name: /submit/i }));
      await waitFor(() =>
        expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', {
          status: 'submitted',
          values: { name: 'Karl' },
        })
      );
    });

    it('skipInvalid: true with an invalid required field → submit does NOT resolve', async () => {
      const onResolve = vi.fn();
      showForm(
        { ...forcedSchema, submitOptions: { skipInvalid: true } },
        onResolve
      );
      await userEvent.click(screen.getByRole('button', { name: /submit/i }));
      await flushSubmissions();
      expect(onResolve).not.toHaveBeenCalled();
    });
  });
});
