/** Adapter-mapped from AI SDK v5: input-streaming | input-available | output-available | output-error */
export type PartState = 'streaming' | 'ready' | 'done' | 'error';

export interface TextPart {
  readonly type: 'text';
  readonly text: string;
  readonly state?: 'streaming' | 'done';
}

export interface ToolPart {
  readonly type: 'tool';
  readonly toolCallId: string;
  readonly name: string;
  readonly state: PartState;
  /** During `streaming`, a deep-partial parsed object. */
  readonly input: unknown;
  /** Raw partial JSON, for renderers that want to drive their own progressive parse. */
  readonly rawInput?: string;
  readonly output?: unknown;
  readonly errorText?: string;
}

export interface DataPart {
  readonly type: 'data';
  readonly name: string;
  readonly data: unknown;
}

/**
 * Structurally aligned with AI SDK v5 parts so the adapter is near-identity.
 * `reasoning`/`source`/`file` are deliberately deferred — the union stays extensible.
 */
export type Part = TextPart | ToolPart | DataPart;

export function isTextPart(part: Part): part is TextPart {
  return part.type === 'text';
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === 'tool';
}

export function isDataPart(part: Part): part is DataPart {
  return part.type === 'data';
}
