import { Checkbox } from '@/components/ui/checkbox';
import type { ComponentRenderProps } from 'rilaykit';

interface CheckboxInputProps {
  label?: string;
  description?: string;
}

export function CheckboxInput({
  id,
  props,
  value,
  onChange,
  disabled,
}: ComponentRenderProps<CheckboxInputProps>) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={!!value}
        onCheckedChange={(checked) => onChange?.(checked === true)}
        disabled={disabled}
      />
      {props.label && (
        <label
          htmlFor={id}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {props.label}
        </label>
      )}
    </div>
  );
}
