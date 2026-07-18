export type RilayErrorCode =
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'INVALID_SCHEMA'
  | 'CONFIGURATION'
  | 'MAX_DEPTH';

export class RilayError extends Error {
  constructor(
    message: string,
    public readonly code: RilayErrorCode,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RilayError';
  }
}

export class ValidationError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'VALIDATION', meta);
    this.name = 'ValidationError';
  }
}

export class DuplicateError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'DUPLICATE', meta);
    this.name = 'DuplicateError';
  }
}

export class NotFoundError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', meta);
    this.name = 'NotFoundError';
  }
}

export class InvalidSchemaError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'INVALID_SCHEMA', meta);
    this.name = 'InvalidSchemaError';
  }
}

export class ConfigurationError extends RilayError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'CONFIGURATION', meta);
    this.name = 'ConfigurationError';
  }
}

/**
 * Thrown when a recursive walk over untrusted (model-authored or corrupted)
 * data would exceed a safe nesting depth. A bounded, typed error instead of the
 * raw `RangeError: Maximum call stack size exceeded` that unbounded recursion
 * would otherwise throw — so a caller processing untrusted input can convert it
 * into its own domain error (e.g. a SchemaValidationError issue) rather than
 * crash.
 */
export class MaxDepthExceededError extends RilayError {
  constructor(
    public readonly maxDepth: number,
    meta?: Record<string, unknown>
  ) {
    super(`Maximum nesting depth of ${maxDepth} exceeded`, 'MAX_DEPTH', meta);
    this.name = 'MaxDepthExceededError';
  }
}
