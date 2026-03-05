import type { FormSubmitButtonRendererProps } from 'rilaykit';
import { Button } from '@/components/ui/button';

export function FormSubmitButtonRenderer({ isSubmitting, className }: FormSubmitButtonRendererProps) {
  return (
    <Button type="submit" disabled={isSubmitting} className={className}>
      {isSubmitting ? 'Submitting...' : 'Submit'}
    </Button>
  );
}
