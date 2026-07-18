# @rilaykit/agent

AI-emitted UI for [RilayKit](https://rilay.dev) — let a model emit `show_form` / `show_flow` / `show_component` tool calls and render them as live, interactive components with human-in-the-loop resolution.

The package has two halves: a server-safe half that advertises your catalog to the model (`manifest`, `uiTools`, provider adapters), and a React half that renders the message parts the model sends back (`Catalog`, `Parts`) and feeds the user's answers into the tool result.

## Installation

```bash
pnpm add @rilaykit/agent
```

`@rilaykit/core`, `@rilaykit/forms`, and `@rilaykit/workflow` come with it. Using the all-in-one `rilaykit` package instead? The same surface is re-exported from `rilaykit`, `rilaykit/react`, `rilaykit/ai-sdk`, and `rilaykit/anthropic`.

### Requirements

- React >= 18 — only for the `/react` entry
- `ai` >= 5 — **optional** peer, only for the `/ai-sdk` entry

## Entry Points

Isomorphic split: the mains are React-free and import cleanly in Node / RSC. Only `/react` carries `'use client'`.

| Entry | Exports | React |
|-------|---------|-------|
| `@rilaykit/agent` | `uiTools`, `manifest`, part guards, `parsePartialJson`, emission-error helpers | No |
| `@rilaykit/agent/react` | `Catalog`, `Parts`, `Part`, built-in tool renderers | Yes (`'use client'`) |
| `@rilaykit/agent/ai-sdk` | `tools`, `toParts` for the Vercel AI SDK | No |
| `@rilaykit/agent/anthropic` | `tools`, `toParts` for the Anthropic Messages API | No |

## Quick Start

### 1. Catalog (shared)

```tsx
import { ril } from '@rilaykit/core';
import { uiTools, type TextPart } from '@rilaykit/agent';
import { Input } from './components/Input';

export const catalog = ril
  .create()
  .component('input', { renderer: Input })
  .use(uiTools()) // registers show_form / show_flow / show_component — schemas only, no execute
  .part<TextPart>('text', {
    renderer: ({ part }) => <p>{part.text}</p>,
  });
```

> Registering a `'text'` part renderer is **required** — there is no default, and text parts render nothing without one.

### 2. Server — advertise the tools

```ts
import { streamText } from 'ai';
import { manifest } from '@rilaykit/agent';
import { tools } from '@rilaykit/agent/ai-sdk';
import { catalog } from './catalog';

const result = streamText({
  model,
  system: manifest(catalog), // Markdown description of what the model may emit
  tools: tools(catalog),     // assignable to ToolSet — no cast, no execute (HITL)
  messages,
});
```

### 3. Client — render parts, resolve HITL

```tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { Catalog, Parts } from '@rilaykit/agent/react';
import { toParts } from '@rilaykit/agent/ai-sdk';
import { catalog } from './catalog';

export function Chat() {
  const { messages, addToolResult } = useChat();

  return (
    <Catalog value={catalog}>
      {messages.map((message) => (
        <Parts
          key={message.id}
          parts={toParts(message)}
          onResolve={(toolCallId, output, tool) => addToolResult({ toolCallId, tool, output })}
        />
      ))}
    </Catalog>
  );
}
```

A `show_form` resolves exactly once per `toolCallId` — `{ status: 'submitted', values }` or `{ status: 'cancelled' }` — and re-emission on the same `toolCallId` updates the rendered form in place.

## Adapters

Both adapters export the same pair — `tools(catalog)` to generate provider tool definitions and `toParts(message)` to map provider messages to the neutral `Part[]` model — with no consumer cast on either side.

| | `/ai-sdk` | `/anthropic` |
|---|---|---|
| `tools(catalog)` returns | assignable to `ToolSet` | `Anthropic.Tool[]` (`input_schema.type: 'object'`) |
| `toParts` maps | `text`, `tool-<name>` (all four states), `dynamic-tool`, `data-*` | `text`, `tool_use` (always `ready` — blocks arrive complete) |
| Tool states | `input-streaming` → `streaming`, `input-available` → `ready`, `output-available` → `done`, `output-error` → `error` | `ready` |
| Dependency | `ai` >= 5, optional peer (verified against ai@5.0.215) | none at runtime (types verified against @anthropic-ai/sdk@0.112.1) |

Schemas are vendor-neutral Standard Schema end-to-end (zod, valibot, arktype). The JSON schema sent to the provider comes from the schema's `~standard.jsonSchema` projection or a manual `inputJsonSchema` on the catalog entry; a tool with neither is skipped and logged — never thrown, and never advertised by `manifest()`.

## Rendering

- `<Parts>` dispatches each part to its catalog renderer; message-thread concerns (grouping, scrolling, composers) stay in the host.
- Tool parts without a catalog renderer fall back to the built-ins (`ShowForm`, `ShowFlow`, `ShowComponent`); override per tool with `.renderers({ tools: { show_form: ... } })`.
- Data parts dispatch on the single `'data'` part type — register one renderer and branch on `part.name`.

### Built-in `ShowFlow` limits

The bundled `show_flow` renderer handles binding-free schemas only: built-in validators, conditions, and repeatables. It discards workflow completion meta and has no persistence. Need bindings, persistence, or completion meta? Register a host renderer via `.renderers({ tools: { show_flow: ... } })`.

## API Overview

| Export | Entry | Description |
|--------|-------|-------------|
| `uiTools()` | main | Plugin registering `show_form` / `show_flow` / `show_component` as pure schemas |
| `manifest(catalog)` | main | Markdown catalog description for the system prompt |
| `isTextPart` / `isToolPart` / `isDataPart` | main | `Part` type guards |
| `parsePartialJson(text)` | main | Deep-partial parse of streaming tool input |
| `toEmissionResult` / `validateNodeProps` | main | Emission-error inspection helpers |
| `Catalog` / `Parts` / `Part` | `/react` | Context provider and part dispatchers |
| `ShowForm` / `ShowFlow` / `ShowComponent` / `DefaultTool` | `/react` | Built-in tool renderers |
| `tools(catalog)` / `toParts(message)` | `/ai-sdk`, `/anthropic` | Provider tool definitions / message-to-`Part[]` mapping |

## License

MIT — see [LICENSE](./LICENSE) for details.
