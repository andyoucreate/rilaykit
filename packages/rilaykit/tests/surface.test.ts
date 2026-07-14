import * as kit from 'rilaykit';
import { ril } from 'rilaykit';
import { describe, expect, it } from 'vitest';

describe('rilaykit all-in-one surface', () => {
  it('exposes the compound components and flow hooks', () => {
    expect(typeof kit.Form).toBe('function');
    expect('Body' in kit.Form).toBe(true);
    expect(typeof kit.Flow).toBe('function');
    expect('Progress' in kit.Flow).toBe(true);
    expect(typeof kit.useFlow).toBe('function');
    expect('Workflow' in kit).toBe(false);
    expect('WorkflowStepper' in kit).toBe(false);
  });

  it('enhanced ril chains catalog facades and keeps .form()/.flow()', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => null as never })
      .tool('show_form', {});
    const f = r.form('login');
    expect(f).toBeDefined();
    const w = r.flow('wf', 'WF');
    expect(w).toBeDefined();
    expect(r.getTool('show_form')?.kind).toBe('tool');
  });
});
