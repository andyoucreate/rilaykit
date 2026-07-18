/**
 * =============================================================================
 * RilayKit 0.2 DX showcase — living documentation.
 * =============================================================================
 * This file exercises the WHOLE new surface exactly as a consumer would:
 *
 *   1. Fluent catalog  — `.component()` (zod `propsSchema` + `meta`), `.tool()`,
 *      `.part()`, `.renderers()` on the all-in-one `ril`.
 *   2. Form chrome     — `<Form of defaults>` + `Form.Body` render prop +
 *      `Form.Field id` + `Form.Submit` render prop, exact submitted payload.
 *   3. Flow chrome     — `<Flow of defaults onComplete>` + `Flow.Progress` /
 *      `Flow.Body` / `Flow.Back` / `Flow.Next` / `Flow.Skip`, an `allowSkip`
 *      predicate, and `useForm()` / `useFlow()` / `useStep()` probes.
 *
 * Read it top to bottom: it doubles as the canonical usage example.
 * =============================================================================
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import {
  type ComponentRenderContext,
  type PartRenderContext,
  type ToolRenderContext,
  required,
  ril,
} from 'rilaykit';
import { Flow, Form, useFlow, useForm, useStep } from 'rilaykit/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// =============================================================================
// 1. The catalog — one `ril` instance, everything registered fluently
// =============================================================================

/** Props are described once with zod; the renderer context is typed from it. */
const textProps = z.object({
  label: z.string(),
  placeholder: z.string().optional(),
});
type TextProps = z.infer<typeof textProps>;

/** A design-system input: reads `props`, binds through `field`, sees `meta`. */
function TextInput({ id, props, field, meta }: ComponentRenderContext<TextProps>) {
  return (
    <label data-testid={`field-${id}`} data-icon={String(meta?.icon ?? '')}>
      {props.label}
      <input
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        placeholder={props.placeholder}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.[0] && <span data-testid={`error-${id}`}>{field.error[0].message}</span>}
    </label>
  );
}

/** Tools and parts live in the same catalog, in their own namespaces. */
function ConfirmOrderTool(ctx: ToolRenderContext) {
  return <div data-testid="tool-confirm-order">{`${ctx.name}:${ctx.state}`}</div>;
}

function NotePart({ part }: PartRenderContext<string>) {
  return <aside data-testid="part-note">{part}</aside>;
}

function createCatalog() {
  return (
    ril
      .create()
      // Components carry propsSchema (zod or any Standard Schema) + meta
      .component('text', {
        name: 'Text input',
        propsSchema: textProps,
        meta: { icon: 'pencil' },
        renderer: TextInput,
      })
      // Tools are registered schema-first...
      .tool('confirm_order', { description: 'Ask the user to confirm the order' })
      // ...and parts render message content
      .part('note', { renderer: NotePart })
      // Renderers can be attached later without touching schemas
      .renderers({ tools: { confirm_order: ConfirmOrderTool } })
  );
}

// =============================================================================
// 2. Probes — plain consumer components built on the public hooks
// =============================================================================

function FormProbe() {
  const { formConfig } = useForm();
  return <output data-testid="form-probe">{formConfig.id}</output>;
}

function FlowProbe() {
  const { context } = useFlow();
  const { step, index, metadata } = useStep();
  return (
    <output data-testid="flow-probe">
      {`${step.id}|${index}|${String(metadata.emphasis ?? '-')}|${context.isLastStep}`}
    </output>
  );
}

// =============================================================================
// The showcase
// =============================================================================

