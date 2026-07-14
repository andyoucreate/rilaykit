// @ts-nocheck
import { type ComponentRenderContext, onChange, ril, setLogSink } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';
import { useFormValues } from '../../src/stores/formStore';

// =================================================================
// MOCK COMPONENTS
// =================================================================

const MockSelect = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <select
      data-testid={`select-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    >
      <option value="">--</option>
      {((props.options as Array<{ value: string; label: string }> | undefined) ?? []).map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

const MockText = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <input
      data-testid={`input-${id}`}
      value={field?.value ?? ''}
      placeholder={props.placeholder ?? ''}
      onChange={(e) => field?.onChange(e.target.value)}
    />
    {props.hint && <span data-testid={`hint-${id}`}>{props.hint}</span>}
  </div>
);

const MockNumber = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <input
      data-testid={`input-${id}`}
      type="number"
      value={field?.value ?? ''}
      onChange={(e) => field?.onChange(e.target.value)}
      readOnly={props.readOnly || false}
    />
  </div>
);

// Values spy component
function ValuesInspector({ onValues }: { onValues: (v: Record<string, unknown>) => void }) {
  const values = useFormValues();
  React.useEffect(() => {
    onValues(values as Record<string, unknown>);
  });
  return null;
}

// =================================================================
// SHARED CONFIG
// =================================================================

function createConfig() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: MockText })
    .component('select', {
      name: 'Select',
      renderer: MockSelect,
      defaultProps: { options: [] },
    })
    .component('number', { name: 'Number', renderer: MockNumber });
}

// =================================================================
// HARDCORE INTEGRATION TESTS
// =================================================================

describe('FormField Effects — Hardcore Integration', () => {
  let config: ReturnType<typeof createConfig>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createConfig();
    // Runtime code routes through the logger sink, not console directly.
    consoleWarnSpy = vi.fn();
    setLogSink((level, _scope, message, ...args) => {
      if (level === 'warn') consoleWarnSpy(message, ...args);
    });
  });

  afterEach(() => {
    setLogSink(null);
  });

  // -----------------------------------------------------------------
  // THREE-LEVEL CASCADE IN REACT
  // -----------------------------------------------------------------

  describe('three-level cascade: country → city → district', () => {
    it('should cascade through all three levels on country change', async () => {
      const cityMap: Record<string, Array<{ value: string; label: string }>> = {
        france: [{ value: 'paris', label: 'Paris' }],
        spain: [{ value: 'madrid', label: 'Madrid' }],
      };

      const districtMap: Record<string, Array<{ value: string; label: string }>> = {
        paris: [
          { value: 'marais', label: 'Le Marais' },
          { value: 'montmartre', label: 'Montmartre' },
        ],
        madrid: [{ value: 'sol', label: 'Sol' }],
      };

      const formConfig = form
        .create<any>(config, 'three-level-cascade')
        .add({
          id: 'country',
          type: 'select',
          props: {
            options: [
              { value: 'france', label: 'France' },
              { value: 'spain', label: 'Spain' },
            ],
          },
        })
        .add({
          id: 'city',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('country', (value, { setValue, setProps }) => {
              setValue('city', '');
              setProps('city', { options: cityMap[value as string] ?? [] });
            }),
          ],
        })
        .add({
          id: 'district',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('city', (value, { setValue, setProps }) => {
              setValue('district', '');
              setProps('district', { options: districtMap[value as string] ?? [] });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="country" />
          <FormField id="city" />
          <FormField id="district" />
        </FormProvider>
      );

      // Select France
      fireEvent.change(screen.getByTestId('select-country'), {
        target: { value: 'france' },
      });

      await waitFor(() => {
        const cityOptions = screen.getByTestId('select-city').querySelectorAll('option');
        // 1 empty + 1 Paris
        expect(cityOptions).toHaveLength(2);
        expect(cityOptions[1]).toHaveTextContent('Paris');
      });

      // Select Paris → districts should load
      fireEvent.change(screen.getByTestId('select-city'), {
        target: { value: 'paris' },
      });

      await waitFor(() => {
        const districtOptions = screen.getByTestId('select-district').querySelectorAll('option');
        expect(districtOptions).toHaveLength(3); // empty + 2 districts
        expect(districtOptions[1]).toHaveTextContent('Le Marais');
        expect(districtOptions[2]).toHaveTextContent('Montmartre');
      });

      // Switch country to Spain — city and district should reset
      fireEvent.change(screen.getByTestId('select-country'), {
        target: { value: 'spain' },
      });

      await waitFor(() => {
        const cityOptions = screen.getByTestId('select-city').querySelectorAll('option');
        expect(cityOptions).toHaveLength(2); // empty + Madrid
        expect(cityOptions[1]).toHaveTextContent('Madrid');

        // District should be reset (city was reset to '')
        const districtOptions = screen.getByTestId('select-district').querySelectorAll('option');
        // Empty string means no district selected, options cleared by city reset effect
        expect(districtOptions).toHaveLength(1); // just the empty option
      });
    });
  });

  // -----------------------------------------------------------------
  // UNMOUNT DURING ASYNC EFFECT
  // -----------------------------------------------------------------

  describe('unmount during async effect', () => {
    it('should not crash when component unmounts while async effect is pending', async () => {
      const formConfig = form
        .create<any>(config, 'unmount-async')
        .add({
          id: 'trigger',
          type: 'select',
          props: {
            options: [{ value: 'go', label: 'Go' }],
          },
        })
        .add({
          id: 'target',
          type: 'text',
          props: {},
          effects: [
            onChange('trigger', async (_value, { setProps }) => {
              await new Promise((resolve) => setTimeout(resolve, 100));
              setProps('target', { placeholder: 'loaded' });
            }),
          ],
        })
        .build();

      const { unmount } = render(
        <FormProvider formConfig={formConfig}>
          <FormField id="trigger" />
          <FormField id="target" />
        </FormProvider>
      );

      // Trigger async effect
      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      // Unmount immediately while async is pending
      unmount();

      // Wait past the async delay — should not crash
      await new Promise((resolve) => setTimeout(resolve, 150));

      // If we got here, no crash occurred
      expect(true).toBe(true);
    });
  });

  // -----------------------------------------------------------------
  // EFFECT + onFieldChange INTERACTION
  // -----------------------------------------------------------------

  describe('effect + onFieldChange interaction', () => {
    it('should fire onFieldChange for values set by effects', async () => {
      const changeLog: Array<{ fieldId: string; value: unknown }> = [];

      const formConfig = form
        .create<any>(config, 'effect-onchange')
        .add({
          id: 'country',
          type: 'select',
          props: {
            options: [{ value: 'france', label: 'France' }],
          },
        })
        .add({
          id: 'city',
          type: 'text',
          props: {},
          effects: [
            onChange('country', (_value, { setValue }) => {
              setValue('city', 'auto-filled');
            }),
          ],
        })
        .build();

      render(
        <FormProvider
          formConfig={formConfig}
          onFieldChange={(fieldId, value) => {
            changeLog.push({ fieldId, value });
          }}
        >
          <FormField id="country" />
          <FormField id="city" />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('select-country'), {
        target: { value: 'france' },
      });

      await waitFor(() => {
        // Both the user's country change and the effect's city change should be logged
        expect(changeLog).toContainEqual({ fieldId: 'country', value: 'france' });
        expect(changeLog).toContainEqual({ fieldId: 'city', value: 'auto-filled' });
      });
    });
  });

  // -----------------------------------------------------------------
  // EFFECT SETTING BOTH VALUE AND PROPS
  // -----------------------------------------------------------------

  describe('effect setting both value and props on same target', () => {
    it('should apply both setValue and setProps from a single effect', async () => {
      const formConfig = form
        .create<any>(config, 'value-and-props')
        .add({
          id: 'trigger',
          type: 'select',
          props: { options: [{ value: 'go', label: 'Go' }] },
        })
        .add({
          id: 'target',
          type: 'text',
          props: { placeholder: 'initial' },
          effects: [
            onChange('trigger', (_value, { setValue, setProps }) => {
              setValue('target', 'effect-value');
              setProps('target', { placeholder: 'effect-placeholder', hint: 'Loaded!' });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="trigger" />
          <FormField id="target" />
        </FormProvider>
      );

      expect(screen.getByTestId('input-target')).toHaveAttribute('placeholder', 'initial');
      expect(screen.getByTestId('input-target')).toHaveValue('');

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-target')).toHaveValue('effect-value');
        expect(screen.getByTestId('input-target')).toHaveAttribute(
          'placeholder',
          'effect-placeholder'
        );
        expect(screen.getByTestId('hint-target')).toHaveTextContent('Loaded!');
      });
    });
  });

  // -----------------------------------------------------------------
  // RAPID USER CHANGES — ASYNC ABORT IN REACT
  // -----------------------------------------------------------------

  describe('rapid changes abort previous async effects in React', () => {
    it('should only show results from the last change', async () => {
      const formConfig = form
        .create<any>(config, 'rapid-abort-react')
        .add({
          id: 'search',
          type: 'text',
          props: {},
        })
        .add({
          id: 'results',
          type: 'text',
          props: {},
          effects: [
            onChange('search', async (value, { setValue }) => {
              // Simulate network delay that varies
              await new Promise((resolve) => setTimeout(resolve, 50));
              setValue('results', `results-for-${value}`);
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="search" />
          <FormField id="results" />
        </FormProvider>
      );

      // Type rapidly
      fireEvent.change(screen.getByTestId('input-search'), { target: { value: 'a' } });
      fireEvent.change(screen.getByTestId('input-search'), { target: { value: 'ab' } });
      fireEvent.change(screen.getByTestId('input-search'), { target: { value: 'abc' } });

      await waitFor(
        () => {
          // Only the last search's results should be applied
          expect(screen.getByTestId('input-results')).toHaveValue('results-for-abc');
        },
        { timeout: 500 }
      );
    });
  });

  // -----------------------------------------------------------------
  // MULTIPLE EFFECTS ON DIFFERENT TARGETS FROM SAME SOURCE
  // -----------------------------------------------------------------

  describe('multiple effects from one source field', () => {
    it('should update multiple targets when source changes', async () => {
      const formConfig = form
        .create<any>(config, 'multi-target')
        .add({
          id: 'category',
          type: 'select',
          props: {
            options: [
              { value: 'electronics', label: 'Electronics' },
              { value: 'books', label: 'Books' },
            ],
          },
        })
        .add({
          id: 'subcategory',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('category', (value, { setProps, setValue }) => {
              setValue('subcategory', '');
              if (value === 'electronics') {
                setProps('subcategory', {
                  options: [
                    { value: 'phones', label: 'Phones' },
                    { value: 'laptops', label: 'Laptops' },
                  ],
                });
              } else {
                setProps('subcategory', {
                  options: [{ value: 'fiction', label: 'Fiction' }],
                });
              }
            }),
          ],
        })
        .add({
          id: 'description',
          type: 'text',
          props: { placeholder: '' },
          effects: [
            onChange('category', (value, { setProps }) => {
              setProps('description', {
                placeholder: `Describe your ${value}...`,
              });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="category" />
          <FormField id="subcategory" />
          <FormField id="description" />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('select-category'), {
        target: { value: 'electronics' },
      });

      await waitFor(() => {
        const subOptions = screen.getByTestId('select-subcategory').querySelectorAll('option');
        expect(subOptions).toHaveLength(3); // empty + 2
        expect(subOptions[1]).toHaveTextContent('Phones');
        expect(screen.getByTestId('input-description')).toHaveAttribute(
          'placeholder',
          'Describe your electronics...'
        );
      });

      // Switch category
      fireEvent.change(screen.getByTestId('select-category'), {
        target: { value: 'books' },
      });

      await waitFor(() => {
        const subOptions = screen.getByTestId('select-subcategory').querySelectorAll('option');
        expect(subOptions).toHaveLength(2); // empty + 1
        expect(subOptions[1]).toHaveTextContent('Fiction');
        expect(screen.getByTestId('input-description')).toHaveAttribute(
          'placeholder',
          'Describe your books...'
        );
      });
    });
  });

  // -----------------------------------------------------------------
  // DEFAULT VALUES WITH THREE-LEVEL CASCADE
  // -----------------------------------------------------------------

  describe('defaultValues with multi-level cascade', () => {
    it('should chain initial effects: country=france → city options loaded', async () => {
      const formConfig = form
        .create<any>(config, 'default-cascade')
        .add({
          id: 'country',
          type: 'select',
          props: { options: [{ value: 'france', label: 'France' }] },
        })
        .add({
          id: 'city',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('country', (value, { setProps }) => {
              if (value === 'france') {
                setProps('city', {
                  options: [
                    { value: 'paris', label: 'Paris' },
                    { value: 'lyon', label: 'Lyon' },
                  ],
                });
              }
            }),
          ],
        })
        .add({
          id: 'label',
          type: 'text',
          props: { placeholder: '' },
          effects: [
            onChange('country', (value, { setProps }) => {
              setProps('label', { placeholder: `City in ${value}` });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ country: 'france' }}>
          <FormField id="country" />
          <FormField id="city" />
          <FormField id="label" />
        </FormProvider>
      );

      await waitFor(() => {
        const cityOptions = screen.getByTestId('select-city').querySelectorAll('option');
        expect(cityOptions).toHaveLength(3); // empty + Paris + Lyon
        expect(screen.getByTestId('input-label')).toHaveAttribute('placeholder', 'City in france');
      });
    });
  });

  // -----------------------------------------------------------------
  // SYNC EFFECT THAT THROWS IN REACT
  // -----------------------------------------------------------------

  describe('effect error does not crash React tree', () => {
    it('should survive a throwing effect and continue rendering', async () => {
      const formConfig = form
        .create<any>(config, 'error-resilience')
        .add({
          id: 'trigger',
          type: 'select',
          props: { options: [{ value: 'go', label: 'Go' }] },
        })
        .add({
          id: 'good',
          type: 'text',
          props: {},
          effects: [
            // Broken effect that throws
            onChange('trigger', () => {
              throw new Error('BROKEN EFFECT');
            }),
          ],
        })
        .add({
          id: 'sibling',
          type: 'text',
          props: {},
          effects: [
            onChange('trigger', (_value, { setValue }) => {
              setValue('sibling', 'survived');
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="trigger" />
          <FormField id="good" />
          <FormField id="sibling" />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-sibling')).toHaveValue('survived');
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sync effect error'),
        expect.any(Error)
      );
    });
  });

  // -----------------------------------------------------------------
  // VALUES INSPECTOR: VERIFY STORE STATE AFTER EFFECTS
  // -----------------------------------------------------------------

  describe('store state consistency after effects', () => {
    it('should have correct store state after cascading effects', async () => {
      let latestValues: Record<string, unknown> = {};

      const formConfig = form
        .create<any>(config, 'store-consistency')
        .add({
          id: 'source',
          type: 'select',
          props: { options: [{ value: 'x', label: 'X' }] },
        })
        .add({
          id: 'derived1',
          type: 'text',
          props: {},
          effects: [
            onChange('source', (value, { setValue }) => {
              setValue('derived1', `d1-${value}`);
            }),
          ],
        })
        .add({
          id: 'derived2',
          type: 'text',
          props: {},
          effects: [
            onChange('source', (value, { setValue }) => {
              setValue('derived2', `d2-${value}`);
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="source" />
          <FormField id="derived1" />
          <FormField id="derived2" />
          <ValuesInspector
            onValues={(v) => {
              latestValues = v;
            }}
          />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('select-source'), {
        target: { value: 'x' },
      });

      await waitFor(() => {
        expect(latestValues.source).toBe('x');
        expect(latestValues.derived1).toBe('d1-x');
        expect(latestValues.derived2).toBe('d2-x');
      });
    });
  });

  // -----------------------------------------------------------------
  // CONDITIONAL: EFFECT ON HIDDEN FIELD
  // -----------------------------------------------------------------

  describe('effect targets work even when field is not rendered', () => {
    it('should set value on a field that has no FormField component', async () => {
      let latestValues: Record<string, unknown> = {};

      const formConfig = form
        .create<any>(config, 'no-rendered-target')
        .add({
          id: 'trigger',
          type: 'select',
          props: { options: [{ value: 'go', label: 'Go' }] },
        })
        .add({
          id: 'hidden',
          type: 'text',
          props: {},
          effects: [
            onChange('trigger', (_value, { setValue }) => {
              setValue('hidden', 'ghost-value');
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          {/* Note: hidden field is NOT rendered as FormField */}
          <FormField id="trigger" />
          <ValuesInspector
            onValues={(v) => {
              latestValues = v;
            }}
          />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(latestValues.hidden).toBe('ghost-value');
      });
    });
  });

  // -----------------------------------------------------------------
  // RE-RENDER WITH NEW FORM CONFIG
  // -----------------------------------------------------------------

  describe('form config change restarts engine', () => {
    it('should use new effects when formConfig changes', async () => {
      function buildForm(effectValue: string) {
        return form
          .create<any>(config, `dynamic-${effectValue}`)
          .add({
            id: 'trigger',
            type: 'select',
            props: { options: [{ value: 'go', label: 'Go' }] },
          })
          .add({
            id: 'target',
            type: 'text',
            props: {},
            effects: [
              onChange('trigger', (_value, { setValue }) => {
                setValue('target', effectValue);
              }),
            ],
          })
          .build();
      }

      function Wrapper({ effectValue }: { effectValue: string }) {
        const formConfig = React.useMemo(() => buildForm(effectValue), [effectValue]);
        return (
          <FormProvider formConfig={formConfig}>
            <FormField id="trigger" />
            <FormField id="target" />
          </FormProvider>
        );
      }

      const { rerender } = render(<Wrapper effectValue="v1" />);

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-target')).toHaveValue('v1');
      });

      // Change form config — engine should restart with new effects
      rerender(<Wrapper effectValue="v2" />);

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-target')).toHaveValue('v2');
      });
    });
  });

  // -----------------------------------------------------------------
  // CROSS-FIELD COMPUTED WITH getValues
  // -----------------------------------------------------------------

  describe('cross-field computation using getValues', () => {
    it('should compute full name from first + last name', async () => {
      const formConfig = form
        .create<any>(config, 'cross-field-getvalues')
        .add({ id: 'firstName', type: 'text', props: {} })
        .add({ id: 'lastName', type: 'text', props: {} })
        .add({
          id: 'fullName',
          type: 'text',
          props: {},
          effects: [
            onChange('firstName', (_value, { getValues, setValue }) => {
              const vals = getValues();
              setValue('fullName', `${vals.firstName || ''} ${vals.lastName || ''}`.trim());
            }),
            onChange('lastName', (_value, { getValues, setValue }) => {
              const vals = getValues();
              setValue('fullName', `${vals.firstName || ''} ${vals.lastName || ''}`.trim());
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" />
          <FormField id="lastName" />
          <FormField id="fullName" />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('input-firstName'), {
        target: { value: 'John' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-fullName')).toHaveValue('John');
      });

      fireEvent.change(screen.getByTestId('input-lastName'), {
        target: { value: 'Doe' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-fullName')).toHaveValue('John Doe');
      });
    });
  });
});
