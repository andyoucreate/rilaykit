import { describe, expect, it } from 'vitest';
import {
  ManifestValidationError,
  RuntimeExecutionError,
  SchemaValidationError,
  formatJsonPath,
} from '../src/errors';

describe('formatJsonPath', () => {
  it('formats root paths', () => {
    expect(formatJsonPath([])).toBe('');
  });

  it('formats nested object and array paths', () => {
    expect(formatJsonPath(['steps', 2, 'nodes', 0, 'props', 'options', 3, 'value'])).toBe(
      'steps[2].nodes[0].props.options[3].value'
    );
  });
});

describe('structured errors', () => {
  it('creates schema validation errors with code and issues', () => {
    const error = new SchemaValidationError([
      { path: ['mode'], message: 'Required', code: 'invalid_type' },
    ]);

    expect(error.name).toBe('SchemaValidationError');
    expect(error.code).toBe('SCHEMA_VALIDATION_ERROR');
    expect(error.issues[0].path).toEqual(['mode']);
    expect(error.message).toContain('[mode] Required');
  });

  it('creates manifest validation errors with code and issues', () => {
    const error = new ManifestValidationError([
      { path: ['steps', 0, 'nodes', 0, 'type'], message: 'Unknown field type "missing"' },
    ]);

    expect(error.name).toBe('ManifestValidationError');
    expect(error.code).toBe('MANIFEST_VALIDATION_ERROR');
    expect(error.message).toContain('[steps[0].nodes[0].type]');
  });

  it('creates runtime execution errors with cause metadata', () => {
    const cause = new Error('handler failed');
    const error = new RuntimeExecutionError('Action failed', {
      path: ['steps', 0],
      cause,
    });

    expect(error.name).toBe('RuntimeExecutionError');
    expect(error.code).toBe('RUNTIME_EXECUTION_ERROR');
    expect(error.path).toEqual(['steps', 0]);
    expect(error.cause).toBe(cause);
  });
});
