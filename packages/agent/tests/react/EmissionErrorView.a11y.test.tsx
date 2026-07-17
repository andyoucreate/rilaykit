import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </label>
    ),
  })
  .use(uiTools());

const INVALID = {
  schema: { id: 'f1', fields: [{ id: 'name', type: 'nope', props: { label: 'Name' } }] },
};
function part(input: unknown) {
  return {
    type: 'tool' as const,
    toolCallId: 'a11y',
    name: 'show_form',
    state: 'ready' as const,
    input,
  };
}

describe('EmissionErrorView is announced to assistive tech', () => {
  it('carries role=alert so a screen-reader user is told the emission error', () => {
    render(
      <Catalog value={catalog}>
        <Part part={part(INVALID)} onResolve={() => {}} />
      </Catalog>
    );
    const region = screen.getByRole('alert');
    expect(region.getAttribute('data-agent-error')).toBe('emission');
    expect(region).toHaveTextContent(/Unknown component type "nope"/);
  });
});
