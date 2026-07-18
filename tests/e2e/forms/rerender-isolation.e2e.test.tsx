/**
 * =============================================================================
 * FLAGSHIP E2E — perf contract: granular subscription isolation.
 *
 * Typing in field A must NOT re-render field B's or field C's renderer. This is
 * proven through the REAL stack (Form → Form.Body → FormField → granular Zustand
 * selectors), not the store layer in isolation: a per-field render counter is
 * incremented inside the registered renderer, so the count reflects actual
 * FormField renders driven by the real subscription graph.
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { Form } from '@rilaykit/forms/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ril } from 'rilaykit';
import { beforeEach, describe, expect, it } from 'vitest';

// Module-level render counter keyed by field id, incremented on every renderer
// invocation. Reset between tests.
const renderCount = new Map<string, number>();

function CountingInput({ id, field }: ComponentRenderContext) {
  renderCount.set(id, (renderCount.get(id) ?? 0) + 1);
  return (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
    />
  );
}

function createCatalog() {
  return ril.create().component('text', { name: 'Text', renderer: CountingInput });
}

beforeEach(() => {
  renderCount.clear();
});

describe('Flagship — rerender isolation through the real stack', () => {
  it('re-renders only the typed field; sibling renderers are untouched', async () => {
    const catalog = createCatalog();
    const formConfig = catalog
      .form('isolation')
      .add({ id: 'A', type: 'text', props: {} })
      .add({ id: 'B', type: 'text', props: {} })
      .add({ id: 'C', type: 'text', props: {} });

    render(
      <Form of={formConfig}>
        <Form.Body />
      </Form>
    );

    await waitFor(() => {
      expect(screen.getByTestId('A')).toBeInTheDocument();
      expect(screen.getByTestId('B')).toBeInTheDocument();
      expect(screen.getByTestId('C')).toBeInTheDocument();
    });

    // Baseline after mount has settled.
    const baseA = renderCount.get('A')!;
    const baseB = renderCount.get('B')!;
    const baseC = renderCount.get('C')!;
    expect(baseA).toBeGreaterThanOrEqual(1);
    expect(baseB).toBeGreaterThanOrEqual(1);
    expect(baseC).toBeGreaterThanOrEqual(1);

    // Type into A three times.
    fireEvent.change(screen.getByTestId('A'), { target: { value: 'x' } });
    fireEvent.change(screen.getByTestId('A'), { target: { value: 'xy' } });
    fireEvent.change(screen.getByTestId('A'), { target: { value: 'xyz' } });

    await waitFor(() => {
      expect(screen.getByTestId('A')).toHaveValue('xyz');
    });

    // A re-rendered exactly once per keystroke (granular value subscription);
    // B and C did NOT re-render at all — their counts are pinned to baseline.
    expect(renderCount.get('A')).toBe(baseA + 3);
    expect(renderCount.get('B')).toBe(baseB);
    expect(renderCount.get('C')).toBe(baseC);
  });

  it('keeps isolation when typing across multiple distinct fields', async () => {
    const catalog = createCatalog();
    const formConfig = catalog
      .form('isolation-2')
      .add({ id: 'A', type: 'text', props: {} })
      .add({ id: 'B', type: 'text', props: {} })
      .add({ id: 'C', type: 'text', props: {} });

    render(
      <Form of={formConfig}>
        <Form.Body />
      </Form>
    );

    await waitFor(() => {
      expect(screen.getByTestId('C')).toBeInTheDocument();
    });

    const baseA = renderCount.get('A')!;
    const baseB = renderCount.get('B')!;
    const baseC = renderCount.get('C')!;

    // Type once into B — only B moves.
    fireEvent.change(screen.getByTestId('B'), { target: { value: 'hello' } });
    await waitFor(() => {
      expect(screen.getByTestId('B')).toHaveValue('hello');
    });

    expect(renderCount.get('A')).toBe(baseA);
    expect(renderCount.get('B')).toBe(baseB + 1);
    expect(renderCount.get('C')).toBe(baseC);

    // Then once into C — only C moves; A and B stay where they were.
    fireEvent.change(screen.getByTestId('C'), { target: { value: 'world' } });
    await waitFor(() => {
      expect(screen.getByTestId('C')).toHaveValue('world');
    });

    expect(renderCount.get('A')).toBe(baseA);
    expect(renderCount.get('B')).toBe(baseB + 1);
    expect(renderCount.get('C')).toBe(baseC + 1);
  });
});
