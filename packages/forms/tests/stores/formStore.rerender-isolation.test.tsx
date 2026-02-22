import { act, render, screen } from '@testing-library/react';
import type React from 'react';
import { memo, useRef } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type FormStore,
  FormStoreContext,
  createFormStore,
  useFieldConditions,
  useFieldErrors,
  useFieldTouched,
  useFieldValue,
  useFormDirty,
  useFormSubmitState,
  useFormSubmitting,
  useFormValid,
} from '../../src/stores/formStore';

function createWrapper(initialValues: Record<string, unknown> = {}) {
  const store = createFormStore(initialValues);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormStoreContext.Provider value={store}>{children}</FormStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('FormStore Re-render Isolation', () => {
  describe('Field Value Isolation', () => {
    it('changing field1 value should NOT re-render field2 component', () => {
      const { store } = createWrapper({ field1: 'a', field2: 'b' });
      const field1Renders: number[] = [];
      const field2Renders: number[] = [];

      const Field1 = memo(() => {
        const value = useFieldValue('field1');
        field1Renders.push(Date.now());
        return <div data-testid="field1">{String(value)}</div>;
      });

      const Field2 = memo(() => {
        const value = useFieldValue('field2');
        field2Renders.push(Date.now());
        return <div data-testid="field2">{String(value)}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <Field1 />
          <Field2 />
        </FormStoreContext.Provider>
      );

      expect(field1Renders.length).toBe(1);
      expect(field2Renders.length).toBe(1);

      // Change field1
      act(() => {
        store.getState()._setValue('field1', 'modified');
      });

      // field1 should re-render, field2 should NOT
      expect(field1Renders.length).toBe(2);
      expect(field2Renders.length).toBe(1);
      expect(screen.getByTestId('field1')).toHaveTextContent('modified');
      expect(screen.getByTestId('field2')).toHaveTextContent('b');
    });

    it('changing field value should NOT re-render error-only subscribers', () => {
      const { store } = createWrapper({ field1: 'value' });
      const valueRenders: number[] = [];
      const errorRenders: number[] = [];

      const ValueComponent = memo(() => {
        const value = useFieldValue('field1');
        valueRenders.push(Date.now());
        return <div data-testid="value">{String(value)}</div>;
      });

      const ErrorComponent = memo(() => {
        const errors = useFieldErrors('field1');
        errorRenders.push(Date.now());
        return <div data-testid="errors">{errors.length}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <ValueComponent />
          <ErrorComponent />
        </FormStoreContext.Provider>
      );

      expect(valueRenders.length).toBe(1);
      expect(errorRenders.length).toBe(1);

      // Change value - should NOT trigger error component re-render
      act(() => {
        store.getState()._setValue('field1', 'new-value');
      });

      expect(valueRenders.length).toBe(2);
      expect(errorRenders.length).toBe(1);
    });

    it('setting errors should NOT re-render value subscribers', () => {
      const { store } = createWrapper({ field1: 'value' });
      const valueRenders: number[] = [];
      const errorRenders: number[] = [];

      const ValueComponent = memo(() => {
        const value = useFieldValue('field1');
        valueRenders.push(Date.now());
        return <div data-testid="value">{String(value)}</div>;
      });

      const ErrorComponent = memo(() => {
        const errors = useFieldErrors('field1');
        errorRenders.push(Date.now());
        return <div data-testid="errors">{errors.length}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <ValueComponent />
          <ErrorComponent />
        </FormStoreContext.Provider>
      );

      expect(valueRenders.length).toBe(1);
      expect(errorRenders.length).toBe(1);

      // Set errors - should NOT trigger value component re-render
      act(() => {
        store.getState()._setErrors('field1', [{ message: 'Error' }]);
      });

      expect(valueRenders.length).toBe(1);
      expect(errorRenders.length).toBe(2);
    });
  });

  describe('Form-level State Isolation', () => {
    it('changing submitting should NOT re-render validity subscribers', () => {
      const { store } = createWrapper({});
      const submittingRenders: number[] = [];
      const validRenders: number[] = [];

      const SubmittingComponent = memo(() => {
        const submitting = useFormSubmitting();
        submittingRenders.push(Date.now());
        return <div data-testid="submitting">{submitting ? 'yes' : 'no'}</div>;
      });

      const ValidComponent = memo(() => {
        const valid = useFormValid();
        validRenders.push(Date.now());
        return <div data-testid="valid">{valid ? 'yes' : 'no'}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <SubmittingComponent />
          <ValidComponent />
        </FormStoreContext.Provider>
      );

      expect(submittingRenders.length).toBe(1);
      expect(validRenders.length).toBe(1);

      // Change submitting
      act(() => {
        store.getState()._setSubmitting(true);
      });

      expect(submittingRenders.length).toBe(2);
      expect(validRenders.length).toBe(1); // Should NOT re-render
    });

    it('changing dirty should NOT re-render submitting subscribers', () => {
      const { store } = createWrapper({ field1: 'initial' });
      const dirtyRenders: number[] = [];
      const submittingRenders: number[] = [];

      const DirtyComponent = memo(() => {
        const dirty = useFormDirty();
        dirtyRenders.push(Date.now());
        return <div data-testid="dirty">{dirty ? 'yes' : 'no'}</div>;
      });

      const SubmittingComponent = memo(() => {
        const submitting = useFormSubmitting();
        submittingRenders.push(Date.now());
        return <div data-testid="submitting">{submitting ? 'yes' : 'no'}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <DirtyComponent />
          <SubmittingComponent />
        </FormStoreContext.Provider>
      );

      expect(dirtyRenders.length).toBe(1);
      expect(submittingRenders.length).toBe(1);

      // Make form dirty
      act(() => {
        store.getState()._setValue('field1', 'modified');
      });

      expect(dirtyRenders.length).toBe(2);
      expect(submittingRenders.length).toBe(1); // Should NOT re-render
    });
  });

  describe('Touched State Isolation', () => {
    it('touching field1 should NOT re-render field2 touched subscriber', () => {
      const { store } = createWrapper({});
      const field1Renders: number[] = [];
      const field2Renders: number[] = [];

      const TouchedField1 = memo(() => {
        const touched = useFieldTouched('field1');
        field1Renders.push(Date.now());
        return <div data-testid="touched1">{touched ? 'yes' : 'no'}</div>;
      });

      const TouchedField2 = memo(() => {
        const touched = useFieldTouched('field2');
        field2Renders.push(Date.now());
        return <div data-testid="touched2">{touched ? 'yes' : 'no'}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <TouchedField1 />
          <TouchedField2 />
        </FormStoreContext.Provider>
      );

      expect(field1Renders.length).toBe(1);
      expect(field2Renders.length).toBe(1);

      // Touch field1
      act(() => {
        store.getState()._setTouched('field1');
      });

      expect(field1Renders.length).toBe(2);
      expect(field2Renders.length).toBe(1); // Should NOT re-render
    });
  });

  describe('Conditions Isolation', () => {
    it('changing field1 conditions should NOT re-render field2 conditions subscriber', () => {
      const { store } = createWrapper({});
      const field1Renders: number[] = [];
      const field2Renders: number[] = [];

      const ConditionsField1 = memo(() => {
        const conditions = useFieldConditions('field1');
        field1Renders.push(Date.now());
        return <div data-testid="cond1">{conditions.visible ? 'yes' : 'no'}</div>;
      });

      const ConditionsField2 = memo(() => {
        const conditions = useFieldConditions('field2');
        field2Renders.push(Date.now());
        return <div data-testid="cond2">{conditions.visible ? 'yes' : 'no'}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <ConditionsField1 />
          <ConditionsField2 />
        </FormStoreContext.Provider>
      );

      expect(field1Renders.length).toBe(1);
      expect(field2Renders.length).toBe(1);

      // Change field1 conditions
      act(() => {
        store.getState()._setFieldConditions('field1', {
          visible: false,
          disabled: true,
          required: false,
          readonly: false,
        });
      });

      expect(field1Renders.length).toBe(2);
      expect(field2Renders.length).toBe(1); // Should NOT re-render
    });
  });

  describe('Complex Isolation Scenarios', () => {
    it('should handle 10 fields with isolated updates', () => {
      const { store } = createWrapper(
        Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, `value${i}`]))
      );
      const renderCounts: number[] = Array(10).fill(0);

      const Fields = memo(() => (
        <>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <FieldComponent key={`field-${i}`} index={i} renderCounts={renderCounts} />
          ))}
        </>
      ));

      const FieldComponent = memo(
        ({ index, renderCounts }: { index: number; renderCounts: number[] }) => {
          const value = useFieldValue(`field${index}`);
          renderCounts[index]++;
          return <div data-testid={`field${index}`}>{String(value)}</div>;
        }
      );

      render(
        <FormStoreContext.Provider value={store}>
          <Fields />
        </FormStoreContext.Provider>
      );

      // All should have rendered once
      expect(renderCounts.every((c) => c === 1)).toBe(true);

      // Update only field5
      act(() => {
        store.getState()._setValue('field5', 'updated');
      });

      // Only field5 should have re-rendered
      for (let i = 0; i < 10; i++) {
        if (i === 5) {
          expect(renderCounts[i]).toBe(2);
        } else {
          expect(renderCounts[i]).toBe(1);
        }
      }
    });

    it('should handle multiple state updates in single batch', () => {
      const { store } = createWrapper({ field1: 'a', field2: 'b' });
      const field1Renders: number[] = [];
      const field2Renders: number[] = [];

      const Field1 = memo(() => {
        const value = useFieldValue('field1');
        field1Renders.push(Date.now());
        return <div>{String(value)}</div>;
      });

      const Field2 = memo(() => {
        const value = useFieldValue('field2');
        field2Renders.push(Date.now());
        return <div>{String(value)}</div>;
      });

      render(
        <FormStoreContext.Provider value={store}>
          <Field1 />
          <Field2 />
        </FormStoreContext.Provider>
      );

      expect(field1Renders.length).toBe(1);
      expect(field2Renders.length).toBe(1);

      // Update both fields in batch
      act(() => {
        store.getState()._setValue('field1', 'new1');
        store.getState()._setValue('field2', 'new2');
      });

      // Both should have re-rendered exactly once more
      expect(field1Renders.length).toBe(2);
      expect(field2Renders.length).toBe(2);
    });
  });

  describe('useFormSubmitState Optimization', () => {
    it('should only re-render when one of the three values changes', () => {
      const { store } = createWrapper({});
      const renders: number[] = [];

      const SubmitButton = memo(() => {
        const { isSubmitting, isValid } = useFormSubmitState();
        renders.push(Date.now());
        return (
          <button disabled={isSubmitting || !isValid}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        );
      });

      render(
        <FormStoreContext.Provider value={store}>
          <SubmitButton />
        </FormStoreContext.Provider>
      );

      expect(renders.length).toBe(1);

      // Change value (which affects isDirty)
      act(() => {
        store.getState()._setValue('field', 'value');
      });

      expect(renders.length).toBe(2);

      // Change touched (should NOT affect submit state)
      act(() => {
        store.getState()._setTouched('field');
      });

      expect(renders.length).toBe(2); // Should NOT re-render
    });
  });
});
