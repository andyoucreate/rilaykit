export type RilayErrorCode =
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'INVALID_SCHEMA'
  | 'CONFIGURATION';

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
