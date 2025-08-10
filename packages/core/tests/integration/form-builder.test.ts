import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ril } from '../../src/index';

// Mock React to avoid errors
vi.mock('react', () => ({
  createElement: vi.fn((type, props, ...children) => ({ type, props, children })),
}));

describe('Core-FormBuilder Integration', () => {
  let config: any;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: vi.fn(),
        defaultProps: { placeholder: 'Enter text' },
      })
      .addComponent('email', {
        name: 'Email Input',
        renderer: vi.fn(),
        defaultProps: { placeholder: 'Enter email' },
      })
      .configure({
        bodyRenderer: vi.fn(),
        rowRenderer: vi.fn(),
        submitButtonRenderer: vi.fn(),
      });
  });

  describe('Component Registry', () => {
    it('should register components correctly', () => {
      const textComponent = config.getComponent('text');
      const emailComponent = config.getComponent('email');

      expect(textComponent).toBeDefined();
      expect(textComponent.name).toBe('Text Input');
      expect(emailComponent).toBeDefined();
      expect(emailComponent.name).toBe('Email Input');
    });

    it('should return null for non-existent components', () => {
      const nonExistent = config.getComponent('nonexistent');
      expect(nonExistent).toBeUndefined();
    });

    it('should check component existence', () => {
      expect(config.hasComponent('text')).toBe(true);
      expect(config.hasComponent('email')).toBe(true);
      expect(config.hasComponent('nonexistent')).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    it('should store render configuration', () => {
      const renderConfig = config.getFormRenderConfig();

      expect(renderConfig).toBeDefined();
      expect(renderConfig.bodyRenderer).toBeDefined();
      expect(renderConfig.rowRenderer).toBeDefined();
      expect(renderConfig.submitButtonRenderer).toBeDefined();
    });

    it('should maintain component registry state', () => {
      // Add more components (immutable API returns new instance)
      config = config.addComponent('number', {
        name: 'Number Input',
        renderer: vi.fn(),
        defaultProps: { min: 0 },
      });

      expect(config.hasComponent('number')).toBe(true);

      const numberComponent = config.getComponent('number');
      expect(numberComponent.name).toBe('Number Input');
      expect(numberComponent.defaultProps.min).toBe(0);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type information across operations', () => {
      const textComponent = config.getComponent('text');

      expect(textComponent.type).toBe('text');
      expect(textComponent.defaultProps).toEqual({ placeholder: 'Enter text' });
    });

    it('should handle component props merging', () => {
      const component = config.getComponent('text');

      // Simulate props merging like in form builder
      const mergedProps = {
        ...component.defaultProps,
        label: 'Custom Label',
        required: true,
      };

      expect(mergedProps.placeholder).toBe('Enter text');
      expect(mergedProps.label).toBe('Custom Label');
      expect(mergedProps.required).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid component registration gracefully', () => {
      expect(() => {
        config.addComponent('invalid', {
          name: 'Invalid Component',
          renderer: null,
          defaultProps: {},
        });
      }).not.toThrow();
    });

    it('should handle missing configuration gracefully', () => {
      const emptyConfig = ril.create<Record<string, any>>();

      expect(emptyConfig.getComponent('text')).toBeUndefined();
      expect(emptyConfig.hasComponent('text')).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should handle many components efficiently', () => {
      const startTime = performance.now();

      // Add 100 components (immutable API requires reassignment)
      for (let i = 0; i < 100; i++) {
        config = config.addComponent(`component${i}`, {
          name: `Component ${i}`,
          renderer: vi.fn(),
          defaultProps: { index: i },
        });
      }

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      expect(config.hasComponent('component50')).toBe(true);
    });

    it('should handle component lookups efficiently', () => {
      // Add some components first
      for (let i = 0; i < 50; i++) {
        config.addComponent(`component${i}`, {
          name: `Component ${i}`,
          renderer: vi.fn(),
          defaultProps: { index: i },
        });
      }

      const startTime = performance.now();

      // Perform many lookups
      for (let i = 0; i < 1000; i++) {
        config.getComponent('component25');
      }

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });
  });

  describe('Real-world Usage', () => {
    it('should support form building patterns', () => {
      // Simulate form builder usage patterns
      const fields = [
        { id: 'firstName', type: 'text', label: 'First Name' },
        { id: 'lastName', type: 'text', label: 'Last Name' },
        { id: 'email', type: 'email', label: 'Email' },
      ];

      const formFields = fields.map((field) => {
        const component = config.getComponent(field.type);

        return {
          id: field.id,
          componentId: component?.type,
          props: {
            ...component?.defaultProps,
            label: field.label,
          },
        };
      });

      expect(formFields).toHaveLength(3);
      expect(formFields[0].componentId).toBe('text');
      expect(formFields[0].props.label).toBe('First Name');
      expect(formFields[2].componentId).toBe('email');
    });

    it('should support complex form configurations', () => {
      // Test a more complex configuration
      const complexConfig = ril
        .create()
        .addComponent('text', {
          name: 'Text Input',
          renderer: vi.fn(),
          defaultProps: { type: 'text', autocomplete: 'off' },
        })
        .addComponent('select', {
          name: 'Select Input',
          renderer: vi.fn(),
          defaultProps: { options: [] },
        })
        .addComponent('checkbox', {
          name: 'Checkbox Input',
          renderer: vi.fn(),
          defaultProps: { checked: false },
        })
        .configure({
          bodyRenderer: vi.fn(),
          rowRenderer: vi.fn(),
          submitButtonRenderer: vi.fn(),
        });

      expect(complexConfig.hasComponent('text')).toBe(true);
      expect(complexConfig.hasComponent('select')).toBe(true);
      expect(complexConfig.hasComponent('checkbox')).toBe(true);

      const selectComponent = complexConfig.getComponent('select');
      expect(selectComponent).toBeDefined();
      if (selectComponent?.defaultProps) {
        expect(selectComponent.defaultProps.options).toEqual([]);
      }
    });
  });

  describe('Validation Integration', () => {
    it('should support validation configuration', async () => {
      // Test validation patterns
      const fieldConfig = {
        id: 'email',
        type: 'email',
        validation: {
          required: true,
          email: true,
          validator: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
        },
      };

      const component = config.getComponent(fieldConfig.type);
      expect(component).toBeDefined();

      // Simulate validation
      const validationResult = fieldConfig.validation.validator('test@example.com');
      await expect(validationResult).resolves.toEqual({ isValid: true, errors: [] });
    });

    it('should handle validation errors', async () => {
      const validator = vi.fn().mockResolvedValue({
        isValid: false,
        errors: [{ code: 'INVALID_EMAIL', message: 'Invalid email format' }],
      });

      const fieldConfig = {
        id: 'email',
        type: 'email',
        validation: { validator },
      };

      const result = fieldConfig.validation.validator('invalid-email');
      await expect(result).resolves.toEqual({
        isValid: false,
        errors: [{ code: 'INVALID_EMAIL', message: 'Invalid email format' }],
      });
    });
  });
});
