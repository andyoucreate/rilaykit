import type { ComponentRenderProps } from 'rilaykit';
import { Switch } from '@/components/ui/switch';

interface SwitchInputProps {
  label?: string;
  description?: string;
}

export function SwitchInput({ id, props, value, onChange, disabled }: ComponentRenderProps<SwitchInputProps>) {
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={!!value}
        onCheckedChange={(checked) => onChange?.(checked)}
        disabled={disabled}
      />
      {props.label && (
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {props.label}
        </label>
      )}
    </div>
  );
}
