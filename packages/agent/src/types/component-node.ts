/**
 * A renderable tree an agent may emit. `type` is validated against the catalog's
 * component union at RENDER time (Task 7), not here: the static tool schema cannot
 * know a consumer's catalog, and a wrong type must produce a structured error part
 * the model can retry from — never a render crash.
 */
export interface ComponentNode {
  readonly type: string;
  readonly props?: Record<string, unknown>;
  readonly children?: readonly ComponentNode[];
}
