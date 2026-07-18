import { SchemaValidationError as FormsSchemaValidationError } from '@rilaykit/forms';
import * as wf from '@rilaykit/workflow';
import { describe, expect, it } from 'vitest';

describe('workflow schema public surface', () => {
  it('exports the flow-schema API', () => {
    expect(typeof wf.compileFlow).toBe('function');
    expect(typeof wf.validateFlowSchema).toBe('function');
    expect(typeof wf.isFlowSchema).toBe('function');
  });

  // A consumer installing ONLY `@rilaykit/workflow` calls `compileFlow` on
  // backend/LLM-authored JSON and must narrow the failure it throws. The package
  // that THROWS the error has to be the package that EXPORTS it — otherwise the
  // only way to `instanceof`-narrow is to also depend on `@rilaykit/forms`,
  // which is an implementation detail of workflow's dependency graph.
  it('exports the SchemaValidationError it throws', () => {
    expect(typeof wf.SchemaValidationError).toBe('function');
  });

  it('re-exports the SAME class identity as the one actually thrown', () => {
    // A re-export must forward the class object, not re-declare it: two distinct
    // classes named alike would make `instanceof` silently false across package
    // boundaries — the exact failure the export is meant to prevent.
    expect(wf.SchemaValidationError).toBe(FormsSchemaValidationError);

    let thrown: unknown;
    try {
      wf.compileFlow({ id: 'f', name: 'F', steps: [] } as never, {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(wf.SchemaValidationError);
    expect((thrown as InstanceType<typeof wf.SchemaValidationError>).issues.length).toBeGreaterThan(
      0
    );
  });
});
