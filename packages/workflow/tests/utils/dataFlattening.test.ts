import { describe, expect, it } from 'vitest';
import {
  combineWorkflowDataForConditions,
  extractStepData,
  flattenObject,
  mergeStepData,
} from '../../src/utils/dataFlattening';

describe('dataFlattening utilities', () => {
  describe('flattenObject', () => {
    it('should flatten a simple nested object', () => {
      const nested = {
        products: {
          requestedProducts: ['health', 'provident'],
        },
        user: {
          profile: {
            name: 'John Doe',
            age: 30,
          },
        },
      };

      const result = flattenObject(nested);

      expect(result).toEqual({
        'products.requestedProducts': ['health', 'provident'],
        'user.profile.name': 'John Doe',
        'user.profile.age': 30,
      });
    });

    it('should preserve arrays and dates', () => {
      const nested = {
        items: ['a', 'b', 'c'],
        dates: {
          created: new Date('2023-01-01'),
          updated: new Date('2023-12-31'),
        },
        nullValue: null,
        undefinedValue: undefined,
      };

      const result = flattenObject(nested);

      expect(result).toEqual({
        items: ['a', 'b', 'c'],
        'dates.created': new Date('2023-01-01'),
        'dates.updated': new Date('2023-12-31'),
        nullValue: null,
        undefinedValue: undefined,
      });
    });

    it('should handle empty objects', () => {
      expect(flattenObject({})).toEqual({});
    });

    it('should handle objects with no nested properties', () => {
      const flat = {
        name: 'John',
        age: 30,
        active: true,
      };

      const result = flattenObject(flat);

      expect(result).toEqual(flat);
    });

    it('should handle deeply nested objects', () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };

      const result = flattenObject(deep);

      expect(result).toEqual({
        'level1.level2.level3.level4.value': 'deep',
      });
    });
  });

  describe('combineWorkflowDataForConditions', () => {
    it('should combine and flatten workflow data', () => {
      const allData = {
        products: {
          requestedProducts: ['provident'],
        },
        user: {
          email: 'test@example.com',
        },
      };

      const stepData = {
        currentStep: {
          siren: '123456789',
        },
      };

      const result = combineWorkflowDataForConditions(allData, stepData);

      // Should contain both nested and flattened versions
      expect(result).toMatchObject({
        // Original nested structure
        products: {
          requestedProducts: ['provident'],
        },
        user: {
          email: 'test@example.com',
        },
        currentStep: {
          siren: '123456789',
        },
        // Flattened structure for conditions
        'products.requestedProducts': ['provident'],
        'user.email': 'test@example.com',
        'currentStep.siren': '123456789',
      });
    });

    it('should handle stepData overriding allData', () => {
      const allData = {
        user: {
          name: 'John',
          age: 30,
        },
      };

      const stepData = {
        user: {
          name: 'Jane', // This should override
          email: 'jane@example.com', // This should be added
        },
      };

      const result = combineWorkflowDataForConditions(allData, stepData);

      expect(result.user.name).toBe('Jane');
      expect(result.user.email).toBe('jane@example.com');
      expect(result['user.name']).toBe('Jane');
      expect(result['user.email']).toBe('jane@example.com');
    });

    it('should reproduce the QuotePricingFlow scenario', () => {
      // This reproduces the exact scenario from the real-world bug
      const allData = {
        products: {
          requestedProducts: ['provident'],
        },
        siren: {
          siren: {
            value: '949140511',
            label: 'Lily SARL (75001)',
          },
        },
        legalForm: {
          legalForm: 'sarl',
        },
      };

      const stepData = {};

      const result = combineWorkflowDataForConditions(allData, stepData);

      // The key fix: conditions can now access 'products.requestedProducts'
      expect(result['products.requestedProducts']).toEqual(['provident']);
      expect(result['siren.siren.value']).toBe('949140511');
      expect(result['legalForm.legalForm']).toBe('sarl');

      // Original nested structure is also preserved
      expect(result.products.requestedProducts).toEqual(['provident']);
    });
  });

  describe('extractStepData', () => {
    it('should extract step-specific data', () => {
      const workflowData = {
        products: { requestedProducts: ['health'] },
        siren: { siren: '123' },
        personalInfo: { email: 'test@example.com' },
      };

      expect(extractStepData(workflowData, 'products')).toEqual({
        requestedProducts: ['health'],
      });

      expect(extractStepData(workflowData, 'siren')).toEqual({
        siren: '123',
      });

      expect(extractStepData(workflowData, 'nonexistent')).toEqual({});
    });
  });

  describe('mergeStepData', () => {
    it('should merge step data into workflow data', () => {
      const workflowData = {
        products: { requestedProducts: ['health'] },
        siren: { siren: '123' },
      };

      const result = mergeStepData(workflowData, 'siren', {
        siren: '456',
        companyName: 'Test Company',
      });

      expect(result).toEqual({
        products: { requestedProducts: ['health'] },
        siren: {
          siren: '456',
          companyName: 'Test Company',
        },
      });
    });

    it('should create new step data if it does not exist', () => {
      const workflowData = {
        products: { requestedProducts: ['health'] },
      };

      const result = mergeStepData(workflowData, 'newStep', {
        field: 'value',
      });

      expect(result).toEqual({
        products: { requestedProducts: ['health'] },
        newStep: {
          field: 'value',
        },
      });
    });
  });
});
