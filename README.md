# Streamline

A next-generation React form library designed with modularity, type safety, and extensibility at its core. Built on a plugin-based architecture with event-driven communication, it provides a comprehensive solution for complex form workflows while maintaining flexibility and performance.

## 🏗️ Architecture Philosophy

Streamline follows a layered, event-driven architecture with clear separation of concerns, enabling developers to use only what they need while maintaining full extensibility.

### Core Principles

- **Modular Design**: Separation of concerns with pluggable architecture
- **Type Safety First**: Branded types and compile-time validation
- **Event-Driven Communication**: Decoupled components communicating through events
- **Performance Optimized**: Lazy loading, virtualization, and smart caching

## 📦 Monorepo Structure

```
streamline/
├── packages/
│   ├── core/                    # Pure business logic
│   │   ├── form-engine/        # Abstract form engine
│   │   ├── validation-engine/  # Validation system
│   │   └── flow-engine/        # Workflow engine
│   ├── adapters/               # Integration adapters
│   │   ├── react-hook-form/   # React Hook Form adapter
│   │   ├── validation/        # Validation adapters (Zod, Yup, Joi)
│   │   └── state/             # State management adapters
│   ├── renderers/             # UI rendering system
│   │   ├── base/              # Base HTML renderer
│   │   ├── material-ui/       # Material-UI renderer
│   │   ├── chakra-ui/         # Chakra UI renderer
│   │   ├── tailwind/          # Tailwind renderer
│   │   └── headless/          # Headless renderer
│   ├── builders/              # Visual builders
│   │   ├── form-builder/      # Form builder
│   │   ├── flow-builder/      # Flow builder
│   │   └── schema-builder/    # Schema builder
│   ├── devtools/              # Development tools
│   │   ├── debugger/          # Form debugger
│   │   ├── inspector/         # State inspector
│   │   └── testing/           # Testing utilities
│   ├── plugins/               # Official plugins
│   │   ├── analytics/         # Analytics plugin
│   │   ├── persistence/       # Data persistence
│   │   └── internationalization/ # i18n plugin
│   └── cli/                   # CLI tools
└── apps/
    ├── docs/                  # Documentation site
    ├── playground/            # Interactive playground
    └── examples/              # Example applications
```

## 🚀 Quick Start

### Installation

```bash
npm install @streamline/core @streamline/renderers-base
```

### Basic Usage

```typescript
import { StreamlineForm, createFormConfig } from '@streamline/core';
import { z } from 'zod';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
});

const formConfig = createFormConfig({
  id: 'user-form',
  schema,
  renderer: 'base',
  fields: [
    {
      id: 'firstName',
      type: 'text',
      label: 'First Name',
      required: true,
    },
    {
      id: 'lastName',
      type: 'text',
      label: 'Last Name',
      required: true,
    },
    {
      id: 'email',
      type: 'email',
      label: 'Email Address',
      required: true,
    },
  ],
});

function MyForm() {
  const handleSubmit = (data) => {
    console.log('Form submitted:', data);
  };

  return (
    <StreamlineForm
      config={formConfig}
      onSubmit={handleSubmit}
    />
  );
}
```

## 🎯 Key Features

### 🔧 Modular Architecture
- Use only the packages you need
- Mix and match renderers, adapters, and plugins
- Extend functionality through custom plugins

### 🎨 Multiple Renderers
- **Base**: Minimal HTML styling
- **Material-UI**: Google's Material Design
- **Chakra UI**: Modular component library
- **Tailwind**: Utility-first CSS framework
- **Headless**: Bring your own styling

### 🔄 Multi-Step Workflows
Create complex workflows combining:
- **Configurable Pages**: User-created pages with form fields
- **Pre-developed Steps**: Custom React components
- **Conditional Navigation**: Dynamic flow based on user input

### ✅ Advanced Validation
- **Schema-based**: Zod, Yup, Joi integration
- **Async validation**: Server-side validation support
- **Cross-field validation**: Validate fields together
- **Conditional validation**: Rules based on other fields

### 🎪 Visual Builders
- **Form Builder**: Drag-and-drop form creation
- **Flow Builder**: Visual workflow designer
- **Schema Builder**: Interactive schema creation

### 🔌 Plugin System
- **Analytics**: Track form interactions
- **Persistence**: Auto-save form data
- **Accessibility**: Enhanced a11y features
- **Internationalization**: Multi-language support

## 🛠️ Development

### Prerequisites
- Node.js >= 18.0.0
- npm >= 10.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/streamline/streamline.git
cd streamline

# Install dependencies
npm install

# Build all packages
npm run build

# Start development
npm run dev
```

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific package tests
npm run test --filter=@streamline/core
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for your changes
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📚 Documentation

- [Getting Started Guide](./docs/getting-started.md)
- [API Reference](./docs/api-reference.md)
- [Architecture Overview](./docs/architecture.md)
- [Plugin Development](./docs/plugin-development.md)
- [Custom Renderers](./docs/custom-renderers.md)
- [Examples](./apps/examples/)

## 🤝 Community

- [Discord](https://discord.gg/streamline)
- [GitHub Discussions](https://github.com/streamline/streamline/discussions)
- [Twitter](https://twitter.com/streamlineforms)

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- React Hook Form for inspiration
- Zod for excellent TypeScript-first validation
- Material-UI, Chakra UI, and Tailwind CSS for UI components
- The open-source community for continuous inspiration

---

Built with ❤️ by the Streamline team 