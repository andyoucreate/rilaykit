import type { RilayInstance } from '@rilaykit/core';
import { compileForm } from './compile-form';
import type { FormSchema, FormSchemaResult, SchemaRegistry } from './types';

// Back-compat re-exports — these helpers used to live in this module and are still
// deep-imported from this path by existing tests. New code should use './compile-form'.
export {
  isFormSchema,
  resolveFieldValidation,
  resolveValidationDescriptor,
  validateSchema,
} from './compile-form';

/**
 * Converts a JSON schema into a fully functional FormConfiguration.
 *
 * @deprecated Use `compileForm(schema, catalog, { bindings })`.
 */
export function fromSchema<C extends Record<string, any>>(
  schema: FormSchema,
  config: RilayInstance<C>,
  registry?: SchemaRegistry
): FormSchemaResult<C> {
  return compileForm(schema, config, { bindings: registry });
}
