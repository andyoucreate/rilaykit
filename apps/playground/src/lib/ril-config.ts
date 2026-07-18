import { CheckboxInput } from '@/components/renderers/checkbox-input';
import { DateInput } from '@/components/renderers/date-input';
import { EmailInput } from '@/components/renderers/email-input';
import { NumberInput } from '@/components/renderers/number-input';
import { SelectInput } from '@/components/renderers/select-input';
import { SwitchInput } from '@/components/renderers/switch-input';
import { TextInput } from '@/components/renderers/text-input';
import { TextareaInput } from '@/components/renderers/textarea-input';
import { ril } from 'rilaykit';

export const r = ril
  .create()
  .component('text', {
    name: 'Text Input',
    renderer: TextInput,
  })
  .component('email', {
    name: 'Email Input',
    renderer: EmailInput,
  })
  .component('number', {
    name: 'Number Input',
    renderer: NumberInput,
  })
  .component('textarea', {
    name: 'Textarea',
    renderer: TextareaInput,
  })
  .component('select', {
    name: 'Select',
    renderer: SelectInput,
  })
  .component('checkbox', {
    name: 'Checkbox',
    renderer: CheckboxInput,
  })
  .component('switch', {
    name: 'Switch',
    renderer: SwitchInput,
  })
  .component('date', {
    name: 'Date Input',
    renderer: DateInput,
  });
