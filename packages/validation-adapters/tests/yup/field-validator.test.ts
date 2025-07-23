import { describe, expect, it } from 'vitest';

describe('Yup adapter', () => {
  it('should be able to import Yup field validator functions', async () => {
    // Test that the module can be imported without errors
    const yupModule = await import('../../src/yup/field-validator');

    expect(yupModule.createYupValidator).toBeDefined();
    expect(yupModule.createYupStrictValidator).toBeDefined();
    expect(yupModule.createYupLenientValidator).toBeDefined();
    expect(typeof yupModule.createYupValidator).toBe('function');
    expect(typeof yupModule.createYupStrictValidator).toBe('function');
    expect(typeof yupModule.createYupLenientValidator).toBe('function');
  });

  it('should be able to import Yup form validator functions', async () => {
    // Test that the module can be imported without errors
    const yupModule = await import('../../src/yup/form-validator');

    expect(yupModule.createYupFormValidator).toBeDefined();
    expect(yupModule.createYupFormValidatorWithFieldErrors).toBeDefined();
    expect(yupModule.createYupStrictFormValidator).toBeDefined();
    expect(yupModule.createYupLenientFormValidator).toBeDefined();
    expect(typeof yupModule.createYupFormValidator).toBe('function');
  });

  it('should be able to import Yup utilities', async () => {
    // Test that the module can be imported without errors
    const yupModule = await import('../../src/yup/utils');

    expect(yupModule.yupErrorTransforms).toBeDefined();
    expect(yupModule.yupPathFormatters).toBeDefined();
    expect(yupModule.yupValidatorPresets).toBeDefined();
    expect(yupModule.yupSchemas).toBeDefined();
    expect(yupModule.createYupValidatorWithPreset).toBeDefined();
    expect(yupModule.createYupFormValidatorWithPreset).toBeDefined();
    expect(yupModule.isYupError).toBeDefined();
    expect(typeof yupModule.isYupError).toBe('function');
  });

  it('should be able to import from main Yup index', async () => {
    // Test that the main index can be imported without errors
    const yupModule = await import('../../src/yup');

    expect(yupModule.createYupValidator).toBeDefined();
    expect(yupModule.createYupFormValidator).toBeDefined();
    expect(yupModule.yupErrorTransforms).toBeDefined();
    expect(yupModule.yupPathFormatters).toBeDefined();
  });
});
