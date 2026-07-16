import { describe, expect, it } from 'vitest';
import { type Part, isDataPart, isTextPart, isToolPart } from '../../src/types/part';

describe('Part narrowing', () => {
  const text: Part = { type: 'text', text: 'hello', state: 'done' };
  const tool: Part = {
    type: 'tool',
    toolCallId: 'c1',
    name: 'show_form',
    state: 'ready',
    input: {},
  };
  const data: Part = { type: 'data', name: 'usage', data: { tokens: 12 } };

  it('narrows each member of the union exactly', () => {
    expect([isTextPart(text), isToolPart(text), isDataPart(text)]).toEqual([true, false, false]);
    expect([isTextPart(tool), isToolPart(tool), isDataPart(tool)]).toEqual([false, true, false]);
    expect([isTextPart(data), isToolPart(data), isDataPart(data)]).toEqual([false, false, true]);
  });

  it('carries the streaming carriage a tool renderer needs', () => {
    const streaming: Part = {
      type: 'tool',
      toolCallId: 'c2',
      name: 'show_form',
      state: 'streaming',
      input: { fields: [] },
      rawInput: '{"fields":[',
    };
    expect(isToolPart(streaming) && streaming.rawInput).toBe('{"fields":[');
  });
});
