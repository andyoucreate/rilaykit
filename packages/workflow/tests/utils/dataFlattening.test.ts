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

    it('should handle step and field with identical names (coveredPersons.coveredPersons)', () => {
      // Bug: When a step ID and its field ID have the same name,
      // conditions like when('coveredPersons.coveredPersons') fail
      const allData = {
        products: {
          requestedProducts: ['health'],
        },
        persons: {
          coveredPersons: ['spouse', 'children'],
        },
      };

      const stepData = {};

      const result = combineWorkflowDataForConditions(allData, stepData);

      // Should be able to access the nested field with dot notation
      expect(result['persons.coveredPersons']).toEqual(['spouse', 'children']);
      expect(result['products.requestedProducts']).toEqual(['health']);

      // Original nested structure should be preserved
      expect(result.persons.coveredPersons).toEqual(['spouse', 'children']);
    });

    it('should handle step and field with the exact same name (edge case)', () => {
      // Edge case: Step name = "coveredPersons", Field name = "coveredPersons"
      // This creates a structure like { coveredPersons: { coveredPersons: [...] } }
      const allData = {
        coveredPersons: {
          coveredPersons: ['spouse', 'children'],
        },
      };

      const stepData = {};

      const result = combineWorkflowDataForConditions(allData, stepData);

      // Should be able to access via the flattened path
      expect(result['coveredPersons.coveredPersons']).toEqual(['spouse', 'children']);

      // The nested structure should also be accessible
      expect(result.coveredPersons).toBeDefined();
      expect(result.coveredPersons.coveredPersons).toEqual(['spouse', 'children']);
    });

    it('should handle multiple levels of identical naming', () => {
      // Complex case with multiple steps having same-named fields
      const allData = {
        siren: {
          siren: '123456789',
        },
        legalForm: {
          legalForm: 'sarl',
        },
        activity: {
          activity: {
            value: 'tech',
            label: 'Technology',
          },
        },
      };

      const stepData = {};

      const result = combineWorkflowDataForConditions(allData, stepData);

      // All flattened paths should be accessible
      expect(result['siren.siren']).toBe('123456789');
      expect(result['legalForm.legalForm']).toBe('sarl');
      expect(result['activity.activity.value']).toBe('tech');
      expect(result['activity.activity.label']).toBe('Technology');

      // Nested structures should also work
      expect(result.siren.siren).toBe('123456789');
      expect(result.legalForm.legalForm).toBe('sarl');
      expect(result.activity.activity.value).toBe('tech');
    });

    it('should handle stepData with same key as step ID (the legalForm bug)', () => {
      // Scenario: On step "legalForm" with field "legalForm"
      // stepData has the same key as the step ID in allData
      const allData = {
        legalForm: {
          legalForm: 'sarl',
          otherField: 'value',
        },
      };

      // stepData contains the current step's form values (flat)
      // This happens when the step ID is "legalForm" and the form field is also "legalForm"
      const stepData = {
        legalForm: 'sarl',
        otherField: 'value',
      };

      const result = combineWorkflowDataForConditions(allData, stepData);

      // The flattened path MUST exist for conditions to work
      // This is the key fix: when("legalForm.legalForm").equals("sarl") must work
      expect(result['legalForm.legalForm']).toBe('sarl');
      expect(result['legalForm.otherField']).toBe('value');
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
