import type { ComponentRenderContext, FormConfiguration, MonitoringConfig } from '@rilaykit/core';
import { destroyGlobalMonitoring, initializeMonitoring, ril } from '@rilaykit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FormProvider, useFormMonitoring } from '../../src';

interface TextInputProps {
  value?: unknown;
  onChange?: (value: string) => void;
  [key: string]: unknown;
}

// Plain presentational input, rendered directly by these tests
const TextInput = ({ value, onChange, ...props }: TextInputProps) => (
  <input
    type="text"
    value={String(value ?? '')}
    onChange={(e) => onChange?.(e.target.value)}
    {...props}
  />
);

// Catalog renderer bridging the new ComponentRenderContext shape
const TextInputRenderer = ({ props, field }: ComponentRenderContext) => (
  <TextInput {...props} value={field?.value} onChange={field?.onChange} />
);

describe('Form Performance Tests', () => {
  let config: any;
  let formConfig: FormConfiguration;
  let monitoringConfig: MonitoringConfig;

  beforeEach(() => {
    // Clear any existing global monitor
    destroyGlobalMonitoring();

    // Setup monitoring
    monitoringConfig = {
      enabled: true,
      enablePerformanceTracking: true,
      bufferSize: 1000,
      flushInterval: 0,
      performanceThresholds: {
        componentRenderTime: 50,
        formValidationTime: 100,
      },
    };

    initializeMonitoring(monitoringConfig);

    // Setup form configuration
    config = ril.create().component('text', {
      name: 'Text Input',
      renderer: TextInputRenderer,
      defaultProps: {},
    });

    // Create a large form for performance testing
    const fields = [];
    for (let i = 0; i < 50; i++) {
      fields.push({
        id: `field_${i}`,
        componentId: 'text',
        props: {
          placeholder: `Field ${i}`,
          'data-testid': `field_${i}`,
        },
      });
    }

    formConfig = {
      id: 'performance_test_form',
      config,
      rows: [{ id: 'row1', fields }],
      allFields: fields,
    };
  });

  afterEach(async () => {
    await destroyGlobalMonitoring();
  });

  describe('Form Rendering at Scale', () => {
    it('should render a 50-field form with every field mounted exactly once', async () => {
      const TestForm = () => {
        const monitoring = useFormMonitoring({
          formConfig,
          enabled: true,
        });

        React.useEffect(() => {
          monitoring.trackFormRender();
        });

        return (
          <FormProvider formConfig={formConfig}>
            <div data-testid="form-container">
              {formConfig.allFields.map((field) => (
                <div key={field.id}>
                  <TextInput {...field.props} />
                </div>
              ))}
            </div>
          </FormProvider>
        );
      };

      render(<TestForm />);

      // Verify form is rendered
      expect(screen.getByTestId('form-container')).toBeInTheDocument();

      // All 50 fields are mounted, each exactly once, with its own placeholder
      for (let i = 0; i < 50; i++) {
        const field = screen.getByTestId(`field_${i}`);
        expect(field).toBeInTheDocument();
        expect(field).toHaveAttribute('placeholder', `Field ${i}`);
      }
      expect(screen.getAllByRole('textbox')).toHaveLength(50);
      expect(screen.queryByTestId('field_50')).toBeNull();
    });

    it('should apply 10 field updates with the correct final value in each field', async () => {
      const TestForm = () => {
        const [values, setValues] = React.useState<Record<string, string>>({});
        const monitoring = useFormMonitoring({
          formConfig,
          enabled: true,
        });

        const handleChange = (fieldId: string, value: string) => {
          monitoring.trackFieldChange(fieldId, 'text');
          setValues((prev) => ({ ...prev, [fieldId]: value }));
        };

        return (
          <FormProvider formConfig={formConfig}>
            <div data-testid="form-container">
              {formConfig.allFields.slice(0, 10).map((field) => (
                <TextInput
                  key={field.id}
                  {...field.props}
                  value={values[field.id] || ''}
                  onChange={(value: string) => handleChange(field.id, value)}
                />
              ))}
            </div>
          </FormProvider>
        );
      };

      render(<TestForm />);

      // Simulate typing in multiple fields
      for (let i = 0; i < 10; i++) {
        const field = screen.getByTestId(`field_${i}`);
        fireEvent.change(field, { target: { value: `Test value ${i}` } });
      }

      // Every update landed on its own field: no cross-talk, no lost writes
      for (let i = 0; i < 10; i++) {
        expect(screen.getByTestId(`field_${i}`)).toHaveValue(`Test value ${i}`);
      }
      expect(screen.getAllByRole('textbox')).toHaveLength(10);
    });
  });

  describe('Form Re-render Stability', () => {
    it('should survive 20 re-renders with stable state and unmount cleanly', async () => {
      const TestForm = () => {
        const [renderCount, setRenderCount] = React.useState(0);
        const monitoring = useFormMonitoring({
          formConfig,
          enabled: true,
        });

        React.useEffect(() => {
          monitoring.trackFormRender(renderCount);
        }, [renderCount, monitoring]);

        return (
          <FormProvider formConfig={formConfig}>
            <div data-testid="memory-test-form">
              <button
                type="button"
                onClick={() => setRenderCount((c) => c + 1)}
                data-testid="rerender-button"
              >
                Re-render ({renderCount})
              </button>
              {formConfig.allFields.slice(0, 10).map((field) => (
                <TextInput key={field.id} {...field.props} />
              ))}
            </div>
          </FormProvider>
        );
      };

      const { unmount } = render(<TestForm />);

      // Trigger some re-renders
      for (let i = 0; i < 20; i++) {
        fireEvent.click(screen.getByTestId('rerender-button'));
        // Each click advances state by exactly one: no runaway effect loop
        expect(screen.getByTestId('rerender-button')).toHaveTextContent(`Re-render (${i + 1})`);
      }

      // All 10 fields survived 20 re-renders, still mounted once each
      expect(screen.getAllByRole('textbox')).toHaveLength(10);

      unmount();

      // Unmounting tears the whole tree down: nothing is retained in the DOM
      expect(screen.queryByTestId('memory-test-form')).toBeNull();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    });
  });
});
