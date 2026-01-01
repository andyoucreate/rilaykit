import { describe, expect, it } from 'vitest';
import {
  extractAllDependencies,
  extractConditionDependencies,
  when,
  type ConditionConfig,
} from '../../src/conditions';

describe('extractConditionDependencies', () => {
  describe('Simple conditions', () => {
    it('should extract field from simple equals condition', () => {
      const condition = when('field1').equals('value');
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toEqual(['field1']);
    });

    it('should extract field from exists condition', () => {
      const condition = when('myField').exists();
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toEqual(['myField']);
    });

    it('should extract field from notEquals condition', () => {
      const condition = when('status').notEquals('inactive');
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toEqual(['status']);
    });

    it('should extract nested field path', () => {
      const condition = when('step1.field1').equals('value');
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toEqual(['step1.field1']);
    });

    it('should extract deeply nested field path', () => {
      const condition = when('data.user.profile.name').contains('John');
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toEqual(['data.user.profile.name']);
    });
  });

  describe('AND conditions', () => {
    it('should extract fields from AND condition', () => {
      const condition = when('field1').equals('a').and(when('field2').equals('b'));
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toHaveLength(2);
      expect(deps).toContain('field1');
      expect(deps).toContain('field2');
    });

    it('should extract fields from multiple AND conditions', () => {
      const condition = when('field1')
        .equals('a')
        .and(when('field2').equals('b'))
        .and(when('field3').exists());
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toHaveLength(3);
      expect(deps).toContain('field1');
      expect(deps).toContain('field2');
      expect(deps).toContain('field3');
    });
  });

  describe('OR conditions', () => {
    it('should extract fields from OR condition', () => {
      const condition = when('status').equals('active').or(when('role').equals('admin'));
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toHaveLength(2);
      expect(deps).toContain('status');
      expect(deps).toContain('role');
    });
  });

  describe('Mixed AND/OR conditions', () => {
    it('should extract all fields from mixed conditions', () => {
      const condition = when('field1')
        .equals('a')
        .and(when('field2').equals('b'))
        .or(when('field3').exists());
      const deps = extractConditionDependencies(condition);
      
      expect(deps).toHaveLength(3);
      expect(deps).toContain('field1');
      expect(deps).toContain('field2');
      expect(deps).toContain('field3');
    });
  });

  describe('Duplicate fields', () => {
    it('should deduplicate field references', () => {
      const condition = when('field1')
        .equals('a')
        .and(when('field1').notEquals('b'));
      const deps = extractConditionDependencies(condition);
      
      // Should only have one reference to field1
      expect(deps).toEqual(['field1']);
    });
  });

  describe('Edge cases', () => {
    it('should return empty array for undefined condition', () => {
      const deps = extractConditionDependencies(undefined);
      expect(deps).toEqual([]);
    });

    it('should return empty array for null condition', () => {
      const deps = extractConditionDependencies(null);
      expect(deps).toEqual([]);
    });

    it('should handle ConditionConfig directly', () => {
      const config: ConditionConfig = {
        field: 'directField',
        operator: 'equals',
        value: 'test',
      };
      const deps = extractConditionDependencies(config);
      
      expect(deps).toEqual(['directField']);
    });

    it('should handle ConditionConfig with nested conditions', () => {
      const config: ConditionConfig = {
        field: '',
        operator: 'exists',
        logicalOperator: 'and',
        conditions: [
          { field: 'nested1', operator: 'equals', value: 'a' },
          { field: 'nested2', operator: 'exists' },
        ],
      };
      const deps = extractConditionDependencies(config);
      
      expect(deps).toHaveLength(2);
      expect(deps).toContain('nested1');
      expect(deps).toContain('nested2');
    });
  });
});

describe('extractAllDependencies', () => {
  it('should extract dependencies from multiple condition types', () => {
    const behaviors = {
      visible: when('showField').equals(true),
      disabled: when('locked').equals(true),
      required: when('mandatory').exists(),
    };
    
    const deps = extractAllDependencies(behaviors);
    
    expect(deps).toHaveLength(3);
    expect(deps).toContain('showField');
    expect(deps).toContain('locked');
    expect(deps).toContain('mandatory');
  });

  it('should deduplicate across behaviors', () => {
    const behaviors = {
      visible: when('status').equals('active'),
      disabled: when('status').equals('readonly'),
    };
    
    const deps = extractAllDependencies(behaviors);
    
    expect(deps).toEqual(['status']);
  });

  it('should handle undefined conditions', () => {
    const behaviors = {
      visible: when('field1').exists(),
      disabled: undefined,
      required: null,
    };
    
    const deps = extractAllDependencies(behaviors);
    
    expect(deps).toEqual(['field1']);
  });

  it('should return empty array when no conditions', () => {
    const behaviors = {
      visible: undefined,
      disabled: undefined,
    };
    
    const deps = extractAllDependencies(behaviors);
    
    expect(deps).toEqual([]);
  });
});

