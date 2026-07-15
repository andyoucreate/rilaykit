import { type ComponentRenderContext, ConditionDependencyGraph, ril, when } from '@rilaykit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';
import { createFormStore } from '../../src/stores/formStore';

// Mock component
const TestComponent = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`field-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);
// Create test config
function createTestConfig() {
  return ril.create().component('text', {
    name: 'Text Input',
    renderer: TestComponent,
    defaultProps: {},
  });
}

describe('Conditions at Scale', () => {
  it('should show exactly the one matching field among 50 conditional fields', async () => {
    const config = createTestConfig();

    // Create a form with 1 trigger field and 50 conditional fields
    let formBuilder = form.create(config, 'perf-form').add({
      id: 'trigger',
      type: 'text',
      props: { label: 'Trigger' },
    });

    for (let i = 0; i < 50; i++) {
      formBuilder = formBuilder.add({
        id: `field${i}`,
        type: 'text',
        props: { label: `Field ${i}` },
        conditions: {
          visible: when('trigger').equals(`show${i}`),
        },
      });
    }

    const formConfig = formBuilder.build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    // Verify the form rendered
    expect(screen.getByTestId('field-trigger')).toBeInTheDocument();

    // No trigger value yet: all 50 conditional fields are hidden
    for (let i = 0; i < 50; i++) {
      expect(screen.queryByTestId(`field-field${i}`)).toBeNull();
    }

    // Setting the trigger reveals exactly the one field whose condition matches
    fireEvent.change(screen.getByTestId('field-trigger'), { target: { value: 'show37' } });

    expect(screen.getByTestId('field-field37')).toBeInTheDocument();
    for (let i = 0; i < 50; i++) {
      if (i !== 37) {
        expect(screen.queryByTestId(`field-field${i}`)).toBeNull();
      }
    }
  });

  it('should render all 100 fields of an unconditional form', () => {
    const config = createTestConfig();

    let formBuilder = form.create(config, 'perf-form-simple');

    for (let i = 0; i < 100; i++) {
      formBuilder = formBuilder.add({
        id: `field${i}`,
        type: 'text',
        props: { label: `Field ${i}` },
      });
    }

    const formConfig = formBuilder.build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    // Every one of the 100 fields is rendered, exactly once
    for (let i = 0; i < 100; i++) {
      expect(screen.getByTestId(`field-field${i}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(100);
  });

  it('ConditionDependencyGraph should resolve exact dependents for 100 fields', () => {
    const graph = new ConditionDependencyGraph();

    // Add 100 fields with various conditions
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        // Every 3rd field depends on trigger1
        graph.addField(`field${i}`, {
          visible: when('trigger1').equals('show'),
        });
      } else if (i % 3 === 1) {
        // Every 3rd+1 field depends on trigger2
        graph.addField(`field${i}`, {
          visible: when('trigger2').exists(),
        });
      } else {
        // No conditions
        graph.addField(`field${i}`, undefined);
      }
    }

    expect(graph.size).toBe(100);

    // trigger1 drives exactly the i % 3 === 0 fields, trigger2 the i % 3 === 1 ones,
    // and the unconditional i % 3 === 2 fields are driven by nothing.
    const expectedByTrigger1 = Array.from({ length: 100 }, (_, i) => i)
      .filter((i) => i % 3 === 0)
      .map((i) => `field${i}`);
    const expectedByTrigger2 = Array.from({ length: 100 }, (_, i) => i)
      .filter((i) => i % 3 === 1)
      .map((i) => `field${i}`);

    expect([...graph.getAffectedFields('trigger1')].sort()).toEqual([...expectedByTrigger1].sort());
    expect([...graph.getAffectedFields('trigger2')].sort()).toEqual([...expectedByTrigger2].sort());
    expect(graph.getAffectedFields('trigger3')).toEqual([]);

    for (let i = 2; i < 100; i += 3) {
      expect(graph.hasDependencies(`field${i}`)).toBe(false);
    }
  });

  it('ConditionDependencyGraph should resolve exact dependents across 1000 fields', () => {
    const graph = new ConditionDependencyGraph();

    // Add 1000 fields with various dependencies
    for (let i = 0; i < 1000; i++) {
      const triggerIndex = i % 10; // 10 different triggers
      graph.addField(`field${i}`, {
        visible: when(`trigger${triggerIndex}`).exists(),
      });
    }

    // Each of the 10 triggers drives exactly its 100 dependents, and repeated
    // lookups are stable (no cache corruption across 1000 calls).
    for (let i = 0; i < 1000; i++) {
      const triggerIndex = i % 10;
      const affected = graph.getAffectedFields(`trigger${triggerIndex}`);
      expect(affected).toHaveLength(100);
    }

    for (let triggerIndex = 0; triggerIndex < 10; triggerIndex++) {
      const expected = Array.from(
        { length: 100 },
        (_, k) => `field${triggerIndex + k * 10}`
      ).sort();
      expect([...graph.getAffectedFields(`trigger${triggerIndex}`)].sort()).toEqual(expected);
    }

    expect(graph.getAffectedFields('trigger10')).toEqual([]);
  });

  it('should demonstrate re-render isolation with Zustand selectors', async () => {
    const _config = createTestConfig();
    const renderCounts: Record<string, number> = {};

    // Create a tracking component
    const TrackingComponent = ({ id, field }: ComponentRenderContext) => {
      renderCounts[id] = (renderCounts[id] || 0) + 1;
      return (
        <input
          data-testid={`field-${id}`}
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      );
    };

    const trackingConfig = ril.create().component('text', {
      name: 'Text Input',
      renderer: TrackingComponent,
      defaultProps: {},
    });

    const formConfig = form
      .create(trackingConfig, 'isolation-test')
      .add({ id: 'field1', type: 'text', props: {} })
      .add({ id: 'field2', type: 'text', props: {} })
      .add({ id: 'field3', type: 'text', props: {} })
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    // Initial render
    expect(renderCounts.field1).toBe(1);
    expect(renderCounts.field2).toBe(1);
    expect(renderCounts.field3).toBe(1);

    // Note: With the current architecture, all fields might re-render
    // when ANY value changes because conditions are evaluated globally.
    // This test documents the current behavior.
  });
});

describe('Zustand Store at Scale', () => {
  it('should create 100 fully isolated stores', () => {
    // Create 100 stores
    const stores = Array.from({ length: 100 }, () =>
      createFormStore({ field1: 'value1', field2: 'value2' })
    );

    // Each store starts from the same seed...
    for (const store of stores) {
      expect(store.getState().values).toEqual({ field1: 'value1', field2: 'value2' });
    }

    // ...but is a distinct instance: writing to one leaks into no other
    stores[42].getState()._setValue('field1', 'mutated');
    expect(stores[42].getState().values.field1).toBe('mutated');
    stores.forEach((store, index) => {
      if (index !== 42) {
        expect(store.getState().values.field1).toBe('value1');
      }
    });
  });

  it('should apply 1000 updates with the correct final value per field', () => {
    const store = createFormStore({});

    // Perform 1000 value updates across 100 fields
    for (let i = 0; i < 1000; i++) {
      store.getState()._setValue(`field${i % 100}`, `value${i}`);
    }

    // Last write wins per field: field{k} was last written at i === 900 + k
    const expected: Record<string, string> = {};
    for (let k = 0; k < 100; k++) {
      expected[`field${k}`] = `value${900 + k}`;
    }
    expect(store.getState().values).toEqual(expected);
  });
});
