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
  state: 'streaming' | 'ready' | 'done' | 'error' = 'ready'
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
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'c1',
        {
          status: 'submitted',
          values: { personal: { name: 'Karl' }, company: { siren: '123456789' } },
        },
        'show_flow'
      )
    );
  });

  it('resolves { status: "cancelled" } — cancellation is in the contract from day one', async () => {
    const onResolve = vi.fn();
    showFlow(schema, onResolve);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { status: 'cancelled' }, 'show_flow');
  });

  it('a cancel AFTER completion does not double-resolve — one answer per tool call', async () => {
    const onResolve = vi.fn();
    showFlow(
      {
        id: 'quick',
        name: 'Quick',
        steps: [
          {
            id: 'only',
            title: 'Only',
            form: { id: 'f', fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }] },
          },
        ],
      },
      onResolve
    );
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith(
      'c1',
      { status: 'submitted', values: { only: { name: 'Karl' } } },
      'show_flow'
    );
  });

  it('a CATALOG defect (async propsSchema) is not an emission error — it surfaces raw instead of blaming the model', () => {
    // Only SchemaValidationError — compileFlow's single documented error
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
              name: 'show_flow',
              state: 'ready',
              input: { schema },
            }}
          />
        </Catalog>
      )
    ).toThrow();
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
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
    // Not just the container: a specific issue must be rendered, so a regression
    // emptying `issues[]` fails here.
    const issue = document.querySelector('[data-agent-error-path="steps[0].form.fields[0].type"]');
    expect(issue).not.toBeNull();
    expect(issue).toHaveTextContent(
      'Unknown component type "nonexistent". Must be registered in ril config.'
    );
  });

  it('validates props of KNOWN components: a wrong prop key yields an emission error carrying per-issue expectedKeys', () => {
    showFlow({
      id: 'bad-props',
      name: 'Bad props',
      steps: [
        {
          id: 's',
          title: 'S',
          form: { id: 'f', fields: [{ id: 'x', type: 'text', props: { labell: 'Name' } }] },
        },
      ],
    });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    const issue = document.querySelector(
      '[data-agent-error-path="steps[0].form.fields[0].props.label"]'
    );
    expect(issue).not.toBeNull();
    expect(issue?.getAttribute('data-agent-error-expected-keys')).toBe('label');
  });

  it('renders NOTHING while streaming — flows render at ready ONLY (deliberate spec cut)', () => {
    const { container } = showFlow(schema, undefined, 'streaming');
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['done', 'error'] as const)(
    'at %s: no flow controls, no resolve — an explicit SettledToolResult summary (a rehydrated part must not re-arm the HITL loop)',
    (state) => {
      const onResolve = vi.fn();
      showFlow(schema, onResolve, state);
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      const marker = document.querySelector('[data-part="tool"]');
      expect(marker).not.toBeNull();
      // Superset of the old DefaultTool marker: same styling hooks + a settled status.
      expect(marker?.getAttribute('data-tool-name')).toBe('show_flow');
      expect(marker?.getAttribute('data-tool-state')).toBe(state);
      expect(marker?.hasAttribute('data-agent-settled')).toBe(true);
      expect(onResolve).not.toHaveBeenCalled();
    }
  );

  it('a step form emitting submitOptions.force cannot bypass engine validation', async () => {
    const onResolve = vi.fn();
    showFlow(
      {
        id: 'guarded',
        name: 'Guarded',
        steps: [
          {
            id: 'only',
            title: 'Only',
            form: {
              id: 'f',
              fields: [
                {
                  id: 'name',
                  type: 'text',
                  props: { label: 'Name' },
                  validation: { rules: ['required'] },
                },
              ],
              submitOptions: { force: true },
            },
          },
        ],
      },
      onResolve
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    // Let any in-flight submit chain (async validation → completion) settle.
    await waitFor(() => Promise.resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResolve).not.toHaveBeenCalled();
  });
});

/**
 * Issue #23 defense-in-depth: a model that stringifies the FlowSchema despite the
 * object-typed emitted schema must still get a rendered flow, not a silent
 * failure. `ShowFlow` coerces the stringified emission before compiling.
 */
describe('show_flow renders a STRINGIFIED schema (issue #23 defense-in-depth)', () => {
  it('compiles and renders the first step when schema arrives as a JSON string', () => {
    showFlow(JSON.stringify(schema));
    // The first step's field mounts — proof the string was parsed and compiled.
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    // And no emission-error view replaced it.
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
  });

  it('surfaces the emission error for a stringified NON-schema (garbage stays garbage)', () => {
    showFlow('this is not json at all');
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });
});
