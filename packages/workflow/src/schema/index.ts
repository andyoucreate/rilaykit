// `compileFlow` VALIDATES untrusted (backend/LLM-authored) JSON and reports a
// malformed document by throwing `SchemaValidationError`, carrying `.issues[]`.
// The class is declared in `@rilaykit/forms` — an implementation detail of this
// package's dependency graph — so it is re-exported here: a consumer that
// installed only `@rilaykit/workflow` must be able to `instanceof`-narrow what
// this package throws without depending on forms. Re-export (not re-declare) so
// the class identity stays single and `instanceof` holds across packages.
export { SchemaValidationError } from '@rilaykit/forms';
export type { SchemaIssue } from '@rilaykit/forms';
export { compileFlow } from './compile-flow';
export { isFlowSchema, validateFlowSchema } from './validate-flow-schema';
export type {
  AfterValidationHandler,
  AllowSkipPredicate,
  CompileFlowOptions,
  FlowBindings,
  FlowSchema,
  FlowSchemaResult,
  FlowSchemaStep,
} from './flow-schema-types';
