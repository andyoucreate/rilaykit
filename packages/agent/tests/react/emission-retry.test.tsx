import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';

/**
 * R13 — the self-correction retry channel (spec §8), permanent repro.
 *
 * Reconstructed from hunt-r13-report.md. The R13-1 assertions are FLIPPED to
 * the fixed behavior: an INVALID complete emission must not only render an
 * `EmissionErrorView` — it must DELIVER the structured EmissionResult back
 * through `onResolve` as `{ status: 'error', error, issues, expectedKeys }`,
 * exactly once per tool call, so the AI SDK host can `addToolResult` it and
 * the model can retry. Without that delivery the tool call never settles and
 * the conversation wedges (an errored show_form renders ZERO buttons).
 *
 * The in-place recovery contracts (hunt A1/A2/A3/A8/A9/A12) are kept verbatim:
 * a corrected re-emission on the SAME part must still recover, and the
 * eventual submit must still resolve `{ status: 'submitted', values }` — the
 * one-shot latch guards double-DELIVERY of the error, never re-rendering.
 */

// Registration order is asserted below: `show_component`'s unknown-component
// error must deliver the catalog ids IN CATALOG ORDER as its expectedKeys.
const catalog = ril
  .create()
  .component('badge', {
    description: 'A badge',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props }) => <span>{String(props.label)}</span>,
  })
  .component('stack', {
    description: 'Vertical stack',
    propsSchema: z.object({ gap: z.number() }),
    renderer: ({ props, children }) => <div data-gap={String(props.gap)}>{children}</div>,
  })
  .component('bomb', {
    description: 'A renderer that throws',
    propsSchema: z.object({}),
    renderer: () => {
      throw new SyntaxError('renderer exploded');
    },
  })
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

type ToolState = 'streaming' | 'ready' | 'done' | 'error';

function toolPart(name: string, toolCallId: string, input: unknown, state: ToolState = 'ready') {
  return { type: 'tool' as const, toolCallId, name, state, input };
}

function renderPart(
  part: ReturnType<typeof toolPart>,
  onResolve: (id: string, output: unknown, tool: string) => void
) {
  const ui = (p: ReturnType<typeof toolPart>) => (
    <Catalog value={catalog}>
      <Part part={p} onResolve={onResolve} />
    </Catalog>
  );
  const view = render(ui(part));
  return { ...view, rerenderPart: (p: ReturnType<typeof toolPart>) => view.rerender(ui(p)) };
}

/** Lets every in-flight submit chain (async validation → onSubmit) settle. */
async function flushSubmissions() {
  await waitFor(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Hunt A8: unknown component type "txt" inside an otherwise well-formed form.
const badFormSchema = {
  id: 'contact',
  fields: [{ id: 'name', type: 'txt', props: { label: 'Name' } }],
};
const badFormError = {
  status: 'error',
  error:
    'Invalid form schema: [fields[0].type] Unknown component type "txt". Must be registered in ril config.',
  issues: [
    {
      path: 'fields[0].type',
      message: 'Unknown component type "txt". Must be registered in ril config.',
      severity: 'error',
    },
  ],
  expectedKeys: ['id', 'fields'],
};
const goodFormSchema = {
  id: 'contact',
  fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
};

describe('R13-1 — show_form delivers the structured error through onResolve', () => {
  it('an invalid READY emission resolves { status: "error", error, issues, expectedKeys } exactly once', () => {
    const onResolve = vi.fn();
    renderPart(toolPart('show_form', 'call_f1', { schema: badFormSchema }), onResolve);

    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_f1', badFormError, 'show_form');
  });

  it('a re-render with the SAME bad input delivers AT MOST once — exactly like submit/cancel', () => {
    const onResolve = vi.fn();
    const part = toolPart('show_form', 'call_f1', { schema: badFormSchema });
    const { rerenderPart } = renderPart(part, onResolve);
    rerenderPart(toolPart('show_form', 'call_f1', { schema: badFormSchema }));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('recovers IN PLACE (hunt A8): a corrected schema on the SAME part mounts the live form, and the eventual submit still resolves { status: "submitted" }', async () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_form', 'call_f1', { schema: badFormSchema }),
      onResolve
    );
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_f1', badFormError, 'show_form');

    rerenderPart(toolPart('show_form', 'call_f1', { schema: goodFormSchema }));
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();

    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenNthCalledWith(
      2,
      'call_f1',
      { status: 'submitted', values: { name: 'Karl' } },
      'show_form'
    );
  });

  it('two consecutive DIFFERENT bad schemas deliver ONE error (hunt A9); the correct third emission still recovers and submits', async () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_form', 'call_f1', { schema: badFormSchema }),
      onResolve
    );
    rerenderPart(toolPart('show_form', 'call_f1', { schema: { id: 'contact', fields: 'nope' } }));
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    expect(onResolve).toHaveBeenCalledTimes(1);

    rerenderPart(toolPart('show_form', 'call_f1', { schema: goodFormSchema }));
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenNthCalledWith(
      2,
      'call_f1',
      { status: 'submitted', values: { name: 'Karl' } },
      'show_form'
    );
  });

  it('delivers NOTHING while STREAMING — a partial/invalid schema is transiently invalid by construction', async () => {
    const onResolve = vi.fn();
    const { container } = renderPart(
      toolPart('show_form', 'call_f1', { schema: badFormSchema }, 'streaming'),
      onResolve
    );
    await flushSubmissions();
    // Lenient compilation SKIPS the not-yet-valid field: no error view, no
    // error delivery — the next chunk may complete the definition.
    expect(container.querySelector('[data-agent-error="emission"]')).toBeNull();
    expect(onResolve).not.toHaveBeenCalled();
  });
});

