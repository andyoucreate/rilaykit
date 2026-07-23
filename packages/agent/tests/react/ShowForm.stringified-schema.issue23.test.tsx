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
    description: 'Text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <input value={String(field?.value ?? '')} onChange={(e) => field?.onChange(e.target.value)} />
      </label>
    ),
  })
  .use(uiTools());

const formSchema = {
  id: 'contact',
  fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
};

function renderShowForm(schema: unknown) {
  return render(
    <Catalog value={catalog}>
      <Part
        part={{ type: 'tool', toolCallId: 'c1', name: 'show_form', state: 'ready', input: { schema } }}
      />
    </Catalog>
  );
}

/**
 * Issue #23 defense-in-depth: a model that stringifies the FormSchema despite the
 * object-typed emitted schema must still get a rendered form, not a silent
 * failure. The built-in coerces the stringified emission before compiling.
 */
describe('show_form renders a STRINGIFIED schema (issue #23 defense-in-depth)', () => {
  it('compiles and renders the real form when schema arrives as a JSON string', () => {
    renderShowForm(JSON.stringify(formSchema));
    // The field mounts — proof the string was parsed and compiled, not rejected.
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    // And no emission-error view replaced it.
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
  });

  it('still renders the form when schema arrives as a real object (no regression)', () => {
    renderShowForm(formSchema);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('surfaces the emission error for a stringified NON-schema (garbage stays garbage)', () => {
    renderShowForm('this is not json at all');
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });
});
