import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';
import type { PartState } from '../../src/types/part';

const catalog = ril.create().use(uiTools());

function renderSettled(
  name: 'show_form' | 'show_flow',
  state: PartState,
  output?: unknown,
  errorText?: string
) {
  return render(
    <Catalog value={catalog}>
      <Part
        part={{
          type: 'tool',
          toolCallId: 'c1',
          name,
          state,
          input: { schema: {} },
          output,
          errorText,
        }}
      />
    </Catalog>
  );
}

/**
 * Issue #23 (secondary): a settled HITL tool used to fall through to DefaultTool,
 * printing the raw humanized name ("Show form") in the transcript. It now renders
 * an explicit SettledToolResult — a read-only summary of the answer — while never
 * re-arming the interactive controls.
 */
describe('SettledToolResult — settled show_form / show_flow render an explicit summary', () => {
  it('at done + { status: "submitted", values }: shows the submitted values read-only, not "Show form"', () => {
    renderSettled('show_form', 'done', {
      status: 'submitted',
      values: { email: 'a@b.co', name: 'Karl' },
    });
    const root = document.querySelector('[data-agent-settled="submitted"]');
    expect(root).not.toBeNull();
    expect(screen.getByText('a@b.co')).toBeInTheDocument();
    expect(screen.getByText('Karl')).toBeInTheDocument();
    // The submitted keys are carried as data hooks for styling/labelling.
    expect(document.querySelector('[data-agent-settled-key="email"]')).not.toBeNull();
    // No interactive controls: a rehydrated answer must not re-arm the HITL loop.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // The bare humanized tool name is NOT the transcript content anymore.
    expect(screen.queryByText('Show form')).not.toBeInTheDocument();
  });

  it('at done + { status: "cancelled" }: shows a cancelled marker, no values, no controls', () => {
    renderSettled('show_form', 'done', { status: 'cancelled' });
    expect(document.querySelector('[data-agent-settled="cancelled"]')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('at error state: shows an error marker carrying the errorText, not "Show form"', () => {
    renderSettled('show_form', 'error', undefined, 'model tool call failed');
    const root = document.querySelector('[data-agent-settled="error"]');
    expect(root).not.toBeNull();
    expect(screen.getByText('model tool call failed')).toBeInTheDocument();
    expect(screen.queryByText('Show form')).not.toBeInTheDocument();
  });

  it('at done + { status: "error", error } (emission-error retry result): shows the error message', () => {
    renderSettled('show_flow', 'done', { status: 'error', error: 'Flow schema must be an object' });
    expect(document.querySelector('[data-agent-settled="error"]')).not.toBeNull();
    expect(screen.getByText('Flow schema must be an object')).toBeInTheDocument();
  });

  it('preserves the tool styling hooks (data-part/tool-name/tool-state) as a superset of DefaultTool', () => {
    renderSettled('show_flow', 'done', { status: 'submitted', values: { step: 'ok' } });
    const root = document.querySelector('[data-part="tool"]');
    expect(root?.getAttribute('data-tool-name')).toBe('show_flow');
    expect(root?.getAttribute('data-tool-state')).toBe('done');
  });
});
