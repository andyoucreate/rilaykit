import { describe, expect, it } from 'vitest';
import * as rilaykit from '../src';

describe('all-in-one agent surface', () => {
  it('exposes the isomorphic agent API', () => {
    expect(typeof rilaykit.uiTools).toBe('function');
    expect(typeof rilaykit.manifest).toBe('function');
    expect(typeof rilaykit.parsePartialJson).toBe('function');
    expect(typeof rilaykit.isToolPart).toBe('function');
  });

  it('does NOT re-export React components from the main entry — it must stay isomorphic', () => {
    expect('Parts' in rilaykit).toBe(false);
    expect('Catalog' in rilaykit).toBe(false);
  });
});
