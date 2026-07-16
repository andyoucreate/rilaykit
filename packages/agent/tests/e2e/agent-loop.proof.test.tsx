import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { toParts, tools } from '../../src/ai-sdk';
import { manifest } from '../../src/manifest/manifest';
import { Parts } from '../../src/react/Parts';
import { parsePartialJson } from '../../src/streaming/parse-partial-json';
import { uiTools } from '../../src/tools/ui-tools';

/**
 * The whole thesis of P3 in one file: an agent emits JSON → rilaykit renders it →
 * a human answers → the agent receives engine-validated values. NOTHING of
 * rilaykit is mocked — a real catalog, a real store, a real compile; the model
 * side is literal JSON fixtures in the exact wire shape AI SDK v5 carries.
 *
 * Phase-gate hardening legs (P3 plan Task 16) ride in the same file because they
 * are loop-level scenarios: two forms in one message, re-emission after an error
 * part, a part arriving already settled, and the `__proto__` class that escaped
 * seven times in P1/P2 — here walked through the FULL pipeline.
 */

const catalog = ril
  .create()
  .component('text', {
    description: 'Single-line text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <input
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </label>
    ),
  })
  .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
  .use(uiTools());

/** An AI SDK v5 assistant `UIMessage`, exactly as `useChat` would hand it over. */
function sdkMessage(parts: unknown[]): unknown {
  return JSON.parse(JSON.stringify({ id: 'msg_1', role: 'assistant', parts }));
}

function mountMessage(message: unknown, onResolve = vi.fn()) {
  render(
    <Catalog value={catalog}>
      <Parts parts={toParts(message)} onResolve={onResolve} />
    </Catalog>
  );
  return onResolve;
}

