import { ril } from '@rilaykit/core';
import {
  MockTextInput,
  MockSelectInput,
  MockNumberInput,
  MockCheckboxInput,
  TestBodyRenderer,
  TestRowRenderer,
  TestSubmitButtonRenderer,
  TestRepeatableRenderer,
  TestRepeatableItemRenderer,
} from './test-helpers';

// =================================================================
// RIL CONFIGS
// =================================================================

/**
 * Full ril config with all component types and renderers
 */
export function createTestRilConfig() {
  return ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: MockTextInput,
      defaultProps: { label: '', placeholder: '' },
    })
    .addComponent('select', {
      name: 'Select Input',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    })
    .addComponent('number', {
      name: 'Number Input',
      renderer: MockNumberInput,
      defaultProps: { label: '' },
    })
    .addComponent('checkbox', {
      name: 'Checkbox',
      renderer: MockCheckboxInput,
      defaultProps: { label: '' },
    })
    .configure({
      bodyRenderer: TestBodyRenderer,
      rowRenderer: TestRowRenderer,
      submitButtonRenderer: TestSubmitButtonRenderer,
      repeatableRenderer: TestRepeatableRenderer,
      repeatableItemRenderer: TestRepeatableItemRenderer,
    });
}

/**
 * Minimal ril config with only text + select (no custom renderers)
 */
export function createMinimalRilConfig() {
  return ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: MockTextInput,
      defaultProps: { label: '' },
    })
    .addComponent('select', {
      name: 'Select Input',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    })
    .configure({
      bodyRenderer: TestBodyRenderer,
      rowRenderer: TestRowRenderer,
    });
}
