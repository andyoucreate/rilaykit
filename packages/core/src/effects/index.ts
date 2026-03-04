import type { FieldEffect, FieldEffectHandler } from '../types';

/**
 * Creates a field effect that triggers when a specific field's value changes.
 *
 * @param fieldId - The field to watch for changes
 * @param handler - The function to execute when the field changes
 * @returns A FieldEffect configuration object
 *
 * @example
 * onChange('country', async (value, { setValue, setProps }) => {
 *   setValue('city', '');
 *   setProps('city', { options: await fetchCities(value) });
 * })
 */
export function onChange(fieldId: string, handler: FieldEffectHandler): FieldEffect {
  return {
    trigger: 'change',
    watchFieldId: fieldId,
    handler,
  };
}
