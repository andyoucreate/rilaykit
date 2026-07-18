import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Part } from '../../src/react/Part';
import { parsePartialJson } from '../../src/streaming/parse-partial-json';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('text', {
    description: 'Text input',
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
  .use(uiTools());

const FULL =
  '{"schema":{"id":"c","fields":[{"id":"name","type":"text","props":{"label":"Name"}},{"id":"email","type":"text","props":{"label":"Email"}}]}}';

function streamTo(chars: number) {
  const { value } = parsePartialJson(FULL.slice(0, chars));
  return render(
    <Catalog value={catalog}>
      <Part
        part={{
          type: 'tool',
          toolCallId: 'c1',
          name: 'show_form',
          state: 'streaming',
          input: value ?? {},
          rawInput: FULL.slice(0, chars),
        }}
      />
    </Catalog>
  );
}

describe('show_form progressive mounting', () => {
  it('mounts a field as soon as its definition is complete', () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('makes a mounted field IMMEDIATELY interactive', async () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    await userEvent.type(screen.getByLabelText('Name'), 'K');
    expect(screen.getByLabelText('Name')).toHaveValue('K');
  });

  it('LOCKS submit until the schema is complete', () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('LOCKS cancel too — one answer per tool call, and never before the question is complete', () => {
    streamTo(FULL.indexOf('{"id":"email"'));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('unlocks submit once the emission completes', () => {
    streamTo(FULL.length);
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('renders NOTHING before the schema id has arrived — a stable identity is what makes growth reconcilable', () => {
    const { container } = streamTo('{"schema":{"id":"c'.length);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING before the schema VALUE itself has arrived — a non-object schema is not an identity either', () => {
    const { container } = streamTo('{"sch'.length);
    expect(container).toBeEmptyDOMElement();
  });

  it('PRESERVES what the user typed as later chunks arrive — append-only, no reset', async () => {
    const { rerender } = streamTo(FULL.indexOf('{"id":"email"'));
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    const { value } = parsePartialJson(FULL);
    rerender(
      <Catalog value={catalog}>
        <Part
          part={{
            type: 'tool',
            toolCallId: 'c1',
            name: 'show_form',
            state: 'streaming',
            input: value ?? {},
          }}
        />
      </Catalog>
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Karl');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('PRESERVES what the user typed across the streaming → ready transition', async () => {
    const { rerender } = streamTo(FULL.indexOf('{"id":"email"'));
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    const { value } = parsePartialJson(FULL);
    rerender(
      <Catalog value={catalog}>
        <Part
          part={{
            type: 'tool',
            toolCallId: 'c1',
            name: 'show_form',
            state: 'ready',
            input: value ?? {},
          }}
        />
      </Catalog>
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Karl');
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('reconciles by stable field id — a re-emitted field does not duplicate', () => {
    streamTo(FULL.length);
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
  });

  it('keeps submit LOCKED when the carriers disagree — rawInput completeness must not unlock a form rendered from a partial input', () => {
    // `input` holds a 1-field deep-partial while `rawInput` already parses as
    // the COMPLETE 2-field emission. Content precedence is unchanged (`input`
    // wins), so completeness proven for rawInput's parse says nothing about
    // the data actually rendered: the lock must hold.
    const oneFieldInput = {
      schema: { id: 'c', fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }] },
    };
    render(
      <Catalog value={catalog}>
        <Part
          part={{
            type: 'tool',
            toolCallId: 'c1',
            name: 'show_form',
            state: 'streaming',
            input: oneFieldInput,
            rawInput: FULL,
          }}
        />
      </Catalog>
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});

describe('show_form torn schema id — mount identity is pinned per tool call', () => {
  // An adapter's own partial-JSON parser (AI SDK) emits torn strings: an
  // id-last emission can complete every field while the id still reads
  // `"cont"` of `"contact"`. Same tool call = same form growing — the id
  // completing is a torn id healing, NOT a new form, so it must not reach
  // FormProvider as a form swap (which resets, wiping keystrokes).
  const nameField = { id: 'name', type: 'text', props: { label: 'Name' } };
  function tornIdPart(
    schemaId: string,
    state: 'streaming' | 'ready',
    onResolve?: (id: string, output: unknown) => void
  ) {
    return (
      <Catalog value={catalog}>
        <Part
          part={{
            type: 'tool',
            toolCallId: 'c1',
            name: 'show_form',
            state,
            input: { schema: { fields: [nameField], id: schemaId } },
          }}
          onResolve={onResolve}
        />
      </Catalog>
    );
  }

  it('keystrokes SURVIVE the id completing mid-stream ("cont" → "contact")', async () => {
    const { rerender } = render(tornIdPart('cont', 'streaming'));
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    rerender(tornIdPart('contact', 'streaming'));
    expect(screen.getByLabelText('Name')).toHaveValue('Karl');
  });

  it('keystrokes survive through to ready under the completed id, and submit resolves the typed values', async () => {
    const onResolve = vi.fn();
    const { rerender } = render(tornIdPart('cont', 'streaming', onResolve));
    await userEvent.type(screen.getByLabelText('Name'), 'Karl');
    rerender(tornIdPart('contact', 'ready', onResolve));
    expect(screen.getByLabelText('Name')).toHaveValue('Karl');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'c1',
        { status: 'submitted', values: { name: 'Karl' } },
        'show_form'
      )
    );
  });
});

const FULL_WITH_DEFAULT =
  '{"schema":{"id":"c","fields":[{"id":"name","type":"text","props":{"label":"Name"},"default":"Karl"},{"id":"email","type":"text","props":{"label":"Email"}}]}}';

function partAt(chars: number, state: 'streaming' | 'ready') {
  const raw = FULL_WITH_DEFAULT.slice(0, chars);
  const { value } = parsePartialJson(raw);
  return (
    <Catalog value={catalog}>
      <Part
        part={{
          type: 'tool',
          toolCallId: 'c1',
          name: 'show_form',
          state,
          input: value ?? {},
          rawInput: state === 'streaming' ? raw : undefined,
        }}
      />
    </Catalog>
  );
}

/** Final `[Name, Email]` values of a single-chunk emission — the parity oracle. */
function singleChunkFinalValues(): [string, string] {
  const baseline = render(partAt(FULL_WITH_DEFAULT.length, 'ready'));
  const values: [string, string] = [
    (screen.getByLabelText('Name') as HTMLInputElement).value,
    (screen.getByLabelText('Email') as HTMLInputElement).value,
  ];
  baseline.unmount();
  return values;
}

describe('show_form late-arriving streamed default', () => {
  // The emission cut EXACTLY between the field core (id/type/props) and its
  // `default`: the field mounts without a default, and the default's chunk
  // changes no shape signature — the seam this suite pins.
  const CORE_DEFAULT_BOUNDARY = FULL_WITH_DEFAULT.indexOf(',"default"');

  it('applies a default that arrives one chunk AFTER the field core', () => {
    const expected = singleChunkFinalValues();

    const { rerender } = render(partAt(CORE_DEFAULT_BOUNDARY, 'streaming'));
    expect(screen.getByLabelText('Name')).toHaveValue('');

    rerender(partAt(FULL_WITH_DEFAULT.length, 'ready'));

    expect([
      (screen.getByLabelText('Name') as HTMLInputElement).value,
      (screen.getByLabelText('Email') as HTMLInputElement).value,
    ]).toEqual(expected);
    expect(screen.getByLabelText('Name')).toHaveValue('Karl');
  });

  it('a late default NEVER overwrites what the user typed before its chunk arrived', async () => {
    const { rerender } = render(partAt(CORE_DEFAULT_BOUNDARY, 'streaming'));
    await userEvent.type(screen.getByLabelText('Name'), 'Bob');

    rerender(partAt(FULL_WITH_DEFAULT.length, 'ready'));

    expect(screen.getByLabelText('Name')).toHaveValue('Bob');
  });

  it.each([
    ['between the field core and its default', CORE_DEFAULT_BOUNDARY],
    ['mid-default (inside the torn string)', FULL_WITH_DEFAULT.indexOf('Karl') + 2],
    ['after the default, before the next field', FULL_WITH_DEFAULT.indexOf('{"id":"email"')],
    ['mid-second-field', FULL_WITH_DEFAULT.indexOf('"Email"') + 3],
  ])('values at ready are chunk-boundary-INDEPENDENT — cut %s', (_label, cut) => {
    const expected = singleChunkFinalValues();

    const { rerender } = render(partAt(cut, 'streaming'));
    rerender(partAt(FULL_WITH_DEFAULT.length, 'ready'));

    expect([
      (screen.getByLabelText('Name') as HTMLInputElement).value,
      (screen.getByLabelText('Email') as HTMLInputElement).value,
    ]).toEqual(expected);
  });
});
