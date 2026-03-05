import { ril } from 'rilaykit';
import { TextInput } from '@/components/renderers/text-input';
import { EmailInput } from '@/components/renderers/email-input';
import { NumberInput } from '@/components/renderers/number-input';
import { TextareaInput } from '@/components/renderers/textarea-input';
import { SelectInput } from '@/components/renderers/select-input';
import { CheckboxInput } from '@/components/renderers/checkbox-input';
import { SwitchInput } from '@/components/renderers/switch-input';
import { DateInput } from '@/components/renderers/date-input';
import { FieldWrapper } from '@/components/renderers/field-wrapper';
import { FormBodyRenderer } from '@/components/renderers/form-body-renderer';
import { FormRowRenderer } from '@/components/renderers/form-row-renderer';
import { FormSubmitButtonRenderer } from '@/components/renderers/form-submit-button-renderer';
import { WorkflowStepperRenderer } from '@/components/renderers/workflow-stepper-renderer';
import { WorkflowNextButtonRenderer } from '@/components/renderers/workflow-next-button-renderer';
import { WorkflowPreviousButtonRenderer } from '@/components/renderers/workflow-previous-button-renderer';
import { WorkflowSkipButtonRenderer } from '@/components/renderers/workflow-skip-button-renderer';

export const r = ril
  .create()
  .addComponent('text', {
    name: 'Text Input',
    renderer: TextInput,
    useFieldRenderer: true,
  })
  .addComponent('email', {
    name: 'Email Input',
    renderer: EmailInput,
    useFieldRenderer: true,
  })
  .addComponent('number', {
    name: 'Number Input',
    renderer: NumberInput,
    useFieldRenderer: true,
  })
  .addComponent('textarea', {
    name: 'Textarea',
    renderer: TextareaInput,
    useFieldRenderer: true,
  })
  .addComponent('select', {
    name: 'Select',
    renderer: SelectInput,
    useFieldRenderer: true,
  })
  .addComponent('checkbox', {
    name: 'Checkbox',
    renderer: CheckboxInput,
    useFieldRenderer: false,
  })
  .addComponent('switch', {
    name: 'Switch',
    renderer: SwitchInput,
    useFieldRenderer: false,
  })
  .addComponent('date', {
    name: 'Date Input',
    renderer: DateInput,
    useFieldRenderer: true,
  })
  .configure({
    fieldRenderer: FieldWrapper,
    bodyRenderer: FormBodyRenderer,
    rowRenderer: FormRowRenderer,
    submitButtonRenderer: FormSubmitButtonRenderer,
    stepperRenderer: WorkflowStepperRenderer,
    nextButtonRenderer: WorkflowNextButtonRenderer,
    previousButtonRenderer: WorkflowPreviousButtonRenderer,
    skipButtonRenderer: WorkflowSkipButtonRenderer,
  });
