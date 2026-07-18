# @rilaykit/core

The foundation of [RilayKit](https://rilay.dev) — a schema-first, headless form library for React.

`@rilaykit/core` provides the component registry, type system, validation engine, condition system, and monitoring infrastructure that powers the entire RilayKit ecosystem.

## Installation

```bash
# pnpm (recommended)
pnpm add @rilaykit/core

# npm
npm install @rilaykit/core

# yarn
yarn add @rilaykit/core

# bun
bun add @rilaykit/core
```

### Requirements

- React >= 18
- TypeScript >= 5

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

Each `.component()` call returns a new typed instance — TypeScript tracks registered types and propagates component prop types through the entire builder chain.

## Features

### Unified Catalog

An immutable, type-safe catalog with three namespaces — components, tools, and message parts — plus plugins and late renderer attachment.

```tsx
const rilay = ril.create()
  .component('input', { propsSchema: inputProps, meta: { icon: 'pencil' }, renderer: Input })
  .tool('confirm_order', { description: 'Ask the user to confirm the order' })
  .part('note', { renderer: NotePart })
  .use(myPlugin)
  .renderers({ tools: { confirm_order: ConfirmOrderTool } });

// TypeScript knows exactly which component types are valid
// and narrows props from each propsSchema
rilay.validateProps('input', { label: 'Email' }); // { success: true, value: ... }
```

Duplicate registrations throw `DuplicateError` (pass `replace: true` to swap an entry); unknown keys throw `NotFoundError`. Every error is a typed `RilayError` with a `code` (`VALIDATION | DUPLICATE | NOT_FOUND | INVALID_SCHEMA | CONFIGURATION`).

### Validation Engine

Universal validation based on [Standard Schema](https://standardschema.dev). Use built-in validators, any Standard Schema compatible library (Zod, Valibot, ArkType, Yup...), or write custom validators — no adapters needed.

```tsx
import { required, email, minLength, custom } from '@rilaykit/core';

// Built-in validators
validation: { validate: [required(), email()] }

// Zod (or any Standard Schema library) — no adapter
import { z } from 'zod';
validation: { validate: z.string().email() }

// Custom validators
const strongPassword = custom(
  (value) => /(?=.*[A-Z])(?=.*\d)/.test(value),
  'Must contain uppercase and number'
);

// Mix them freely
validation: { validate: [required(), z.string().min(8), strongPassword] }
```

**Built-in validators:** `required`, `email`, `url`, `pattern`, `min`, `max`, `minLength`, `maxLength`, `number`, `custom`, `async`, `combine`

### Condition System

Declarative conditional logic with the `when()` builder. No `useEffect`, no imperative state management.

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

Pluggable monitoring system with event buffering, performance profiling, and automatic alerts.

```tsx
import { initializeMonitoring } from '@rilaykit/core';

const monitor = initializeMonitoring({
  adapters: [myAdapter],
  bufferSize: 100,
  flushInterval: 5000,
});
```

## API Overview

| Export | Description |
|--------|-------------|
| `ril` | Unified catalog builder (`.component()` / `.tool()` / `.part()` / `.use()` / `.renderers()`) with type accumulation |
| `RilayError`, `ValidationError`, `DuplicateError`, `NotFoundError`, `InvalidSchemaError`, `ConfigurationError` | Typed error hierarchy |
| `when` | Condition builder for declarative field logic |
| `required`, `email`, `url`, `pattern`, `min`, `max`, `minLength`, `maxLength`, `number` | Built-in validators |
| `custom`, `async`, `combine` | Custom and composite validators |
| `initializeMonitoring`, `RilayMonitor` | Monitoring system |
| `evaluateCondition`, `ConditionDependencyGraph` | Condition evaluation utilities |

## Architecture

`@rilaykit/core` is the foundation layer with no React rendering dependency. It can run in Node, in tests, and in build scripts. The other RilayKit packages build on top of it:

```
@rilaykit/core          ← you are here
    ↑
@rilaykit/forms         (form builder + React components)
    ↑
@rilaykit/workflow      (multi-step workflows)
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