describe('RilayKit 0.2 compound showcase', () => {
  it('registers components, tools and parts in one namespaced catalog', () => {
    const catalog = createCatalog();

    expect(catalog.getStats()).toEqual({ total: 3, components: 1, tools: 1, parts: 1 });
    expect(catalog.getComponent('text')?.meta).toEqual({ icon: 'pencil' });
    expect(catalog.getComponent('text')?.propsSchema).toBe(textProps);
    expect(catalog.getTool('confirm_order')?.renderer).toBe(ConfirmOrderTool);
    expect(catalog.getPart('note')?.renderer).toBe(NotePart);
    expect(catalog.validateProps('text', { label: 'Email' })).toEqual({
      success: true,
      value: { label: 'Email' },
    });
  });

  it('composes a standalone form and submits the exact payload', async () => {
    const catalog = createCatalog();

    // `.form()` comes straight from the all-in-one `ril` instance
    const checkout = catalog
      .form('checkout')
      .add({
        id: 'email',
        type: 'text',
        props: { label: 'Email', placeholder: 'you@example.com' },
        validation: { validate: [required('Email is required'), z.string().email()] },
      })
      .add({ id: 'coupon', type: 'text', props: { label: 'Coupon' } });

    const onSubmit = vi.fn();

    render(
      <Form of={checkout} defaults={{ coupon: 'WELCOME' }} onSubmit={onSubmit}>
        <Form.Body>
          {({ rows }) => (
            <div data-testid="body">
              {rows.map((row) =>
                row.kind === 'fields' ? (
                  <section key={row.id}>
                    {row.fields.map((field) => (
                      <Form.Field key={field.id} id={field.id} />
                    ))}
                  </section>
                ) : (
                  <Form.List key={row.id} id={row.repeatable.id} />
                )
              )}
            </div>
          )}
        </Form.Body>
        <Form.Submit>
          {({ submitting, submit }) => (
            <button type="button" data-testid="place-order" disabled={submitting} onClick={submit}>
              Place order
            </button>
          )}
        </Form.Submit>
        <FormProbe />
      </Form>
    );

    // The render-prop body mounted both fields; `defaults` seeded the coupon
    expect(screen.getByTestId('form-probe')).toHaveTextContent('checkout');
    expect(screen.getByTestId('input-coupon')).toHaveValue('WELCOME');
    expect(screen.getByTestId('input-email')).toHaveAttribute('placeholder', 'you@example.com');
    // `meta` from the catalog entry reaches the renderer context
    expect(screen.getByTestId('field-email')).toHaveAttribute('data-icon', 'pencil');

    // Submitting an invalid form surfaces the error and never calls onSubmit
    await act(async () => {
      fireEvent.click(screen.getByTestId('place-order'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('error-email')).toHaveTextContent('Email is required');
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Fix the field and submit for real
    fireEvent.change(screen.getByTestId('input-email'), {
      target: { value: 'neo@matrix.io' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('place-order'));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({ email: 'neo@matrix.io', coupon: 'WELCOME' });
  });

  it('composes a multi-step flow with progress, skip predicate and exact completion data', async () => {
    const catalog = createCatalog();

    const shippingForm = catalog.form('shipping-form').add({
      id: 'address',
      type: 'text',
      props: { label: 'Address' },
      validation: { validate: [required('Address is required')] },
    });
    const giftForm = catalog
      .form('gift-form')
      .add({ id: 'note', type: 'text', props: { label: 'Gift note' } });
    const reviewForm = catalog
      .form('review-form')
      .add({ id: 'fullName', type: 'text', props: { label: 'Full name' } });

    // `.flow()` also comes straight from the `ril` instance
    const order = catalog
      .flow('order', 'Order flow')
      .step({ id: 'shipping', title: 'Shipping', formConfig: shippingForm.build() })
      .step({
        id: 'gift',
        title: 'Gift options',
        metadata: { emphasis: 'high' },
        formConfig: giftForm.build(),
        // The skip predicate reads the accumulated flow data
        allowSkip: ({ allData }) =>
          Boolean((allData.shipping as { address?: string } | undefined)?.address),
      })
      .step({ id: 'review', title: 'Review', formConfig: reviewForm.build() });

    const onComplete = vi.fn();

    const { container } = render(
      <Flow
        of={order}
        defaults={{ shipping: { address: '221B Baker Street' } }}
        onComplete={onComplete}
      >
        <Flow.Progress>
          {({ steps, currentIndex }) => (
            <nav data-testid="progress">
              {steps.map((step, index) => (
                <span key={step.id} data-current={index === currentIndex}>
                  {step.title}
                </span>
              ))}
            </nav>
          )}
        </Flow.Progress>
        <Flow.Body />
        <FlowProbe />
        <Flow.Back />
        <Flow.Skip />
        <Flow.Next>
          {({ go, canGo, isLastStep }) => (
            <button type="button" data-testid="next" disabled={!canGo} onClick={go}>
              {isLastStep ? 'Finish' : 'Continue'}
            </button>
          )}
        </Flow.Next>
      </Flow>
    );

    const backButton = () => container.querySelector('[data-flow-nav="back"]');
    const skipButton = () => container.querySelector('[data-flow-nav="skip"]');

    // Step 1 — defaults seeded the address; Back is disabled, Skip is hidden
    await waitFor(() => {
      expect(screen.getByTestId('flow-probe')).toHaveTextContent('shipping|0|-|false');
    });
    expect(screen.getByTestId('progress')).toHaveTextContent('ShippingGift optionsReview');
    expect(screen.getByTestId('input-address')).toHaveValue('221B Baker Street');
    expect(backButton()).toBeDisabled();
    expect(skipButton()).toBeNull();

    // Continue → step 2; metadata reaches useStep(), the skip predicate is now true
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('flow-probe')).toHaveTextContent('gift|1|high|false');
    });
    expect(skipButton()).not.toBeNull();

    // Skip → step 3 without filling the gift note
    await act(async () => {
      fireEvent.click(skipButton() as Element);
    });
    await waitFor(() => {
      expect(screen.getByTestId('flow-probe')).toHaveTextContent('review|2|-|true');
    });
    expect(screen.getByTestId('next')).toHaveTextContent('Finish');

    // Back → step 2 again, write the note this time, Continue → step 3
    await act(async () => {
      fireEvent.click(backButton() as Element);
    });
    await waitFor(() => {
      expect(screen.getByTestId('flow-probe')).toHaveTextContent('gift|1|high|false');
    });
    fireEvent.change(screen.getByTestId('input-note'), {
      target: { value: 'Happy birthday' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('flow-probe')).toHaveTextContent('review|2|-|true');
    });

    // Finish — onComplete receives the exact accumulated data, keyed by step id
    fireEvent.change(screen.getByTestId('input-fullName'), {
      target: { value: 'Sherlock Holmes' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledWith({
      shipping: { address: '221B Baker Street' },
      gift: { note: 'Happy birthday' },
      review: { fullName: 'Sherlock Holmes' },
    });
  });
});
