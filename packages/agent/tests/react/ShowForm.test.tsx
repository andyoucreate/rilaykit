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
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'c1',
        { status: 'submitted', values: { name: 'Karl' } },
        'show_form'
      )
    );
  });

  it('resolves { status: "cancelled" } — cancellation is in the contract from day one', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { status: 'cancelled' }, 'show_form');
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
      fields: [{ id: 'name', type: 'text', props: { label: 'Name' }, conditions: { visible: {} } }],
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

  it('a cancel AFTER a resolved submit does not double-resolve — the answer stays the submitted one', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));

    // The chrome is still mounted (the part is still `ready`) — a stray cancel
    // click after the answer left must be swallowed, not become a second answer.
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await flushSubmissions();

    expect(onResolve).toHaveBeenCalledExactlyOnceWith(
      'c1',
      { status: 'submitted', values: { name: 'Karl' } },
      'show_form'
    );
  });

  it('a cancel RACING an in-flight submit yields exactly one answer', async () => {
    const onResolve = vi.fn();
    showForm(schema, onResolve);
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    // Click submit, then cancel BEFORE the async submit chain (validation →
    // onSubmit) settles. Whichever lands first wins; the loser is a no-op.
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await flushSubmissions();
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('a NEW tool call through the SAME <Part> gets a FRESH answer slot — call B resolves after call A already did', async () => {
    // "One answer per tool call" is scoped to the tool CALL, not the component
    // instance: a standalone <Part> re-rendered with a new toolCallId must not
    // inherit call A's settled state, or call B can never resolve (deadlock).
    const onResolve = vi.fn();
    const partFor = (toolCallId: string) => (
      <Catalog value={catalog}>
        <Part
          part={{ type: 'tool', toolCallId, name: 'show_form', state: 'ready', input: { schema } }}
          onResolve={onResolve}
        />
      </Catalog>
    );
    const { rerender } = render(partFor('call-a'));
    await userEvent.type(screen.getByLabelText('Name'), 'Ann');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call-a',
        { status: 'submitted', values: { name: 'Ann' } },
        'show_form'
      )
    );

    rerender(partFor('call-b'));
    await userEvent.type(screen.getByLabelText('Name'), 'Bob');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith(
        'call-b',
        { status: 'submitted', values: { name: 'Bob' } },
        'show_form'
      )
    );
    expect(onResolve).toHaveBeenCalledTimes(2);
  });

  it('mounts progressively while the part is streaming, with submit LOCKED until the input is provably complete', () => {
    // No rawInput accompanies the deep-partial input here, so there is no
    // completeness signal: the complete-looking field mounts (progressive
    // mounting, Task 12), but no answer may leave until the part is `ready`.
    showForm(schema, undefined, 'streaming');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it.each(['done', 'error'] as const)(
    'at %s: no form controls, no resolve — an explicit SettledToolResult summary (a rehydrated part must not re-arm the HITL loop)',
    (state) => {
      const onResolve = vi.fn();
      showForm(schema, onResolve, state);
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      const marker = document.querySelector('[data-part="tool"]');
      expect(marker).not.toBeNull();
      // Superset of the old DefaultTool marker: same styling hooks + a settled status.
      expect(marker?.getAttribute('data-tool-name')).toBe('show_form');
      expect(marker?.getAttribute('data-tool-state')).toBe(state);
      expect(marker?.hasAttribute('data-agent-settled')).toBe(true);
      expect(onResolve).not.toHaveBeenCalled();
    }
  );

  it('a CATALOG defect (async propsSchema) is not an emission error — it surfaces raw instead of blaming the model', () => {
    // Only SchemaValidationError — compileForm's single documented error
    // contract for bad EMISSIONS — may become an EmissionErrorView. A broken
    // catalog is the host's bug and must crash loudly, not be fed back to the
    // model as something to retry.
    const asyncSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => Promise.resolve({ value: {} }),
      },
    };
    const brokenCatalog = ril
      .create()
      .component('text', {
        description: 'Async propsSchema — a catalog defect',
        propsSchema: asyncSchema as never,
        renderer: () => <input />,
      })
      .use(uiTools());
    expect(() =>
      render(
        <Catalog value={brokenCatalog}>
          <Part
            part={{
              type: 'tool',
              toolCallId: 'c1',
              name: 'show_form',
              state: 'ready',
              input: { schema },
            }}
          />
        </Catalog>
      )
    ).toThrow();
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
  });

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
        expect(onResolve).toHaveBeenCalledExactlyOnceWith(
          'c1',
          { status: 'submitted', values: { name: 'Karl' } },
          'show_form'
        )
      );
    });

    it('skipInvalid: true with an invalid required field → submit does NOT resolve', async () => {
      const onResolve = vi.fn();
      showForm({ ...forcedSchema, submitOptions: { skipInvalid: true } }, onResolve);
      await userEvent.click(screen.getByRole('button', { name: /submit/i }));
      await flushSubmissions();
      expect(onResolve).not.toHaveBeenCalled();
    });
  });
});
