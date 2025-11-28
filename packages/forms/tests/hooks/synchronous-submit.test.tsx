import { ril } from '@rilaykit/core';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useFormContext } from '../../src/components/FormProvider';

const TextInput = ({ value, onChange }: any) => (
  <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
);

describe('Synchronous submit after onChange', () => {
  it('should submit the NEW value when submit() is called immediately after setValue()', async () => {
    // Create a simple form config
    const config = ril.create().addComponent('text', {
      name: 'Text',
      renderer: TextInput,
      defaultProps: {},
    });

    const formConfig = form
      .create<any>(config, 'sync-test-form')
      .add({
        id: 'username',
        type: 'text',
        props: {},
      })
      .build();

    const onSubmitSpy = vi.fn();

    // Wrapper component
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ username: 'oldValue' }}
        onSubmit={onSubmitSpy}
      >
        {children}
      </FormProvider>
    );

    // Render hook with context
    const { result } = renderHook(() => useFormContext(), { wrapper });

    // ACT: Update value and immediately submit synchronously
    result.current.setValue('username', 'newValue');
    await result.current.submit();

    // ASSERT: onSubmit should receive the NEW value, not the old one
    await waitFor(() => {
      expect(onSubmitSpy).toHaveBeenCalledTimes(1);
      expect(onSubmitSpy).toHaveBeenCalledWith({ username: 'newValue' });
    });
  });

  it('should handle multiple synchronous setValue calls before submit', async () => {
    const config = ril.create().addComponent('text', {
      name: 'Text',
      renderer: TextInput,
      defaultProps: {},
    });

    const formConfig = form
      .create<any>(config, 'multi-sync-test-form')
      .add({
        id: 'firstName',
        type: 'text',
        props: {},
      })
      .add({
        id: 'lastName',
        type: 'text',
        props: {},
      })
      .build();

    const onSubmitSpy = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ firstName: 'John', lastName: 'Doe' }}
        onSubmit={onSubmitSpy}
      >
        {children}
      </FormProvider>
    );

    const { result } = renderHook(() => useFormContext(), { wrapper });

    // ACT: Update multiple fields synchronously
    result.current.setValue('firstName', 'Jane');
    result.current.setValue('lastName', 'Smith');
    await result.current.submit();

    // ASSERT: Should submit all the latest values
    await waitFor(() => {
      expect(onSubmitSpy).toHaveBeenCalledTimes(1);
      expect(onSubmitSpy).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Smith',
      });
    });
  });

  it('should work with the Combobox pattern (onChange + immediate submit in onClose)', async () => {
    const config = ril.create().addComponent('text', {
      name: 'Text',
      renderer: TextInput,
      defaultProps: {},
    });

    const formConfig = form
      .create<any>(config, 'combobox-pattern-form')
      .add({
        id: 'selectedOption',
        type: 'text',
        props: {},
      })
      .build();

    const onSubmitSpy = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ selectedOption: 'option1' }}
        onSubmit={onSubmitSpy}
      >
        {children}
      </FormProvider>
    );

    const { result } = renderHook(() => useFormContext(), { wrapper });

    // Simulate the Combobox pattern:
    // 1. User selects a new option
    // 2. onChange is called with the new value
    // 3. onClose is called immediately after
    // 4. onClose calls submit()
    const simulateComboboxSelect = async (newValue: string) => {
      result.current.setValue('selectedOption', newValue);
      // Immediately submit (simulating onClose callback)
      await result.current.submit();
    };

    // ACT: Simulate user selecting a new option
    await simulateComboboxSelect('option2');

    // ASSERT: Submit should have the new value
    await waitFor(() => {
      expect(onSubmitSpy).toHaveBeenCalledTimes(1);
      expect(onSubmitSpy).toHaveBeenCalledWith({ selectedOption: 'option2' });
    });
  });

  it('should NOT use flushSync workaround (verifying the fix)', async () => {
    // This test verifies that the fix works WITHOUT requiring React's flushSync
    const config = ril.create().addComponent('text', {
      name: 'Text',
      renderer: TextInput,
      defaultProps: {},
    });

    const formConfig = form
      .create<any>(config, 'no-flushsync-form')
      .add({
        id: 'field',
        type: 'text',
        props: {},
      })
      .build();

    const onSubmitSpy = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ field: 'initial' }}
        onSubmit={onSubmitSpy}
      >
        {children}
      </FormProvider>
    );

    const { result } = renderHook(() => useFormContext(), { wrapper });

    // Direct synchronous call without any workarounds
    result.current.setValue('field', 'updated');
    await result.current.submit();

    await waitFor(() => {
      expect(onSubmitSpy).toHaveBeenCalledWith({ field: 'updated' });
    });
  });
});
