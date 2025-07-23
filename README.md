# Rilay

[![npm version](https://badge.fury.io/js/@rilaykit%2Fcore.svg)](https://badge.fury.io/js/@rilaykit%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

**A next-generation React form library designed with modularity, type safety, and extensibility at its core.**

🏠 **[Full Documentation](https://docs.rilay.io)** • 🚀 **[Quick Start Guide](#installation)**

## ✨ Key Features

- 🧩 **Modular Architecture** - Separate packages for core, forms, and workflows
- 🔷 **100% TypeScript** - Full support with type inference
- 🎨 **"Bring your own components"** - Provides the logic, you provide the UI
- ⚡ **Fluent Builder API** - Form creation with chainable syntax
- 🔄 **Multi-step Workflows** - Complex navigation with conditional logic
- ✅ **Advanced Validation System** - Sync/async validation with debouncing
- 🎯 **Conditional Logic** - Dynamic field show/hide functionality
- 📊 **Built-in Analytics** - Performance and user behavior tracking

## 📦 Packages

| Package | Version | Description | License |
|---------|---------|-------------|---------|
| `@rilaykit/core` | ![npm](https://img.shields.io/npm/v/@rilaykit/core) | Core configuration system and types | MIT |
| `@rilaykit/forms` | ![npm](https://img.shields.io/npm/v/@rilaykit/forms) | Form building and rendering | MIT |
| `@rilaykit/workflow` | ![npm](https://img.shields.io/npm/v/@rilaykit/workflow) | Multi-step workflows (Premium) | Commercial |

## 🚀 Installation

```bash
# Basic installation (forms)
npm install @rilaykit/core @rilaykit/forms

# With workflows (license required)  
npm install @rilaykit/core @rilaykit/forms @rilaykit/workflow
```

## 🏁 Quick Start Guide

### 1. Component Configuration

```typescript
import { ril } from '@rilaykit/core';
import { TextInput, EmailInput } from './components';

const factory = ril
  .create()
  .addComponent('text', {
    name: 'Text Input',
    renderer: TextInput,
    defaultProps: { placeholder: 'Enter text...' },
    validation: {
      validators: [required()],
      validateOnBlur: true
    }
  })
  .addComponent('email', {
    name: 'Email Input',
    renderer: EmailInput,
    validation: {
      validators: [email('Invalid email')],
    }
  });
```

### 2. Form Building

```typescript
import { required, minLength } from '@rilaykit/core';

const form = factory
  .form('user-registration')
  .add({
    type: 'text',
    props: { label: 'First Name' },
    validation: {
      validators: [required(), minLength(2)],
      validateOnBlur: true
    }
  })
  .add(
    { type: 'text', props: { label: 'First Name' } },
    { type: 'text', props: { label: 'Last Name' } }  // Same row
  )
  .add({
    type: 'email',
    props: { label: 'Email' },
    validation: {
      validators: [
        async(async (value) => {
          const isUnique = await checkEmailUnique(value);
          return isUnique;
        }, 'Email already exists')
      ],
      debounceMs: 500
    }
  })
  .build();
```

### 3. Form Rendering

```typescript
import { Form, FormField } from '@rilaykit/forms';

function MyForm() {
  return (
    <Form formConfig={form}>
      <FormField fieldId="firstName" />
      <FormField fieldId="lastName" />
      <FormField fieldId="email" />
    </Form>
  );
}
```

### 4. Multi-step Workflow (Premium)

```typescript
import { when } from '@rilaykit/core';
import { Workflow, WorkflowStepper, WorkflowBody } from '@rilaykit/workflow';

const workflow = factory
  .flow('onboarding', 'User Onboarding')
  .addStep({
    title: 'Personal Information',
    formConfig: personalInfoForm,
    onAfterValidation: async (stepData, helper, context) => {
      // API call based on step data
      const companyInfo = await fetchCompanyBySiren(stepData.siren);
      
      // Pre-fill next step
      helper.setNextStepFields({
        companyName: companyInfo.name,
        address: companyInfo.address
      });
    }
  })
  .addStep({
    title: 'Company Details',
    formConfig: companyForm,
    conditions: {
      visible: when('personal-info.siren').equals('123456789'),
      skippable: when('companyName').isNotEmpty()
    }
  })
  .configure({
    analytics: {
      onStepComplete: (stepId, duration, data) => {
        console.log('Step completed:', stepId, duration);
      }
    }
  })
  .build();

function MyWorkflow() {
  return (
    <Workflow workflowConfig={workflow}>
      <WorkflowStepper />
      <WorkflowBody />
      <div>
        <WorkflowPreviousButton />
        <WorkflowNextButton />
      </div>
    </Workflow>
  );
}
```

## 🔧 Advanced Features

### Conditional Logic

```typescript
import { when } from '@rilaykit/core';

.add({
  type: 'text',
  props: { label: 'Company Name' },
  conditions: {
    visible: when('userType').equals('business'),
    required: when('revenue').greaterThan(100000),
    disabled: when('isProcessing').equals(true)
  }
})
```

### Complex Validation

```typescript
// Form-level validation
const form = factory
  .form()
  .setValidation({
    validators: [
      (formData) => {
        if (!formData.email && !formData.phone) {
          return { 
            isValid: false, 
            errors: [{ message: 'Email or phone required' }] 
          };
        }
        return { isValid: true, errors: [] };
      }
    ]
  });
```

### Custom Rendering

```typescript
const factory = ril
  .create()
  .configure({
    rowRenderer: CustomRowRenderer,
    submitButtonRenderer: CustomSubmitButton,
    fieldRenderer: CustomFieldRenderer
  });
```

## 📚 Documentation

- **[Installation](https://docs.rilay.io/getting-started/installation)** - Detailed installation guide
- **[Your First Form](https://docs.rilay.io/getting-started/your-first-form)** - Step-by-step tutorial
- **[Core API](https://docs.rilay.io/core-concepts/ril-instance)** - RIL instance documentation
- **[Forms](https://docs.rilay.io/forms/building-forms)** - Form building guide
- **[Workflows](https://docs.rilay.io/workflow/building-workflows)** - Multi-step workflows
- **[Validation](https://docs.rilay.io/forms/validation)** - Validation system
- **[TypeScript](https://docs.rilay.io/core-concepts/typescript-support)** - TypeScript support

## 🛠 Usage Examples

Check the [`apps/playground`](./apps/playground) folder for complete examples:

- **[Form Test](./apps/playground/src/pages/form-test.tsx)** - Basic form example
- **[Workflow Test](./apps/playground/src/pages/workflow-test.tsx)** - Complete workflow with API integration

## 🏗 Architecture

Rilay is built around several key concepts:

### Component Registry
Register your components with default properties and validation:

```typescript
.addComponent('text', {
  name: 'Text Input',
  renderer: TextInput,
  defaultProps: { placeholder: 'Enter...' },
  validation: { validators: [required()] }
})
```

### Builder Pattern
Fluent, chainable API for building your forms:

```typescript
factory.form()
  .add({ type: 'text', props: { label: 'Name' } })
  .add({ type: 'email', props: { label: 'Email' } })
  .build()
```

### Rendering System
Complete control over rendering of every UI element:

- `ComponentRenderer` - Individual field rendering
- `RowRenderer` - Form row rendering
- `FormRenderer` - Complete form rendering
- `SubmitButtonRenderer` - Submit button rendering

## 🔐 License

- **@rilaykit/core** and **@rilaykit/forms**: [MIT License](./LICENSE.md)
- **@rilaykit/workflow**: Commercial license required ([More info](https://docs.rilay.io/workflow/licensing))

## 🤝 Contributing

We welcome contributions! Please see our [contributing guide](./CONTRIBUTING.md) to get started.

## 🆘 Support

- 📖 [Documentation](https://docs.rilay.io)
- 💬 [GitHub Discussions](https://github.com/andyoucreate/rilaykit/discussions)
- 🐛 [Issues](https://github.com/andyoucreate/rilaykit/issues)
- 📧 [Support](mailto:support@rilay.io)

---

<div align="center">
  <strong>Built with ❤️ by the Rilay team</strong>
</div>