import type { form } from '@rilaykit/forms';
import type { flow } from '@rilaykit/workflow';
import type {
  BuilderMetadata,
  SerializedBuilder,
  SerializedFormBuilder,
  SerializedWorkflowBuilder,
} from '../types';

/**
 * Current serialization version
 * Bump this when making breaking changes to the serialization format
 */
const SERIALIZATION_VERSION = '1.0.0';

/**
 * Creates default metadata for a new builder
 */
export const createDefaultMetadata = (author?: string, tags: string[] = []): BuilderMetadata => ({
  createdAt: new Date(),
  updatedAt: new Date(),
  author,
  tags,
});

/**
 * Serializes a form builder to JSON-compatible format
 *
 * @param formBuilder - The form builder instance
 * @param id - Unique identifier for the builder
 * @param name - Display name for the builder
 * @param metadata - Optional metadata
 * @returns Serialized form builder data
 *
 * @example
 * ```typescript
 * const serialized = serializeFormBuilder(
 *   myFormBuilder,
 *   'contact-form',
 *   'Contact Form',
 *   { author: 'John Doe', tags: ['contact', 'lead-gen'] }
 * );
 * ```
 */
export const serializeFormBuilder = (
  formBuilder: form<any>,
  id: string,
  name: string,
  metadata: BuilderMetadata = createDefaultMetadata()
): SerializedFormBuilder => {
  const json = formBuilder.toJSON();

  return {
    version: SERIALIZATION_VERSION,
    type: 'form',
    id,
    name,
    metadata: {
      ...metadata,
      updatedAt: new Date(),
    },
    config: {
      formId: json.id,
      rows: json.rows,
      validation: json.validation,
    },
  };
};

/**
 * Serializes a workflow builder to JSON-compatible format
 *
 * @param flowBuilder - The workflow builder instance
 * @param id - Unique identifier for the builder
 * @param name - Display name for the builder
 * @param metadata - Optional metadata
 * @returns Serialized workflow builder data
 *
 * @example
 * ```typescript
 * const serialized = serializeWorkflowBuilder(
 *   myFlowBuilder,
 *   'onboarding-flow',
 *   'User Onboarding',
 *   { author: 'Jane Doe', tags: ['onboarding', 'user'] }
 * );
 * ```
 */
export const serializeWorkflowBuilder = (
  flowBuilder: flow,
  id: string,
  name: string,
  metadata: BuilderMetadata = createDefaultMetadata()
): SerializedWorkflowBuilder => {
  const config = flowBuilder.toJSON();

  return {
    version: SERIALIZATION_VERSION,
    type: 'workflow',
    id,
    name,
    metadata: {
      ...metadata,
      updatedAt: new Date(),
    },
    config,
  };
};

/**
 * Deserializes form builder data and restores the builder instance
 *
 * @param data - Serialized form builder data
 * @param formBuilder - Form builder instance to restore into
 * @returns The restored form builder instance
 *
 * @example
 * ```typescript
 * const myFormBuilder = form.create(rilConfig);
 * deserializeFormBuilder(savedData, myFormBuilder);
 * ```
 */
export const deserializeFormBuilder = (
  data: SerializedFormBuilder,
  formBuilder: form<any>
): form<any> => {
  // Validate version compatibility
  if (!isVersionCompatible(data.version)) {
    throw new Error(
      `Incompatible serialization version: ${data.version}. Current version: ${SERIALIZATION_VERSION}`
    );
  }

  // Restore form configuration
  formBuilder.fromJSON({
    id: data.config.formId,
    rows: data.config.rows,
    validation: data.config.validation,
  });

  return formBuilder;
};

/**
 * Deserializes workflow builder data and restores the builder instance
 *
 * @param data - Serialized workflow builder data
 * @param flowBuilder - Flow builder instance to restore into
 * @returns The restored flow builder instance
 *
 * @example
 * ```typescript
 * const myFlowBuilder = flow.create(rilConfig, 'workflow-id', 'Workflow Name');
 * deserializeWorkflowBuilder(savedData, myFlowBuilder);
 * ```
 */
export const deserializeWorkflowBuilder = (
  data: SerializedWorkflowBuilder,
  flowBuilder: flow
): flow => {
  // Validate version compatibility
  if (!isVersionCompatible(data.version)) {
    throw new Error(
      `Incompatible serialization version: ${data.version}. Current version: ${SERIALIZATION_VERSION}`
    );
  }

  // Restore workflow configuration
  flowBuilder.fromJSON(data.config);

  return flowBuilder;
};

/**
 * Checks if a serialization version is compatible with the current version
 *
 * @param version - Version string to check
 * @returns True if compatible, false otherwise
 */
export const isVersionCompatible = (version: string): boolean => {
  const [currentMajor] = SERIALIZATION_VERSION.split('.').map(Number);
  const [targetMajor] = version.split('.').map(Number);

  // Only major version breaks compatibility
  return currentMajor === targetMajor;
};

/**
 * Validates serialized builder data structure
 *
 * @param data - Data to validate
 * @returns True if valid, false otherwise
 */
export const validateSerializedData = (data: any): data is SerializedBuilder => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check required top-level fields
  if (!data.version || !data.type || !data.id || !data.name || !data.config) {
    return false;
  }

  // Check type is valid
  if (data.type !== 'form' && data.type !== 'workflow') {
    return false;
  }

  // Check metadata structure
  if (data.metadata) {
    if (!data.metadata.createdAt || !data.metadata.updatedAt) {
      return false;
    }
  }

  return true;
};

/**
 * Clones serialized builder data with updated metadata
 *
 * @param data - Original serialized data
 * @param newId - New identifier for the clone
 * @param newName - New name for the clone
 * @returns Cloned serialized data
 *
 * @example
 * ```typescript
 * const cloned = cloneSerializedData(
 *   originalData,
 *   'contact-form-v2',
 *   'Contact Form V2'
 * );
 * ```
 */
export const cloneSerializedData = (
  data: SerializedBuilder,
  newId: string,
  newName: string
): SerializedBuilder => {
  return {
    ...data,
    id: newId,
    name: newName,
    metadata: {
      ...data.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
};

/**
 * Converts serialized data to pretty JSON string
 *
 * @param data - Serialized builder data
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Pretty-printed JSON string
 */
export const toJSONString = (data: SerializedBuilder, indent = 2): string => {
  return JSON.stringify(data, null, indent);
};

/**
 * Parses JSON string to serialized builder data with validation
 *
 * @param json - JSON string to parse
 * @returns Parsed and validated serialized data
 * @throws Error if JSON is invalid or data structure is invalid
 */
export const fromJSONString = (json: string): SerializedBuilder => {
  try {
    const data = JSON.parse(json);

    if (!validateSerializedData(data)) {
      throw new Error('Invalid serialized data structure');
    }

    return data;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
