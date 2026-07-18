// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { onChange, ril } from '@rilaykit/core';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';

describe('Form Builder - Effects', () => {
  let rilConfig: any;

  beforeEach(() => {
    rilConfig = ril
      .create()
      .component('text', {
        name: 'Text Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', placeholder: 'Enter text' },
      })
      .component('select', {
        name: 'Select',
        renderer: () => React.createElement('select'),
        defaultProps: { label: '', options: [] },
      });
  });

  describe('effects in FieldConfig passes through to FormFieldConfig', () => {
    it('should include effects in the built field config', () => {
      const handler = async (_value: unknown) => {};
      const effects = [onChange('country', handler)];

      const config = form
        .create(rilConfig, 'effects-form')
        .add({ id: 'city', type: 'text', props: { label: 'City' }, effects })
        .build();

      const cityField = config.allFields.find((f) => f.id === 'city');
      expect(cityField).toBeDefined();
      expect(cityField!.effects).toBeDefined();
      expect(cityField!.effects).toHaveLength(1);
      expect(cityField!.effects![0].trigger).toBe('change');
      expect(cityField!.effects![0].watchFieldId).toBe('country');
      expect(cityField!.effects![0].handler).toBe(handler);
    });

    it('should include multiple effects on a single field', () => {
      const handlerA = async (_value: unknown) => {};
      const handlerB = async (_value: unknown) => {};

      const config = form
        .create(rilConfig, 'multi-effects-form')
        .add({
          id: 'summary',
          type: 'text',
          props: { label: 'Summary' },
          effects: [onChange('price', handlerA), onChange('quantity', handlerB)],
        })
        .build();

      const summaryField = config.allFields.find((f) => f.id === 'summary');
      expect(summaryField!.effects).toHaveLength(2);
      expect(summaryField!.effects![0].watchFieldId).toBe('price');
      expect(summaryField!.effects![1].watchFieldId).toBe('quantity');
    });
  });

  describe('effectsMap correctly built', () => {
    it('should build effectsMap keyed by watchFieldId', () => {
      const handlerCity = async (_value: unknown) => {};
      const handlerState = async (_value: unknown) => {};

      const config = form
        .create(rilConfig, 'map-form')
        .add({
          id: 'city',
          type: 'text',
          props: { label: 'City' },
          effects: [onChange('country', handlerCity)],
        })
        .add({
          id: 'state',
          type: 'text',
          props: { label: 'State' },
          effects: [onChange('region', handlerState)],
        })
        .build();

      expect(config.effectsMap).toBeDefined();
      expect(Object.keys(config.effectsMap!)).toHaveLength(2);
      expect(config.effectsMap!.country).toHaveLength(1);
      expect(config.effectsMap!.country[0].handler).toBe(handlerCity);
      expect(config.effectsMap!.region).toHaveLength(1);
      expect(config.effectsMap!.region[0].handler).toBe(handlerState);
    });
  });

  describe('multiple fields watching same watchFieldId', () => {
    it('should group effects by watchFieldId when two fields watch the same field', () => {
      const handlerCity = async (_value: unknown) => {};
      const handlerState = async (_value: unknown) => {};

      const config = form
        .create(rilConfig, 'shared-watch-form')
        .add({
          id: 'city',
          type: 'text',
          props: { label: 'City' },
          effects: [onChange('country', handlerCity)],
        })
        .add({
          id: 'state',
          type: 'text',
          props: { label: 'State' },
          effects: [onChange('country', handlerState)],
        })
        .build();

      expect(config.effectsMap).toBeDefined();
      expect(Object.keys(config.effectsMap!)).toHaveLength(1);
      expect(config.effectsMap!.country).toHaveLength(2);
      expect(config.effectsMap!.country[0].handler).toBe(handlerCity);
      expect(config.effectsMap!.country[1].handler).toBe(handlerState);
    });
  });

  describe('cross-field effect', () => {
    it('should map effect from total field watching price field', () => {
      const handler = async (value: unknown, { setValue }: any) => {
        setValue('total', Number(value) * 2);
      };

      const config = form
        .create(rilConfig, 'cross-field-form')
        .add({ id: 'price', type: 'text', props: { label: 'Price' } })
        .add({
          id: 'total',
          type: 'text',
          props: { label: 'Total' },
          effects: [onChange('price', handler)],
        })
        .build();

      expect(config.effectsMap).toBeDefined();
      expect(config.effectsMap!.price).toBeDefined();
      expect(config.effectsMap!.price).toHaveLength(1);
      expect(config.effectsMap!.price[0].watchFieldId).toBe('price');
      expect(config.effectsMap!.price[0].handler).toBe(handler);
    });
  });

  describe('no effectsMap when no effects', () => {
    it('should return undefined effectsMap when no fields have effects', () => {
      const config = form
        .create(rilConfig, 'no-effects-form')
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .add({ id: 'email', type: 'text', props: { label: 'Email' } })
        .build();

      expect(config.effectsMap).toBeUndefined();
    });

    it('should return undefined effectsMap for empty form', () => {
      const config = form.create(rilConfig, 'empty-form').build();

      expect(config.effectsMap).toBeUndefined();
    });
  });

  describe('effects on repeatable fields', () => {
    it('should include repeatable field effects in effectsMap', () => {
      const handler = async (_value: unknown) => {};

      const config = form
        .create(rilConfig, 'repeatable-effects-form')
        .addRepeatable('items', (r) =>
          r.add({
            id: 'itemName',
            type: 'text',
            props: { label: 'Item Name' },
            effects: [onChange('category', handler)],
          })
        )
        .build();

      expect(config.effectsMap).toBeDefined();
      expect(config.effectsMap!.category).toBeDefined();
      expect(config.effectsMap!.category).toHaveLength(1);
      expect(config.effectsMap!.category[0].handler).toBe(handler);
    });

    it('should merge repeatable and static field effects in effectsMap', () => {
      const staticHandler = async (_value: unknown) => {};
      const repeatableHandler = async (_value: unknown) => {};

      const config = form
        .create(rilConfig, 'mixed-effects-form')
        .add({
          id: 'city',
          type: 'text',
          props: { label: 'City' },
          effects: [onChange('country', staticHandler)],
        })
        .addRepeatable('items', (r) =>
          r.add({
            id: 'itemCity',
            type: 'text',
            props: { label: 'Item City' },
            effects: [onChange('country', repeatableHandler)],
          })
        )
        .build();

      expect(config.effectsMap).toBeDefined();
      expect(config.effectsMap!.country).toHaveLength(2);
      expect(config.effectsMap!.country[0].handler).toBe(staticHandler);
      expect(config.effectsMap!.country[1].handler).toBe(repeatableHandler);
    });
  });
});
