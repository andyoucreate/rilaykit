import { describe, expect, it, vi } from 'vitest';
import { ril } from '../../src/config/ril';
import { ValidationError } from '../../src/errors';
import { entriesOf } from '../helpers/entries';

describe('ril - Immutable API', () => {
  describe('component immutability', () => {
    it('should return a new instance when adding components', () => {
      const original = ril.create();
      const withText = original.component('text', {
        name: 'Text Input',
        renderer: vi.fn(),
      });

      // Should be different instances
      expect(withText).not.toBe(original);

      // Original should not have the component
      expect(original.hasComponent('text')).toBe(false);

      // New instance should have the component
      expect(withText.hasComponent('text')).toBe(true);
    });

    it('should preserve existing components in new instance', () => {
      const original = ril.create().component('text', { name: 'Text', renderer: vi.fn() });

      const withEmail = original.component('email', {
        name: 'Email',
        renderer: vi.fn(),
      });

      // Both components should exist in new instance
      expect(withEmail.hasComponent('text')).toBe(true);
      expect(withEmail.hasComponent('email')).toBe(true);

      // Original should only have text
      expect(original.hasComponent('text')).toBe(true);
      expect(original.hasComponent('email')).toBe(false);
    });

    it('should maintain type safety with chaining', () => {
      const config = ril
        .create()
        .component('text', { name: 'Text', renderer: vi.fn() })
        .component('email', { name: 'Email', renderer: vi.fn() });

      // TypeScript should infer the correct types
      const textComponent = config.getComponent('text');
      const emailComponent = config.getComponent('email');

      expect(textComponent?.type).toBe('text');
      expect(emailComponent?.type).toBe('email');
    });
  });

  describe('clone method', () => {
    it('should create independent copy', () => {
      const original = ril.create().component('text', { name: 'Text', renderer: vi.fn() });

      const cloned = original.clone();

      // Should be different instances
      expect(cloned).not.toBe(original);

      // Should have same content
      expect(cloned.hasComponent('text')).toBe(true);

      // Modifications to clone should not affect original
      const modified = cloned.component('email', {
        name: 'Email',
        renderer: vi.fn(),
      });

      expect(modified.hasComponent('email')).toBe(true);
      expect(original.hasComponent('email')).toBe(false);
      expect(cloned.hasComponent('email')).toBe(false);
    });
  });
});

describe('ril - Enhanced Validation', () => {
  describe('asynchronous validation', () => {
    it('should return success result for valid configuration', async () => {
      const config = ril.create().component('text', { name: 'Text Input', renderer: vi.fn() });

      const result = await config.validateAsync();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should throw ValidationError for invalid renderer type', async () => {
      const config = ril.create();
      // Add invalid component
      entriesOf(config).set('component:invalid', {
        kind: 'component',
        type: 'invalid',
        name: 'Invalid',
        renderer: 'not-a-function', // Invalid renderer type
      });

      await expect(config.validateAsync()).rejects.toThrow(ValidationError);
    });

    it('should include warnings for non-standard naming', async () => {
      const config = ril
        .create()
        .component('text-input', { name: 'Text Input', renderer: vi.fn() });

      const result = await config.validateAsync();

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'Component "text-input" uses non-standard naming (contains spaces or dashes)'
      );
    });

    it('should warn about large number of components', async () => {
      let config = ril.create();

      // Add many components to trigger warning
      for (let i = 0; i < 51; i++) {
        config = config.component(`component${i}`, {
          name: `Component ${i}`,
          renderer: vi.fn(),
        });
      }

      const result = await config.validateAsync();

      expect(result.warnings).toContain(
        'Large number of components detected. Consider splitting configuration.'
      );
    });
  });
});

describe('ril - Type Safety', () => {
  it('should maintain type constraints with Record bounds', () => {
    // This should compile without issues
    const config = ril.create<{ text: { label: string } }>().component('text', {
      name: 'Text Input',
      renderer: vi.fn(),
      defaultProps: { label: 'Default' },
    });

    expect(config.hasComponent('text')).toBe(true);
  });

  it('should provide correct component typing', () => {
    const config = ril.create().component('text', {
      name: 'Text',
      renderer: vi.fn(),
      defaultProps: { placeholder: 'Enter text' },
    });

    const component = config.getComponent('text');
    expect(component?.name).toBe('Text');
    expect(component?.defaultProps).toEqual({ placeholder: 'Enter text' });
  });
});

describe('ril - Error Hierarchy', () => {
  it('should create structured ValidationError', () => {
    const error = new ValidationError('Test error', { field: 'test' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('VALIDATION');
    expect(error.meta).toEqual({ field: 'test' });
  });

  it('should include metadata in async validation errors', async () => {
    const config = ril.create();
    // Force error condition with an invalid renderer type
    entriesOf(config).set('component:broken', {
      kind: 'component',
      type: 'broken',
      name: 'Broken',
      renderer: 'not-a-function',
    });

    try {
      await config.validateAsync();
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).meta).toBeDefined();
      expect((error as ValidationError).meta?.componentCount).toBeGreaterThanOrEqual(0);
    }
  });
});