// Hunt A12: a malformed FlowSchema (`steps` is not an array).
const badFlowSchema = { id: 'trip', name: 'Trip', steps: 'nope' };
const badFlowError = {
  status: 'error',
  error: 'Invalid flow schema: [steps] Flow schema must have a "steps" array',
  issues: [{ path: 'steps', message: 'Flow schema must have a "steps" array', severity: 'error' }],
  expectedKeys: ['id', 'name', 'steps'],
};
const goodFlowSchema = {
  id: 'trip',
  name: 'Trip',
  steps: [
    {
      id: 'only',
      title: 'Only',
      form: { id: 'f', fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }] },
    },
  ],
};

describe('R13-1 — show_flow delivers the structured error through onResolve', () => {
  it('an invalid READY emission resolves { status: "error", error, issues, expectedKeys } exactly once', () => {
    const onResolve = vi.fn();
    renderPart(toolPart('show_flow', 'call_w1', { schema: badFlowSchema }), onResolve);

    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_w1', badFlowError, 'show_flow');
  });

  it('a re-render with the SAME bad input delivers AT MOST once', () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_flow', 'call_w1', { schema: badFlowSchema }),
      onResolve
    );
    rerenderPart(toolPart('show_flow', 'call_w1', { schema: badFlowSchema }));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('recovers IN PLACE (hunt A12): a corrected flow on the SAME part completes and resolves the step-keyed values', async () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_flow', 'call_w1', { schema: badFlowSchema }),
      onResolve
    );
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_w1', badFlowError, 'show_flow');

    rerenderPart(toolPart('show_flow', 'call_w1', { schema: goodFlowSchema }));
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();

    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenNthCalledWith(
      2,
      'call_w1',
      { status: 'submitted', values: { only: { name: 'Karl' } } },
      'show_flow'
    );
  });
});

