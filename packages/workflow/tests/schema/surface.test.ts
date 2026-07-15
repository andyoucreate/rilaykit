import * as wf from '@rilaykit/workflow';
import { describe, expect, it } from 'vitest';

describe('workflow schema public surface', () => {
  it('exports the flow-schema API', () => {
    expect(typeof wf.compileFlow).toBe('function');
    expect(typeof wf.validateFlowSchema).toBe('function');
    expect(typeof wf.isFlowSchema).toBe('function');
  });
});
