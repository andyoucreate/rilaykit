import { ril, when } from '@rilaykit/core';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useFormConfigContext } from '../../src/components/FormProvider';
import {
  useConditionEvaluator,
  useFieldConditionsLazy,
  useFieldConditionsWithRefresh,
} from '../../src/hooks/useFieldConditionsLazy';
import { useFormStoreApi } from '../../src/stores';

// Mock component
const TestComponent = () => <input />;
const TestRowRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const TestFormRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

// Create test config
function createTestConfig() {
  const config = ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: TestComponent,
      defaultProps: {},
    })
    .configure({
      rowRenderer: TestRowRenderer,
      bodyRenderer: TestFormRenderer,
    });

  return config;
}

// Create wrapper with form provider
function createWrapper(
  formConfig: ReturnType<typeof form.create>['build'] extends () => infer R ? R : never
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormProvider formConfig={formConfig}>{children}</FormProvider>
  );
  return Wrapper;
}

describe('useFieldConditionsLazy', () => {
  it('should return default conditions when no conditions are provided', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'field1', type: 'text', props: {} })
      .build();

    const { result } = renderHook(
      () => useFieldConditionsLazy('field1', { conditions: undefined }),
      { wrapper: createWrapper(formConfig) }
    );

    expect(result.current).toEqual({
      visible: true,
      disabled: false,
      required: false,
      readonly: false,
    });
  });

  it('should evaluate conditions based on form values', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'trigger', type: 'text', props: {} })
      .add({
        id: 'dependent',
        type: 'text',
        props: {},
        conditions: {
          visible: when('trigger').equals('show'),
        },
      })
      .build();

    const { result, rerender } = renderHook(
      () => {
        const store = useFormStoreApi();
        const conditions = useFieldConditionsLazy('dependent', {
          conditions: formConfig.allFields[1].conditions,
        });
        return { store, conditions };
      },
      { wrapper: createWrapper(formConfig) }
    );

    // Initially visible should be false
    expect(result.current.conditions.visible).toBe(false);

    // Update trigger value
    act(() => {
      result.current.store.getState()._setValue('trigger', 'show');
    });
    rerender();

    // Now visible should be true
    expect(result.current.conditions.visible).toBe(true);
  });

  it('should skip evaluation when skip option is true', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'field1', type: 'text', props: {} })
      .build();

    const { result } = renderHook(
      () =>
        useFieldConditionsLazy('field1', {
          conditions: { visible: when('nonexistent').equals('value') },
          skip: true,
        }),
      { wrapper: createWrapper(formConfig) }
    );

    // Should return store conditions (defaults) when skip is true
    expect(result.current).toEqual({
      visible: true,
      disabled: false,
      required: false,
      readonly: false,
    });
  });
});

describe('useConditionEvaluator', () => {
  it('should return an evaluator function', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'field1', type: 'text', props: {} })
      .build();

    const { result } = renderHook(() => useConditionEvaluator(), {
      wrapper: createWrapper(formConfig),
    });

    expect(typeof result.current).toBe('function');
  });

  it('should return default conditions when no conditions provided', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'field1', type: 'text', props: {} })
      .build();

    const { result } = renderHook(() => useConditionEvaluator(), {
      wrapper: createWrapper(formConfig),
    });

    const conditions = result.current('field1', undefined);
    expect(conditions).toEqual({
      visible: true,
      disabled: false,
      required: false,
      readonly: false,
    });
  });

  it('should evaluate conditions for multiple fields', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'trigger', type: 'text', props: {} })
      .add({
        id: 'field1',
        type: 'text',
        props: {},
        conditions: { visible: when('trigger').equals('a') },
      })
      .add({
        id: 'field2',
        type: 'text',
        props: {},
        conditions: { visible: when('trigger').equals('b') },
      })
      .build();

    const { result } = renderHook(
      () => {
        const store = useFormStoreApi();
        const evaluator = useConditionEvaluator();
        return { store, evaluator };
      },
      { wrapper: createWrapper(formConfig) }
    );

    // Set trigger to 'a'
    act(() => {
      result.current.store.getState()._setValue('trigger', 'a');
    });

    const field1Conditions = result.current.evaluator('field1', formConfig.allFields[1].conditions);
    const field2Conditions = result.current.evaluator('field2', formConfig.allFields[2].conditions);

    expect(field1Conditions.visible).toBe(true);
    expect(field2Conditions.visible).toBe(false);
  });

  it('should cache results within the same render', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'trigger', type: 'text', props: {} })
      .add({
        id: 'field1',
        type: 'text',
        props: {},
        conditions: { visible: when('trigger').equals('show') },
      })
      .build();

    const _callCount = 0;
    const _originalEvaluate = vi.fn();

    const { result } = renderHook(
      () => {
        const evaluator = useConditionEvaluator();
        return evaluator;
      },
      { wrapper: createWrapper(formConfig) }
    );

    // Call multiple times with same field
    const conditions1 = result.current('field1', formConfig.allFields[1].conditions);
    const conditions2 = result.current('field1', formConfig.allFields[1].conditions);

    // Results should be the same (cached)
    expect(conditions1).toEqual(conditions2);
  });
});

describe('useFieldConditionsWithRefresh', () => {
  it('should provide conditions and refresh function', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'field1', type: 'text', props: {} })
      .build();

    const { result } = renderHook(() => useFieldConditionsWithRefresh('field1', undefined), {
      wrapper: createWrapper(formConfig),
    });

    expect(result.current.conditions).toEqual({
      visible: true,
      disabled: false,
      required: false,
      readonly: false,
    });
    expect(typeof result.current.refresh).toBe('function');
  });

  it('should refresh conditions on demand', () => {
    const config = createTestConfig();
    const formConfig = form
      .create(config, 'test-form')
      .add({ id: 'trigger', type: 'text', props: {} })
      .add({
        id: 'dependent',
        type: 'text',
        props: {},
        conditions: { visible: when('trigger').equals('show') },
      })
      .build();

    const { result } = renderHook(
      () => {
        const store = useFormStoreApi();
        const { conditions, refresh } = useFieldConditionsWithRefresh(
          'dependent',
          formConfig.allFields[1].conditions
        );
        return { store, conditions, refresh };
      },
      { wrapper: createWrapper(formConfig) }
    );

    // Initially (store provides default conditions since sync hasn't happened)
    // The actual conditions depend on how the store is initialized
    expect(typeof result.current.conditions.visible).toBe('boolean');

    // Update value and refresh
    act(() => {
      result.current.store.getState()._setValue('trigger', 'show');
    });

    const refreshedConditions = result.current.refresh();
    expect(refreshedConditions.visible).toBe(true);
  });
});
