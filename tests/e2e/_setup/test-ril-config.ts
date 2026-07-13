import { ril } from '@rilaykit/core';
import {
  MockCheckboxInput,
  MockNumberInput,
  MockSelectInput,
  MockTextInput,
  TestBodyRenderer,
  TestRepeatableItemRenderer,
  TestRepeatableRenderer,
  TestRowRenderer,
  TestSubmitButtonRenderer,
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
    .component('text', {
      name: 'Text Input',
      renderer: MockTextInput,
      defaultProps: { label: '', placeholder: '' },
    })
    .component('select', {
      name: 'Select Input',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    })
    .component('number', {
      name: 'Number Input',
      renderer: MockNumberInput,
      defaultProps: { label: '' },
    })
    .component('checkbox', {
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
    .component('text', {
      name: 'Text Input',
      renderer: MockTextInput,
      defaultProps: { label: '' },
    })
    .component('select', {
      name: 'Select Input',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    })
    .configure({
      bodyRenderer: TestBodyRenderer,
      rowRenderer: TestRowRenderer,
    });
}
