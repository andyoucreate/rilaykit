import { useCatalog } from '@rilaykit/core/react';
import { SchemaValidationError } from '@rilaykit/forms';
import {
  FlowBack,
  FlowBody,
  FlowNext,
  type FlowSchema,
  type FlowSchemaResult,
  WorkflowProvider,
  compileFlow,
} from '@rilaykit/workflow';
import { useMemo, useRef } from 'react';
import { type EmissionResult, toEmissionResult } from '../../errors/emission-error';
import { EmissionErrorView } from './EmissionErrorView';

export interface ShowFlowProps {
  /** The agent-emitted FlowSchema, untrusted JSON. */
  readonly schema: unknown;
  readonly resolve: (output: unknown) => void;
}

type Compiled =
  | { readonly result: FlowSchemaResult; readonly error: null }
  | { readonly result: null; readonly error: EmissionResult };

/**
 * Built-in HITL renderer for the `show_flow` tool: compiles the emitted schema
 * and mounts the real flow chrome (FlowBody + FlowBack + FlowNext).
 *
 * Mounts through WorkflowProvider ON PURPOSE. The provider discharges the
 * store's `_reconcileStepSet` obligation on every render and owns the whole
 * step↔form seam (the per-step FormProvider swap, `instanceId`, the seed
 * generation); a hand-rolled workflow store would inherit those obligations
 * and silently fail them — see the P2 stabilization tracker.
 *
 * The agent only ever receives ENGINE-VALIDATED values: FlowNext drives the
 * current step's form `submit()` (validation before advance), and
 * `onWorkflowComplete` hands back the step-keyed, authored-shape data.
 *
 * Like `compileForm`, `compileFlow` is built for untrusted JSON and reports
 * every defect as a `SchemaValidationError` — its single documented error
 * contract — so the `as FlowSchema` is the honest boundary cast, and only that
 * error class is caught.
 */
export function ShowFlow({ schema, resolve }: ShowFlowProps) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo((): Compiled => {
    try {
      const { workflowConfig, defaultValues } = compileFlow(schema as FlowSchema, catalog, {
        validateProps: true,
      });
      return {
        result: {
          workflowConfig: {
            ...workflowConfig,
            // Untrusted JSON never chooses to skip validation: an emitted
            // per-step `submitOptions.force` / `skipInvalid` is neutralized at
            // this HITL boundary so completion only ever carries
            // engine-validated values.
            steps: workflowConfig.steps.map((step) => ({
              ...step,
              formConfig: {
                ...step.formConfig,
                submitOptions: {
                  ...step.formConfig.submitOptions,
                  force: false,
                  skipInvalid: false,
                },
              },
            })),
          },
          defaultValues,
        },
        error: null,
      };
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        return { result: null, error: toEmissionResult(error, ['id', 'name', 'steps']) };
      }
      throw error;
    }
  }, [schema, catalog]);

  if (compiled.error) return <EmissionErrorView result={compiled.error} />;

  // One answer per tool call: completing twice, or cancelling after completion,
  // must not resolve twice.
  const settle = (output: unknown) => {
    if (settled.current) return;
    settled.current = true;
    resolve(output);
  };

  return (
    <WorkflowProvider
      workflowConfig={compiled.result.workflowConfig}
      defaultValues={compiled.result.defaultValues}
      onWorkflowComplete={(values) => settle({ status: 'submitted', values })}
    >
      <FlowBody />
      <FlowBack />
      <FlowNext />
      <button type="button" onClick={() => settle({ status: 'cancelled' })} data-agent-cancel>
        Cancel
      </button>
    </WorkflowProvider>
  );
}
