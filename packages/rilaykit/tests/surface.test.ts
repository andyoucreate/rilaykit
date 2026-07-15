import * as kit from 'rilaykit';
import { flow, form, ril } from 'rilaykit';
import { describe, expect, it } from 'vitest';

describe('rilaykit all-in-one surface', () => {
  it('exposes the compound components and flow hooks', () => {
    expect(typeof kit.Form).toBe('function');
    expect('Body' in kit.Form).toBe(true);
    expect(typeof kit.Flow).toBe('function');
    expect('Progress' in kit.Flow).toBe(true);
    expect(typeof kit.useFlow).toBe('function');
    expect(typeof kit.usePersistence).toBe('function');
  });

  it('re-exports the full schema surface (compileForm + compileFlow + guards)', () => {
    expect(typeof kit.compileForm).toBe('function');
    expect(typeof kit.compileFlow).toBe('function');
    expect(typeof kit.isFormSchema).toBe('function');
    expect(typeof kit.isFlowSchema).toBe('function');
    expect(typeof kit.validateFlowSchema).toBe('function');
  });

  it('no longer exposes the removed legacy workflow exports', () => {
    expect('WorkflowProvider' in kit).toBe(false);
    expect('createStepContext' in kit).toBe(false);
    expect('useStepMetadata' in kit).toBe(false);
    expect('useWorkflowAnalytics' in kit).toBe(false);
    expect('useWorkflowConditions' in kit).toBe(false);
    expect('useWorkflowNavigation' in kit).toBe(false);
    expect('useWorkflowState' in kit).toBe(false);
    expect('useWorkflowSubmission' in kit).toBe(false);
    expect('createWorkflowStore' in kit).toBe(false);
    expect('WorkflowStoreContext' in kit).toBe(false);
  });

  it('enhanced ril chains catalog facades and keeps .form()/.flow()', () => {
    const r = ril
      .create()
      .component('text', { renderer: () => null as never })
      .tool('show_form', {});
    const f = r.form('login');
    expect(f).toBeInstanceOf(form);
    const w = r.flow('wf', 'WF');
    expect(w).toBeInstanceOf(flow);
    expect(r.getTool('show_form')?.kind).toBe('tool');
  });
});
