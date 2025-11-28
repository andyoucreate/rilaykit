# @rilaykit/builder

> Visual builder for creating forms and workflows with drag-and-drop functionality.

## ✨ Features

- 🎨 **Visual Form Builder** - Create forms with drag-and-drop
- 🔄 **Immutable State** - All operations return new instances (Rilay philosophy)
- 📦 **Type-Safe** - Full TypeScript support with type inference
- ⚡ **Real-time Preview** - See changes instantly
- 🔌 **Extensible** - Custom property editors and components
- 💾 **Export/Import** - Save and load configurations as JSON
- ↶↷ **Undo/Redo** - Built-in history management

## 📦 Installation

```bash
npm install @rilaykit/builder
# or
pnpm add @rilaykit/builder
# or
yarn add @rilaykit/builder
```

## 🚀 Quick Start

```typescript
import { FormBuilder } from '@rilaykit/builder';
import { ril } from '@rilaykit/core';
import { TextInput, EmailInput } from './components';

// 1. Create your RilayKit configuration
const rilConfig = ril.create()
  .addComponent('text', {
    name: 'Text Input',
    renderer: TextInput,
    builder: {
      category: 'Inputs',
      icon: '📝',
      editableProps: [
        { key: 'label', label: 'Label', editorType: 'text' },
        { key: 'placeholder', label: 'Placeholder', editorType: 'text' },
      ]
    }
  })
  .addComponent('email', {
    name: 'Email Input',
    renderer: EmailInput,
    builder: {
      category: 'Inputs',
      icon: '📧',
      editableProps: [
        { key: 'label', label: 'Label', editorType: 'text' },
        { key: 'required', label: 'Required', editorType: 'boolean' },
      ]
    }
  });

// 2. Use the visual builder
function App() {
  return (
    <FormBuilder
      rilConfig={rilConfig}
      onSave={(event) => {
        console.log('Form saved:', event.data);
        // Save to your backend
      }}
    />
  );
}
```

## 📖 Usage

### Basic Usage (Uncontrolled)

```typescript
<FormBuilder
  rilConfig={rilConfig}
  handlers={{
    onSave: (event) => console.log('Saved:', event.data),
    onExport: (event) => downloadFile(event.content, 'form.json'),
  }}
/>
```

### Advanced Usage (Controlled)

```typescript
import { visualBuilder, FormBuilder } from '@rilaykit/builder';

function MyApp() {
  const [builder, setBuilder] = useState(() => 
    visualBuilder.create(rilConfig)
  );

  return (
    <FormBuilder
      rilConfig={rilConfig}
      builder={builder}
      onChange={setBuilder}
      handlers={{
        onSave: async (event) => {
          await api.saveForm(event.data);
        },
      }}
    />
  );
}
```

### Programmatic Usage

```typescript
import { visualBuilder } from '@rilaykit/builder';

// Create builder
const builder = visualBuilder.create(rilConfig)
  .addComponent('text', { label: 'Name' })
  .addComponent('email', { label: 'Email', required: true })
  .build();

// Use with standard Form component
<Form config={builder} onSubmit={handleSubmit} />
```

## 🎨 Component Configuration

### Simple Configuration

```typescript
rilConfig.addComponent('text', {
  name: 'Text Input',
  renderer: TextInput,
  defaultProps: {
    label: '',
    placeholder: '',
  }
});

// ✅ Automatically available in builder with default editors
```

### Advanced Configuration

```typescript
rilConfig.addComponent('location', {
  name: 'Location Field',
  description: 'Address and geolocation input',
  renderer: LocationInput,
  defaultProps: {
    label: 'Location',
    granularity: 'full',
    enableMap: false,
  },
  builder: {
    // Category for organization
    category: 'Advanced Inputs',
    
    // Icon for visual identification
    icon: '📍',
    
    // Tags for search
    tags: ['location', 'address', 'geo', 'map'],
    
    // Hide from palette
    hidden: false,
    
    // Editable properties
    editableProps: [
      {
        key: 'label',
        label: 'Field Label',
        editorType: 'text',
        required: true,
        group: 'Basic',
      },
      {
        key: 'granularity',
        label: 'Granularity',
        editorType: 'select',
        options: [
          { label: 'Full Address', value: 'full' },
          { label: 'City Only', value: 'city' },
          { label: 'Country Only', value: 'country' },
        ],
        defaultValue: 'full',
        group: 'Configuration',
      },
      {
        key: 'enableMap',
        label: 'Enable Map Picker',
        editorType: 'boolean',
        defaultValue: false,
        helpText: 'Allow users to select location on a map',
        group: 'Features',
      },
    ],
  },
});
```

### Custom Property Editors

```typescript
import type { PropertyEditorProps } from '@rilaykit/builder';

// Create custom editor
const ColorEditor: React.FC<PropertyEditorProps<string>> = ({
  value,
  onChange,
  definition,
}) => {
  return (
    <input
      type="color"
      value={value || '#000000'}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

// Use in component config
rilConfig.addComponent('heading', {
  name: 'Heading',
  renderer: Heading,
  builder: {
    editableProps: [
      {
        key: 'color',
        label: 'Text Color',
        editorType: 'color',
        customEditor: ColorEditor,
      },
    ],
  },
});
```

## 🔧 API Reference

### `visualBuilder`

Core builder class (pure logic, no React).

```typescript
// Create
const builder = visualBuilder.create(rilConfig, 'form-id');

// Add component
const newBuilder = builder.addComponent('text', { label: 'Name' });

// Update field
const updated = builder.updateField('field-id', { label: 'Full Name' });

// Remove field
const removed = builder.removeField('field-id');

// Select field
const selected = builder.selectField('field-id');

// Undo/Redo
const undone = builder.undo();
const redone = builder.redo();

// Build final config
const config = builder.build();
```

### `useBuilderState` Hook

React hook for managing builder state.

```typescript
import { useBuilderState } from '@rilaykit/builder';

function MyBuilder() {
  const { state, actions } = useBuilderState(rilConfig);
  
  return (
    <div>
      <button onClick={() => actions.addComponent('text')}>
        Add Field
      </button>
      <button onClick={actions.undo} disabled={!state.canUndo}>
        Undo
      </button>
      <button onClick={actions.redo} disabled={!state.canRedo}>
        Redo
      </button>
    </div>
  );
}
```

### Export/Import

```typescript
import { exportBuilder, downloadExport } from '@rilaykit/builder';

// Export to JSON
const json = builder.toJSON();

// Export to TypeScript
const code = exportBuilder(json, {
  format: 'typescript',
  includeComments: true,
});

// Download
downloadExport(code, 'my-form', 'typescript');
```

## 🎓 Examples

See [/src/examples](./src/examples) for complete examples:

- [`custom-field-types.ts`](./src/examples/custom-field-types.ts) - Custom field types (location, phone, currency, etc.)

## 🏗️ Architecture

The builder follows Rilay's philosophy:

- **DRY**: Reuses existing `form` and `flow` builders
- **YAGNI**: Only essential features (MVP)
- **Immutable**: All operations return new instances
- **Type-Safe**: Full TypeScript support
- **Modular**: Clear separation of concerns

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## 📝 License

MIT © AND YOU CREATE

## 🔗 Links

- [Documentation](https://rilay.io/docs/builder)
- [GitHub](https://github.com/andyoucreate/rilay)
- [Issues](https://github.com/andyoucreate/rilay/issues)
