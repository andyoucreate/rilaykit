import type { RilayPlugin } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Form } from '@rilaykit/forms/react';
/**
 * PROOF — catalog end-to-end.
 * Rows of the P1 feature proof matrix not already proven by
 * `packages/core/tests/catalog/*`: registration-to-render flow of
 * `propsSchema`-inferred props and `meta`, and the plugin → renderers chain.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('PROOF catalog end-to-end', () => {
  it('meta and inferred props flow from registration to the rendered field', () => {
    const r = ril.create().component('badge', {
      propsSchema: z.object({ label: z.string() }),
      meta: { tone: 'brand' },
      renderer: ({ props, meta }) => <span data-tone={String(meta?.tone)}>{props.label}</span>,
    });
    const def = form.create(r, 'p').add({ id: 'b', type: 'badge', props: { label: 'Pro' } });
    render(
      <Form of={def}>
        <Form.Body />
      </Form>
    );
    const badge = screen.getByText('Pro');
    expect(badge.dataset.tone).toBe('brand');
  });

  it('a plugin-registered tool and a hydrated renderer survive the full chain', () => {
    const plugin: RilayPlugin = (r) => r.tool('confirm', { description: 'Ask confirmation' });
    const r = ril
      .create()
      .use(plugin)
      .renderers({ tools: { confirm: ({ state }) => <output>{state}</output> } });
    expect(r.getTool('confirm')?.description).toBe('Ask confirmation');
    expect(typeof r.getTool('confirm')?.renderer).toBe('function');
  });
});
