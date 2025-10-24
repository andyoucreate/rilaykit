/**
 * @fileoverview Tests for persistence utilities
 */

import { describe, expect, it, vi } from 'vitest';
import type { WorkflowState } from '../../src/hooks/useWorkflowState';
import type { PersistedWorkflowData } from '../../src/persistence/types';
import {
  debounce,
  generateStorageKey,
  mergePersistedState,
  persistedToWorkflowState,
  validatePersistedData,
  workflowStateToPersisted,
} from '../../src/persistence/utils';

describe('Persistence Utils', () => {
  const mockWorkflowState: WorkflowState = {
    currentStepIndex: 1,
    allData: { step1: { name: 'John' }, step2: { email: 'john@test.com' } },
    stepData: { age: 25 },
    visitedSteps: new Set(['step1', 'step2']),
    passedSteps: new Set(['step1']),
    isSubmitting: false,
    isTransitioning: true,
    isInitializing: false,
  };

  const mockPersistedData: PersistedWorkflowData = {
    workflowId: 'test-workflow',
    currentStepIndex: 2,
    allData: { step1: { name: 'Jane' }, step3: { phone: '123' } },
    stepData: { city: 'Paris' },
    visitedSteps: ['step1', 'step3'],
    lastSaved: Date.now(),
  };

  describe('workflowStateToPersisted', () => {
    it('should convert WorkflowState to PersistedWorkflowData', () => {
      const result = workflowStateToPersisted('test-workflow', mockWorkflowState);

      expect(result).toMatchObject({
        workflowId: 'test-workflow',
        currentStepIndex: mockWorkflowState.currentStepIndex,
        allData: mockWorkflowState.allData,
        stepData: mockWorkflowState.stepData,
        visitedSteps: Array.from(mockWorkflowState.visitedSteps),
      });
      expect(result.lastSaved).toBeTypeOf('number');
    });

    it('should include metadata when provided', () => {
      const metadata = { version: '1.0', source: 'test' };
      const result = workflowStateToPersisted('test-workflow', mockWorkflowState, metadata);

      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('persistedToWorkflowState', () => {
    it('should convert PersistedWorkflowData to WorkflowState', () => {
      const result = persistedToWorkflowState(mockPersistedData);

      expect(result).toMatchObject({
        currentStepIndex: mockPersistedData.currentStepIndex,
        allData: mockPersistedData.allData,
        stepData: mockPersistedData.stepData,
        isSubmitting: false,
        isTransitioning: false,
      });
      expect(result.visitedSteps).toBeInstanceOf(Set);
      expect(Array.from(result.visitedSteps!)).toEqual(mockPersistedData.visitedSteps);
    });
  });

  describe('validatePersistedData', () => {
    it('should validate correct persisted data', () => {
      expect(validatePersistedData(mockPersistedData)).toBe(true);
    });

    it('should reject null or undefined data', () => {
      expect(validatePersistedData(null)).toBe(false);
      expect(validatePersistedData(undefined)).toBe(false);
    });

    it('should reject non-object data', () => {
      expect(validatePersistedData('string')).toBe(false);
      expect(validatePersistedData(123)).toBe(false);
      expect(validatePersistedData([])).toBe(false);
    });

    it('should reject data missing required fields', () => {
      const { workflowId, ...incomplete } = mockPersistedData;

      expect(validatePersistedData(incomplete)).toBe(false);
    });

    it('should reject data with incorrect field types', () => {
      const wrongTypes = {
        ...mockPersistedData,
        currentStepIndex: 'not-a-number',
      };

      expect(validatePersistedData(wrongTypes)).toBe(false);
    });

    it('should reject data with non-array visitedSteps', () => {
      const wrongVisitedSteps = {
        ...mockPersistedData,
        visitedSteps: 'not-an-array',
      };

      expect(validatePersistedData(wrongVisitedSteps)).toBe(false);
    });
  });

  describe('generateStorageKey', () => {
    it('should generate key without userId', () => {
      const key = generateStorageKey('workflow1');
      expect(key).toBe('workflow1');
    });

    it('should generate key with userId', () => {
      const key = generateStorageKey('workflow1', 'user123');
      expect(key).toBe('user123:workflow1');
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      // Call multiple times quickly
      debouncedFn('arg1');
      debouncedFn('arg2');
      debouncedFn('arg3');

      // Should not have been called yet
      expect(mockFn).not.toHaveBeenCalled();

      // Wait for debounce delay
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have been called once with the last arguments
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('arg3');
    });

    it('should handle async functions', async () => {
      const mockAsyncFn = vi.fn().mockResolvedValue('result');
      const debouncedFn = debounce(mockAsyncFn, 50);

      debouncedFn('test');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAsyncFn).toHaveBeenCalledWith('test');
    });
  });

  describe('mergePersistedState', () => {
    it('should use persist strategy by default', () => {
      const result = mergePersistedState(mockWorkflowState, mockPersistedData);

      expect(result.currentStepIndex).toBe(mockPersistedData.currentStepIndex);
      expect(result.allData).toEqual(mockPersistedData.allData);
      expect(result.stepData).toEqual(mockPersistedData.stepData);
      expect(result.isSubmitting).toBe(mockWorkflowState.isSubmitting);
      expect(result.isTransitioning).toBe(mockWorkflowState.isTransitioning);
    });

    it('should use current strategy', () => {
      const result = mergePersistedState(mockWorkflowState, mockPersistedData, 'current');

      expect(result.currentStepIndex).toBe(mockWorkflowState.currentStepIndex);
      expect(result.allData).toEqual(mockWorkflowState.allData);
      expect(result.stepData).toEqual(mockWorkflowState.stepData);

      // Should merge visited steps
      const expectedVisitedSteps = new Set([
        ...mockWorkflowState.visitedSteps,
        ...mockPersistedData.visitedSteps,
      ]);
      expect(result.visitedSteps).toEqual(expectedVisitedSteps);
    });

    it('should use merge strategy', () => {
      const result = mergePersistedState(mockWorkflowState, mockPersistedData, 'merge');

      expect(result.currentStepIndex).toBe(mockWorkflowState.currentStepIndex);

      // Should merge allData (current takes precedence)
      expect(result.allData).toEqual({
        step1: { name: 'John' }, // from current (takes precedence)
        step2: { email: 'john@test.com' }, // from current only
        step3: { phone: '123' }, // from persisted only
      });

      // Should merge stepData (current takes precedence)
      expect(result.stepData).toEqual({
        city: 'Paris', // from persisted
        age: 25, // from current (takes precedence)
      });

      // Should merge visited steps
      const expectedVisitedSteps = new Set([
        ...mockPersistedData.visitedSteps,
        ...mockWorkflowState.visitedSteps,
      ]);
      expect(result.visitedSteps).toEqual(expectedVisitedSteps);
    });

    it('should handle unknown strategy as persist', () => {
      const result = mergePersistedState(mockWorkflowState, mockPersistedData, 'unknown' as any);

      expect(result.currentStepIndex).toBe(mockPersistedData.currentStepIndex);
      expect(result.allData).toEqual(mockPersistedData.allData);
    });
  });
});
