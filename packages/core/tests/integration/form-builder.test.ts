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
      .component('text', {
        name: 'Text Input',
        renderer: vi.fn(),
        defaultProps: { placeholder: 'Enter text' },
      })
      .component('email', {
        name: 'Email Input',
        renderer: vi.fn(),
        defaultProps: { placeholder: 'Enter email' },
      });
  });

  describe('Component Registry', () => {
    it('should register components correctly', () => {
      const textComponent = config.getComponent('text');
      const emailComponent = config.getComponent('email');

      expect(textComponent.name).toBe('Text Input');
      expect(emailComponent.name).toBe('Email Input');
    });

    it('should return undefined for non-existent components', () => {
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
    it('should maintain component registry state', () => {
      // Add more components (immutable API returns new instance)
      config = config.component('number', {
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
    it('should register renderer-less blueprint components', () => {
      const withBlueprint = config.component('blueprint', {
        name: 'Blueprint Component',
        defaultProps: {},
      });

      expect(withBlueprint.hasComponent('blueprint')).toBe(true);
      expect(withBlueprint.getComponent('blueprint').renderer).toBeUndefined();
    });

    it('should handle missing configuration gracefully', () => {
      const emptyConfig = ril.create<Record<string, any>>();

      expect(emptyConfig.getComponent('text')).toBeUndefined();
      expect(emptyConfig.hasComponent('text')).toBe(false);
    });
  });

  describe('Scale', () => {
    it('should register 100 components with every entry intact', () => {
      // Add 100 components (immutable API requires reassignment)
      for (let i = 0; i < 100; i++) {
        config = config.component(`component${i}`, {
          name: `Component ${i}`,
          renderer: vi.fn(),
          defaultProps: { index: i },
        });
      }

      for (let i = 0; i < 100; i++) {
        expect(config.hasComponent(`component${i}`)).toBe(true);
        expect(config.getComponent(`component${i}`)?.name).toBe(`Component ${i}`);
        expect(config.getComponent(`component${i}`)?.defaultProps).toEqual({ index: i });
      }
      expect(config.hasComponent('component100')).toBe(false);
    });

    it('should return a stable, identical entry across 1000 lookups', () => {
      // Add some components first
      for (let i = 0; i < 50; i++) {
        config = config.component(`component${i}`, {
          name: `Component ${i}`,
          renderer: vi.fn(),
          defaultProps: { index: i },
        });
      }

      const first = config.getComponent('component25');
      expect(first?.name).toBe('Component 25');

      // Perform many lookups: each must yield the very same entry
      for (let i = 0; i < 1000; i++) {
        expect(config.getComponent('component25')).toBe(first);
      }
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
        .component('text', {
          name: 'Text Input',
          renderer: vi.fn(),
          defaultProps: { type: 'text', autocomplete: 'off' },
        })
        .component('select', {
          name: 'Select Input',
          renderer: vi.fn(),
          defaultProps: { options: [] },
        })
        .component('checkbox', {
          name: 'Checkbox Input',
          renderer: vi.fn(),
          defaultProps: { checked: false },
        });

      expect(complexConfig.hasComponent('text')).toBe(true);
      expect(complexConfig.hasComponent('select')).toBe(true);
      expect(complexConfig.hasComponent('checkbox')).toBe(true);

      const selectComponent = complexConfig.getComponent('select');
      expect(selectComponent?.defaultProps?.options).toEqual([]);
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
      expect(component.type).toBe('email');

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
