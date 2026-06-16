export type JsonPathSegment = string | number;
export type JsonPath = readonly JsonPathSegment[];

export interface ValidationIssue {
  readonly path: JsonPath;
  readonly message: string;
  readonly code?: string;
}

const SAFE_JSON_PATH_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function formatJsonPath(path: JsonPath): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    if (!SAFE_JSON_PATH_KEY.test(segment)) {
      return `${acc}[${JSON.stringify(segment)}]`;
    }
    if (acc.length === 0) {
      return segment;
    }
    return `${acc}.${segment}`;
  }, '');
}

function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const path = formatJsonPath(issue.path);
      return path ? `[${path}] ${issue.message}` : issue.message;
    })
    .join('; ');
}

export class RilaySchemaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly issues: readonly ValidationIssue[]
  ) {
    super(message);
    this.name = 'RilaySchemaError';
  }
}

export class SchemaValidationError extends RilaySchemaError {
  constructor(issues: readonly ValidationIssue[]) {
    super(`Invalid surface schema: ${formatIssues(issues)}`, 'SCHEMA_VALIDATION_ERROR', issues);
    this.name = 'SchemaValidationError';
  }
}

export class ManifestValidationError extends RilaySchemaError {
  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Surface does not match registry manifest: ${formatIssues(issues)}`,
      'MANIFEST_VALIDATION_ERROR',
      issues
    );
    this.name = 'ManifestValidationError';
  }
}

export interface RuntimeExecutionErrorOptions {
  readonly path?: JsonPath;
  readonly cause?: unknown;
}

export class RuntimeExecutionError extends Error {
  readonly code = 'RUNTIME_EXECUTION_ERROR' as const;
  readonly path?: JsonPath;
  readonly cause?: unknown;

  constructor(message: string, options: RuntimeExecutionErrorOptions = {}) {
    super(message);
    this.name = 'RuntimeExecutionError';
    this.path = options.path;
    this.cause = options.cause;
  }
}