describe('the P3 loop, end to end', () => {
  it('closes the loop: emission → render → human answer → resolved values', async () => {
    // 1. SERVER SIDE — what the route handler ships to the model: the manifest
    // teaches the catalog, tools() offers the UI tools WITHOUT execute (the AI
    // SDK's native HITL pattern — the stream stays pending until the client
    // posts the tool result back).
    const prompt = manifest(catalog);
    expect(prompt).toContain('- **text** — Single-line text input');
    expect(prompt).toContain('    - label: string');
    expect(prompt).toContain('- **show_form**');
    expect(prompt).toContain('Use `show_form` to collect structured input');

    const definitions = tools(catalog) as Record<string, Record<string, unknown>>;
    expect(Object.keys(definitions).sort()).toEqual(['show_component', 'show_flow', 'show_form']);
    expect(Object.hasOwn(definitions.show_form, 'execute')).toBe(false);
    expect(typeof definitions.show_form.description).toBe('string');
    expect(definitions.show_form.inputSchema).toBeDefined();

    // 2. THE MODEL EMITS — a literal JSON fixture in the exact shape a model
    // really emits through the AI SDK: a text part, then a show_form call.
    const message = sdkMessage([
      { type: 'text', text: 'Let me get your details.' },
      {
        type: 'tool-show_form',
        toolCallId: 'call_42',
        state: 'input-available',
        input: {
          schema: {
            id: 'contact',
            fields: [
              { id: 'name', type: 'text', props: { label: 'Name' } },
              { id: 'email', type: 'text', props: { label: 'Email' } },
            ],
          },
        },
      },
    ]);

    // 3. CLIENT SIDE — toParts() → <Parts> renders it through the real catalog.
    const onResolve = mountMessage(message);
    expect(screen.getByText('Let me get your details.')).toBeInTheDocument();

    // 4. THE HUMAN ANSWERS.
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.type(screen.getByLabelText('Email'), 'karl@example.com');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    // 5. THE AGENT RECEIVES — engine-validated values, addressed to ITS call.
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_42', {
        status: 'submitted',
        values: { name: 'Karl', email: 'karl@example.com' },
      })
    );
  });

  it('show_flow resolves the step-keyed AUTHORED shape — each step id keys exactly its own fields', async () => {
    const message = sdkMessage([
      {
        type: 'tool-show_flow',
        toolCallId: 'call_flow',
        state: 'input-available',
        input: {
          schema: {
            id: 'onboarding',
            name: 'Onboarding',
            steps: [
              {
                id: 'personal',
                title: 'Personal',
                form: {
                  id: 'personal',
                  fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
                },
              },
              {
                id: 'company',
                title: 'Company',
                form: {
                  id: 'company',
                  fields: [{ id: 'siren', type: 'text', props: { label: 'Siren' } }],
                },
              },
            ],
          },
        },
      },
    ]);

    const onResolve = mountMessage(message);
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByLabelText('Siren');
    await userEvent.type(screen.getByLabelText('Siren'), '123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // The resolved values are STEP-KEYED in the authored shape — downstream
    // consumers depend on `values[stepId][fieldId]`, never a flat merge.
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_flow', {
        status: 'submitted',
        values: { personal: { name: 'Karl' }, company: { siren: '123456789' } },
      })
    );
  });

  it('two show_form parts in ONE message resolve independently — each answer reaches its own toolCallId', async () => {
    const message = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_a',
        state: 'input-available',
        input: {
          schema: { id: 'form-a', fields: [{ id: 'a', type: 'text', props: { label: 'Alpha' } }] },
        },
      },
      {
        type: 'tool-show_form',
        toolCallId: 'call_b',
        state: 'input-available',
        input: {
          schema: { id: 'form-b', fields: [{ id: 'b', type: 'text', props: { label: 'Beta' } }] },
        },
      },
    ]);

    const onResolve = mountMessage(message);

    // Submit the SECOND form first — order must not leak between parts.
    await userEvent.type(screen.getByLabelText('Beta'), 'two');
    const submits = screen.getAllByRole('button', { name: /submit/i });
    expect(submits).toHaveLength(2);
    await userEvent.click(submits[1]);
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_b', {
        status: 'submitted',
        values: { b: 'two' },
      })
    );

    // The first form is still live and resolves to ITS call — with ITS values.
    await userEvent.type(screen.getByLabelText('Alpha'), 'one');
    await userEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenLastCalledWith('call_a', {
      status: 'submitted',
      values: { a: 'one' },
    });
  });

  it('HITL re-emission after an error part: the failed call renders settled, the fresh call resolves', async () => {
    const message = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_failed',
        state: 'output-error',
        input: {},
        errorText: 'model aborted mid-call',
      },
      {
        type: 'tool-show_form',
        toolCallId: 'call_retry',
        state: 'input-available',
        input: {
          schema: {
            id: 'retry',
            fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
          },
        },
      },
    ]);

    const onResolve = mountMessage(message);

    // The failed call is a settled marker — no form controls, no re-arming.
    const marker = document.querySelector('[data-tool-state="error"]');
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute('data-tool-name')).toBe('show_form');

    // The re-emitted call is fully live and resolves to its OWN id.
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('call_retry', {
        status: 'submitted',
        values: { name: 'Karl' },
      })
    );
  });

  it('a tool part arriving `done` with NO prior streaming renders the settled marker and never re-arms the loop', async () => {
    // A rehydrated conversation replays parts already answered: the part's
    // FIRST appearance is `output-available`, with no streaming/ready history.
    const message = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_done',
        state: 'output-available',
        input: {
          schema: {
            id: 'contact',
            fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
          },
        },
        output: { status: 'submitted', values: { name: 'Karl' } },
      },
    ]);

    const onResolve = mountMessage(message);
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const marker = document.querySelector('[data-part="tool"]');
    expect(marker?.getAttribute('data-tool-state')).toBe('done');
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('an emission whose field id is __proto__ walks the FULL loop as an own key — parser → compile → render → submit', async () => {
    // The class that escaped seven times in P1/P2, driven through every layer
    // at once: the raw JSON text a model would stream, the partial parser, the
    // schema compiler, the live store, and the resolved payload.
    const raw =
      '{"schema":{"id":"hostile","fields":[{"id":"__proto__","type":"text","props":{"label":"Proto"}}]}}';

    // Parser: the key stays an OWN property; nothing grafts onto the prototype.
    const parsed = parsePartialJson(raw);
    expect(parsed.complete).toBe(true);
    const schema = (parsed.value as { schema: { fields: unknown[] } }).schema;
    const field = schema.fields[0] as Record<string, unknown>;
    expect(Object.hasOwn(field, 'id')).toBe(true);
    expect(field.id).toBe('__proto__');

    const message = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_hostile',
        state: 'input-available',
        input: parsed.value,
      },
    ]);

    const onResolve = mountMessage(message);
    await userEvent.type(screen.getByLabelText('Proto'), 'safe');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const [callId, output] = onResolve.mock.calls[0] as [string, Record<string, unknown>];
    expect(callId).toBe('call_hostile');
    expect(output.status).toBe('submitted');

    // The submitted values carry `__proto__` as an OWN key with the typed
    // value — and the payload's prototype is untouched.
    const values = output.values as Record<string, unknown>;
    expect(Object.hasOwn(values, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(values, '__proto__')?.value).toBe('safe');
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
    // No pollution leaked into fresh objects.
    expect(({} as Record<string, unknown>).label).toBeUndefined();
  });
});
