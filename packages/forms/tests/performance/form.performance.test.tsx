import type { FormConfiguration, MonitoringConfig } from '@rilaykit/core';
import { destroyGlobalMonitoring, initializeMonitoring, ril } from '@rilaykit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FormProvider, useFormMonitoring } from '../../src';

// Mock text input component for testing
const TextInput: React.FC<any> = ({ value, onChange, ...props }) => (
  <input type="text" value={value || ''} onChange={(e) => onChange?.(e.target.value)} {...props} />
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
    config = ril.create().addComponent('text', {
      name: 'Text Input',
      renderer: TextInput as any,
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

  describe('Form Rendering Performance', () => {
    it('should render large forms efficiently', async () => {
      const startTime = performance.now();

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

      const renderTime = performance.now() - startTime;

      // Should render 50 fields in less than 500ms
      expect(renderTime).toBeLessThan(500);

      // Verify form is rendered
      expect(screen.getByTestId('form-container')).toBeInTheDocument();
      expect(screen.getByTestId('field_0')).toBeInTheDocument();
    });

    it('should handle field updates efficiently', async () => {
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

      const startTime = performance.now();

      // Simulate typing in multiple fields
      for (let i = 0; i < 10; i++) {
        const field = screen.getByTestId(`field_${i}`);
        fireEvent.change(field, { target: { value: `Test value ${i}` } });
      }

      const updateTime = performance.now() - startTime;

      // Should handle 10 updates efficiently (less than 200ms)
      expect(updateTime).toBeLessThan(200);
    });
  });

  describe('Form Memory Performance', () => {
    it('should not leak memory with form re-renders', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

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
      }

      unmount();

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (less than 1MB)
      if (initialMemory > 0) {
        expect(memoryGrowth).toBeLessThan(1024 * 1024);
      }
    });
  });
});
