import type { Part } from 'rilaykit';
import { describe, expect, it } from 'vitest';
import { advanceTranscript } from './agent-transcript';

/**
 * The simulated-assistant page drives a hand-authored Part[] transcript through
 * <Parts> with the real HITL resolve loop. `advanceTranscript` is the pure step
 * the resolve handler applies: when the user submits a rendered show_form, flip
 * that tool part to `done` with its output and append the scripted next turn —
 * idempotently, so a double-resolve (or an unknown id) never duplicates or
 * corrupts the transcript.
 */
const OPEN_TOOL: Part = {
  type: 'tool',
  toolCallId: 'call_signup',
  name: 'show_form',
  state: 'ready',
  input: { schema: { id: 'signup', fields: [{ id: 'name', type: 'text', props: {} }] } },
};
const INTRO: Part = { type: 'text', text: 'Fill this in:', state: 'done' };
const FOLLOW_UP: Part[] = [{ type: 'text', text: 'Thanks, all set!', state: 'done' }];

describe('advanceTranscript', () => {
  it('flips the resolved tool part to done with its output and appends the follow-up', () => {
    const before: Part[] = [INTRO, OPEN_TOOL];
    const output = { status: 'submitted', values: { name: 'Neo' } };

    const after = advanceTranscript(before, 'call_signup', output, FOLLOW_UP);

    expect(after).toEqual([
      INTRO,
      { ...OPEN_TOOL, state: 'done', output },
      { type: 'text', text: 'Thanks, all set!', state: 'done' },
    ]);
  });

  it('is a no-op for an unknown toolCallId (no follow-up appended)', () => {
    const before: Part[] = [INTRO, OPEN_TOOL];
    const after = advanceTranscript(before, 'call_unknown', { status: 'submitted' }, FOLLOW_UP);
    expect(after).toEqual(before);
  });

  it('is idempotent — re-resolving an already-done tool part changes nothing', () => {
    const before: Part[] = [INTRO, OPEN_TOOL];
    const once = advanceTranscript(
      before,
      'call_signup',
      { status: 'submitted', values: {} },
      FOLLOW_UP
    );
    const twice = advanceTranscript(
      once,
      'call_signup',
      { status: 'submitted', values: {} },
      FOLLOW_UP
    );
    expect(twice).toEqual(once);
  });

  it('does not mutate the input transcript', () => {
    const before: Part[] = [INTRO, OPEN_TOOL];
    const snapshot = structuredClone(before);
    advanceTranscript(before, 'call_signup', { status: 'submitted' }, FOLLOW_UP);
    expect(before).toEqual(snapshot);
  });
});
