import { Checkbox } from '@/components/ui/checkbox';
import type { ComponentRenderContext } from 'rilaykit';

interface CheckboxInputProps {
  label?: string;
  description?: string;
}

export function CheckboxInput({ id, props, field }: ComponentRenderContext<CheckboxInputProps>) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={!!field?.value}
        onCheckedChange={(checked) => field?.onChange(checked === true)}
        disabled={field?.disabled}
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
