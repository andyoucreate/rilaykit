import type { Part } from 'rilaykit';

/**
 * The pure step the simulated-assistant page applies when the user submits a
 * rendered `show_form`: flip that tool part to `done` with its output, then append
 * the scripted next turn.
 *
 * Idempotent by design — the resolve is keyed on a still-open (`state !== 'done'`)
 * tool part, so an unknown `toolCallId` or a second resolve of the same call is a
 * no-op that never duplicates the follow-up. Never mutates the input transcript.
 */
export function advanceTranscript(
  transcript: readonly Part[],
  toolCallId: string,
  output: unknown,
  followUp: readonly Part[]
): Part[] {
  const target = transcript.find(
    (part): part is Extract<Part, { type: 'tool' }> =>
      part.type === 'tool' && part.toolCallId === toolCallId && part.state !== 'done'
  );
  if (!target) return [...transcript];

  const resolved = transcript.map((part) =>
    part === target ? { ...part, state: 'done' as const, output } : part
  );
  return [...resolved, ...followUp];
}
