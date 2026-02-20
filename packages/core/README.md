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
import { ComponentRenderer } from '@rilaykit/core';

interface InputProps {
  label: string;
  type?: string;
  placeholder?: string;
}

const Input: ComponentRenderer<InputProps> = ({
  id, value, onChange, onBlur, error, props,
}) => (
  <div>
    <label htmlFor={id}>{props.label}</label>
    <input
      id={id}
      type={props.type || 'text'}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
    />
    {error && <p>{error[0].message}</p>}
  </div>
);
```

### 2. Create a Registry

```tsx
import { ril } from '@rilaykit/core';

const rilay = ril.create()
  .addComponent('input', { renderer: Input })
  .addComponent('select', { renderer: Select });
```

Each `.addComponent()` call returns a new typed instance — TypeScript tracks registered types and propagates component prop types through the entire builder chain.

## Features

### Component Registry

An immutable, type-safe registry that maps component type names to their renderers and default props. Configured once, used across your entire application.

```tsx
const rilay = ril.create()
  .addComponent('input', { renderer: Input })
  .addComponent('textarea', { renderer: Textarea })
  .addComponent('select', { renderer: Select });

// TypeScript knows exactly which types are valid
// and narrows props accordingly
```

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
| `ril` | Component registry builder with type accumulation |
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
