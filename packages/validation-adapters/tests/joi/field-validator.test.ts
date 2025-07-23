import { describe, expect, it } from 'vitest';

describe('Joi adapter', () => {
  it('should be able to import Joi field validator functions', async () => {
    // Test that the module can be imported without errors
    const joiModule = await import('../../src/joi/field-validator');

    expect(joiModule.createJoiValidator).toBeDefined();
    expect(joiModule.createJoiStrictValidator).toBeDefined();
    expect(joiModule.createJoiLenientValidator).toBeDefined();
    expect(typeof joiModule.createJoiValidator).toBe('function');
    expect(typeof joiModule.createJoiStrictValidator).toBe('function');
    expect(typeof joiModule.createJoiLenientValidator).toBe('function');
  });

  it('should be able to import Joi form validator functions', async () => {
    // Test that the module can be imported without errors
    const joiModule = await import('../../src/joi/form-validator');

    expect(joiModule.createJoiFormValidator).toBeDefined();
    expect(joiModule.createJoiFormValidatorWithFieldErrors).toBeDefined();
    expect(joiModule.createJoiStrictFormValidator).toBeDefined();
    expect(joiModule.createJoiLenientFormValidator).toBeDefined();
    expect(typeof joiModule.createJoiFormValidator).toBe('function');
  });

  it('should be able to import Joi utilities', async () => {
    // Test that the module can be imported without errors
    const joiModule = await import('../../src/joi/utils');

    expect(joiModule.joiErrorTransforms).toBeDefined();
    expect(joiModule.joiPathFormatters).toBeDefined();
    expect(joiModule.joiValidatorPresets).toBeDefined();
    expect(joiModule.joiMessages).toBeDefined();
    expect(joiModule.createJoiValidatorWithPreset).toBeDefined();
    expect(joiModule.createJoiFormValidatorWithPreset).toBeDefined();
    expect(joiModule.isJoiError).toBeDefined();
    expect(typeof joiModule.isJoiError).toBe('function');
  });

  it('should be able to import from main Joi index', async () => {
    // Test that the main index can be imported without errors
    const joiModule = await import('../../src/joi');

    expect(joiModule.createJoiValidator).toBeDefined();
    expect(joiModule.createJoiFormValidator).toBeDefined();
    expect(joiModule.joiErrorTransforms).toBeDefined();
    expect(joiModule.joiPathFormatters).toBeDefined();
  });
});