describe('R13-1 — show_component delivers the structured error through onResolve', () => {
  it('an unknown component at READY resolves the real catalog ids as expectedKeys, exactly once', () => {
    const onResolve = vi.fn();
    renderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'wizardry', props: {} } }),
      onResolve
    );

    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    expect(onResolve).toHaveBeenCalledExactlyOnceWith(
      'call_c1',
      {
        status: 'error',
        error: 'Unknown component "wizardry"',
        issues: [],
        expectedKeys: ['badge', 'stack', 'bomb', 'text'],
      },
      'show_component'
    );
  });

  it('a re-render with the SAME bad node delivers AT MOST once', () => {
    const onResolve = vi.fn();
    const node = { type: 'wizardry', props: {} };
    const { rerenderPart } = renderPart(toolPart('show_component', 'call_c1', { node }), onResolve);
    rerenderPart(toolPart('show_component', 'call_c1', { node }));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('a bad prop delivers the validateNodeProps result (hunt A1) and the corrected node recovers IN PLACE with no further resolve', () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'badge', props: { labl: 'typo' } } }),
      onResolve
    );
    expect(onResolve).toHaveBeenCalledExactlyOnceWith(
      'call_c1',
      {
        status: 'error',
        error: 'Invalid props',
        issues: [{ path: 'label', message: 'Invalid input: expected string, received undefined' }],
        expectedKeys: ['label'],
      },
      'show_component'
    );

    rerenderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'badge', props: { label: 'fixed' } } })
    );
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
    expect(screen.getByText('fixed')).toBeInTheDocument();
    // The success path of show_component never resolves — it is display-only.
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('a partial tree (hunt A2) renders the good siblings, ONE error view, and delivers the FIRST error once; the all-fixed re-render is clean', () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_component', 'call_c1', {
        node: {
          type: 'stack',
          props: { gap: 8 },
          children: [
            { type: 'badge', props: { label: 'first' } },
            { type: 'badge', props: { labl: 'typo' } },
            { type: 'badge', props: { label: 'third' } },
          ],
        },
      }),
      onResolve
    );
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-agent-error="emission"]')).toHaveLength(1);
    expect(onResolve).toHaveBeenCalledExactlyOnceWith(
      'call_c1',
      {
        status: 'error',
        error: 'Invalid props',
        issues: [{ path: 'label', message: 'Invalid input: expected string, received undefined' }],
        expectedKeys: ['label'],
      },
      'show_component'
    );

    rerenderPart(
      toolPart('show_component', 'call_c1', {
        node: {
          type: 'stack',
          props: { gap: 8 },
          children: [
            { type: 'badge', props: { label: 'first' } },
            { type: 'badge', props: { label: 'second' } },
            { type: 'badge', props: { label: 'third' } },
          ],
        },
      })
    );
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('bad → DIFFERENT bad → correct (hunt A3): recovers on the third emission with no residue, delivery stays one-shot', () => {
    const onResolve = vi.fn();
    const { rerenderPart } = renderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'wizardry', props: {} } }),
      onResolve
    );
    rerenderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'badge', props: { labl: 'typo' } } })
    );
    rerenderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'badge', props: { label: 'done' } } })
    );
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it.each(['done', 'error'] as const)(
    'at %s (rehydration) a bad node delivers NOTHING — the call is already settled',
    (state) => {
      const onResolve = vi.fn();
      renderPart(
        toolPart('show_component', 'call_c1', { node: { type: 'wizardry', props: {} } }, state),
        onResolve
      );
      expect(onResolve).not.toHaveBeenCalled();
    }
  );
});

describe('R13-2 — EmissionErrorView renders the TOP-LEVEL expectedKeys', () => {
  it('an unknown component exposes the real catalog ids in the DOM (hunt A7)', () => {
    const onResolve = vi.fn();
    renderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'wizardry', props: {} } }),
      onResolve
    );
    const keys = document.querySelector(
      '[data-agent-error="emission"] > p[data-agent-error-expected-keys]'
    );
    expect(keys).not.toBeNull();
    expect(keys?.getAttribute('data-agent-error-expected-keys')).toBe('badge,stack,bomb,text');
    expect(keys).toHaveTextContent('badge, stack, bomb, text');
  });

  it('a bad prop exposes the top-level expectedKeys from validateNodeProps (hunt A6)', () => {
    const onResolve = vi.fn();
    renderPart(
      toolPart('show_component', 'call_c1', { node: { type: 'badge', props: { labl: 'typo' } } }),
      onResolve
    );
    const keys = document.querySelector(
      '[data-agent-error="emission"] > p[data-agent-error-expected-keys]'
    );
    expect(keys?.getAttribute('data-agent-error-expected-keys')).toBe('label');
  });

  it('a show_form emission error exposes its top-level expectedKeys', () => {
    const onResolve = vi.fn();
    renderPart(toolPart('show_form', 'call_f1', { schema: badFormSchema }), onResolve);
    const keys = document.querySelector(
      '[data-agent-error="emission"] > p[data-agent-error-expected-keys]'
    );
    expect(keys?.getAttribute('data-agent-error-expected-keys')).toBe('id,fields');
  });
});
