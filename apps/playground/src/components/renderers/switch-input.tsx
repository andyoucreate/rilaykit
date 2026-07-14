import { Switch } from '@/components/ui/switch';
import type { ComponentRenderContext } from 'rilaykit';

interface SwitchInputProps {
  label?: string;
  description?: string;
}

export function SwitchInput({ id, props, field }: ComponentRenderContext<SwitchInputProps>) {
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={!!field?.value}
        onCheckedChange={(checked) => field?.onChange(checked)}
        disabled={field?.disabled}
      />
      {props.label && (
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {props.label}
        </label>
      )}
    </div>
  );
}
