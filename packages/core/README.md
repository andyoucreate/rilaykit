# @rilaykit/core

The foundation of [RilayKit](https://rilay.dev) — a schema-first, headless form library for React. Provides the component registry, type system, validation engine, condition system, and monitoring infrastructure.

## Installation

```bash
pnpm add @rilaykit/core   # or npm / yarn / bun
```

Requires React >= 18 and TypeScript >= 5.

## Quick Start

### 1. Define Your Components

```tsx
import type { ComponentRenderContext } from '@rilaykit/core';
import { z } from 'zod';

const inputProps = z.object({
  label: z.string(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
});
type InputProps = z.infer<typeof inputProps>;

function Input({ id, props, field }: ComponentRenderContext<InputProps>) {
  return (
    <div>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type={props.type || 'text'}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.[0] && <p>{field.error[0].message}</p>}
    </div>
  );
}
```

### 2. Create a Catalog

```tsx
import { ril } from '@rilaykit/core';

const rilay = ril.create()
  .component('input', { propsSchema: inputProps, renderer: Input })
  .component('select', { renderer: Select });
```

Each `.component()` call returns a new typed instance — registered types and their props propagate through the builder chain.

## Features

### Unified Catalog

Immutable, type-safe catalog with three namespaces — components, tools, and message parts — plus plugins and late renderer attachment.

```tsx
const rilay = ril.create()
  .component('input', { propsSchema: inputProps, meta: { icon: 'pencil' }, renderer: Input })
  .tool('confirm_order', { description: 'Ask the user to confirm the order' })
  .part('note', { renderer: NotePart })
  .use(myPlugin)
  .renderers({ tools: { confirm_order: ConfirmOrderTool } });

// Props are narrowed from each propsSchema
rilay.validateProps('input', { label: 'Email' }); // { success: true, value: ... }
```

Duplicate registrations throw `DuplicateError` (pass `replace: true` to swap an entry); unknown keys throw `NotFoundError`. Every error is a typed `RilayError` with a `code` (`VALIDATION | DUPLICATE | NOT_FOUND | INVALID_SCHEMA | CONFIGURATION | MAX_DEPTH`).

### Validation Engine

Universal validation based on [Standard Schema](https://standardschema.dev): built-in validators, any Standard Schema library (Zod, Valibot, ArkType...), or custom validators — no adapters, mix them freely.

```tsx
import { required, custom } from '@rilaykit/core';
import { z } from 'zod';

const strongPassword = custom(
  (value) => /(?=.*[A-Z])(?=.*\d)/.test(value),
  'Must contain uppercase and number'
);

validation: { validate: [required(), z.string().min(8), strongPassword] }
```

Validation timing is configured at the form level via `.setValidation({ mode, reValidateMode })` in `@rilaykit/forms` — see the [validation docs](https://rilay.dev/core-concepts/validation).

**Built-in validators** — `required`, `email`, `url`, `pattern`, `min`, `max`, `minLength`, `maxLength`, `number`, `custom`, `async`, `combine`

### Condition System

Declarative conditional logic with the `when()` builder — no `useEffect`, no imperative state.

```tsx
import { when } from '@rilaykit/core';

// Visibility
conditions: { visible: when('accountType').equals('business') }

// Combine with boolean logic
conditions: {
  visible: when('country').in(['US', 'CA']).and().field('age').greaterThan(18),
  required: when('accountType').equals('business'),
}
```

**Operators:** `equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `contains`, `notContains`, `in`, `notIn`, `matches`, `exists`, `notExists`

### Monitoring

Pluggable monitoring with event buffering, performance profiling, and automatic alerts.

```tsx
import { initializeMonitoring } from '@rilaykit/core';

const monitor = initializeMonitoring({ enabled: true, bufferSize: 100, flushInterval: 5000 });
monitor.addAdapter(myAdapter);
```

## API Overview

| Export | Description |
|--------|-------------|
| `ril` | Unified catalog builder (`.component()` / `.tool()` / `.part()` / `.use()` / `.renderers()`) with type accumulation |
| `RilayError`, `ValidationError`, `DuplicateError`, `NotFoundError`, `InvalidSchemaError`, `ConfigurationError`, `MaxDepthExceededError` | Typed error hierarchy |
| `when` | Condition builder for declarative field logic |
| `required`, `email`, `url`, `pattern`, `min`, `max`, `minLength`, `maxLength`, `number` | Built-in validators |
| `custom`, `async`, `combine` | Custom and composite validators |
| `initializeMonitoring`, `RilayMonitor` | Monitoring system |
| `evaluateCondition`, `ConditionDependencyGraph` | Condition evaluation utilities |
| `FORM_LEVEL_ERROR_KEY`, `FORM_LEVEL_ERROR_CODE` | Constants for the `__form__` error bucket (cross-field errors) |

## Architecture

`@rilaykit/core` is the foundation layer with no React rendering dependency — it runs in Node, tests, and build scripts. The other packages build on top of it:

```
@rilaykit/core          ← you are here
    ↑
@rilaykit/forms         (form builder + React components)
    ↑
@rilaykit/workflow      (multi-step workflows)
    ↑
@rilaykit/agent         (AI tool calling: show_form / show_flow / show_component)
```

## Documentation

Full documentation at [rilay.dev](https://rilay.dev):

- [Installation](https://rilay.dev/getting-started/installation)
- [Quick Start](https://rilay.dev/quickstart)
- [Component Registry](https://rilay.dev/core-concepts/ril-instance)
- [Validation](https://rilay.dev/core-concepts/validation)
- [Conditions](https://rilay.dev/core-concepts/conditions)
- [TypeScript Support](https://rilay.dev/core-concepts/typescript-support)
- [API Reference](https://rilay.dev/api)

## License

MIT — see [LICENSE](./LICENSE) for details.
