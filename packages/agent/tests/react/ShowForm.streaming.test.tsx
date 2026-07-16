import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
});
