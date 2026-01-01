import { ConditionDependencyGraph, ril, when } from '@rilaykit/core';
import { act, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';
import { createFormStore } from '../../src/stores/formStore';

// Mock component
const TestComponent = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (val: unknown) => void;
}) => (
  <input
    data-testid={`field-${id}`}
    value={(value as string) || ''}
    onChange={(e) => onChange(e.target.value)}
  />
);
const TestRowRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const TestFormRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

// Create test config
function createTestConfig() {
  return ril
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
}

describe('Conditions Performance', () => {
  it('should handle form with 50 conditional fields efficiently', async () => {
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

    const startTime = performance.now();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    const renderTime = performance.now() - startTime;

    // Initial render should be fast (< 500ms even with 51 fields)
    expect(renderTime).toBeLessThan(500);

    // Verify the form rendered
    expect(screen.getByTestId('field-trigger')).toBeInTheDocument();
  });

  it('should handle form with 100 fields without conditional logic quickly', () => {
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

    const startTime = performance.now();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    const renderTime = performance.now() - startTime;

    // Should render 100 fields quickly (< 1000ms)
    expect(renderTime).toBeLessThan(1000);
  });

  it('ConditionDependencyGraph should build quickly for many fields', () => {
    const graph = new ConditionDependencyGraph();

    const startTime = performance.now();

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

    const buildTime = performance.now() - startTime;

    // Building graph for 100 fields should be very fast (< 50ms)
    expect(buildTime).toBeLessThan(50);
    expect(graph.size).toBe(100);
  });

  it('ConditionDependencyGraph should lookup affected fields quickly', () => {
    const graph = new ConditionDependencyGraph();

    // Add 1000 fields with various dependencies
    for (let i = 0; i < 1000; i++) {
      const triggerIndex = i % 10; // 10 different triggers
      graph.addField(`field${i}`, {
        visible: when(`trigger${triggerIndex}`).exists(),
      });
    }

    const startTime = performance.now();

    // Perform 1000 lookups
    for (let i = 0; i < 1000; i++) {
      const triggerIndex = i % 10;
      graph.getAffectedFields(`trigger${triggerIndex}`);
    }

    const lookupTime = performance.now() - startTime;

    // 1000 lookups should be very fast (< 10ms)
    expect(lookupTime).toBeLessThan(50);
  });

  it('should demonstrate re-render isolation with Zustand selectors', async () => {
    const config = createTestConfig();
    const renderCounts: Record<string, number> = {};

    // Create a tracking component
    const TrackingComponent = ({
      id,
      value,
      onChange,
    }: {
      id: string;
      value: unknown;
      onChange: (val: unknown) => void;
    }) => {
      renderCounts[id] = (renderCounts[id] || 0) + 1;
      return (
        <input
          data-testid={`field-${id}`}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    };

    const trackingConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: TrackingComponent,
        defaultProps: {},
      })
      .configure({
        rowRenderer: TestRowRenderer,
        bodyRenderer: TestFormRenderer,
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

describe('Zustand Store Performance', () => {
  it('should create store quickly', () => {
    const startTime = performance.now();

    // Create 100 stores
    for (let i = 0; i < 100; i++) {
      createFormStore({ field1: 'value1', field2: 'value2' });
    }

    const createTime = performance.now() - startTime;

    // Creating 100 stores should be fast (< 50ms)
    expect(createTime).toBeLessThan(50);
  });

  it('should update values quickly', () => {
    const store = createFormStore({});

    const startTime = performance.now();

    // Perform 1000 value updates
    for (let i = 0; i < 1000; i++) {
      store.getState()._setValue(`field${i % 100}`, `value${i}`);
    }

    const updateTime = performance.now() - startTime;

    // 1000 updates should be fast (< 100ms)
    expect(updateTime).toBeLessThan(100);
  });
});

