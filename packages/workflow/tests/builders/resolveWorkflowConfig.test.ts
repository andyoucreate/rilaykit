import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { describe, expect, it } from 'vitest';
import { flow, resolveWorkflowConfig } from '../../src';

const r = ril.create().component('text', { name: 'Text', renderer: () => null });
const stepForm = form.create(r, 's1').add({ id: 'email', type: 'text', props: {} });
const wf = flow
  .create(r, 'onboarding', 'Onboarding')
  .addStep({ id: 'personal', title: 'Personal', formConfig: stepForm.build() });

describe('resolveWorkflowConfig', () => {
  it('returns an already-built WorkflowConfig as-is (same reference)', () => {
    const cfg = wf.build();
    expect(resolveWorkflowConfig(cfg)).toBe(cfg);
  });

  it('auto-builds a flow builder instance', () => {
    const resolved = resolveWorkflowConfig(wf);
    expect(resolved.id).toBe('onboarding');
    expect(resolved.steps.map((s) => s.id)).toEqual(['personal']);
  });
});
