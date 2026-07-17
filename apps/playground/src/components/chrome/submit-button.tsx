import { Button } from '@/components/ui/button';
import { Form } from 'rilaykit/react';

export function SubmitButton({ className }: { className?: string }) {
  return (
    <Form.Submit>
      {({ submitting, submit }) => (
        <Button type="button" onClick={submit} disabled={submitting} className={className}>
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      )}
    </Form.Submit>
  );
}
