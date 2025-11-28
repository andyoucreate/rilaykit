import { FormBuilder } from '@rilaykit/builder';
import type { ComponentRenderProps, ComponentRenderer } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { useState } from 'react';

// =================================================================
// COMPONENT DEFINITIONS
// =================================================================

interface TextInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
}

interface EmailInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
}

interface NumberInputProps {
  label: string;
  placeholder?: string;
  min?: number;
  max?: number;
  required?: boolean;
}

interface SelectInputProps {
  label: string;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  required?: boolean;
}

interface CheckboxInputProps {
  label: string;
  description?: string;
}

interface TextareaInputProps {
  label: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}

// =================================================================
// COMPONENT RENDERERS
// =================================================================

const TextInput: ComponentRenderer<TextInputProps> = (
  props: ComponentRenderProps<TextInputProps>
) => (
  <div className="mb-4">
    <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-1">
      {props.props.label}
      {props.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={props.id}
      type="text"
      placeholder={props.props.placeholder}
      required={props.props.required}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
    {props.props.helpText && <p className="mt-1 text-sm text-gray-500">{props.props.helpText}</p>}
  </div>
);

const EmailInput: ComponentRenderer<EmailInputProps> = (
  props: ComponentRenderProps<EmailInputProps>
) => (
  <div className="mb-4">
    <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-1">
      {props.props.label}
      {props.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={props.id}
      type="email"
      placeholder={props.props.placeholder}
      required={props.props.required}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
    {props.props.helpText && <p className="mt-1 text-sm text-gray-500">{props.props.helpText}</p>}
  </div>
);

const NumberInput: ComponentRenderer<NumberInputProps> = (
  props: ComponentRenderProps<NumberInputProps>
) => (
  <div className="mb-4">
    <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-1">
      {props.props.label}
      {props.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={props.id}
      type="number"
      placeholder={props.props.placeholder}
      min={props.props.min}
      max={props.props.max}
      required={props.props.required}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

const SelectInput: ComponentRenderer<SelectInputProps> = (
  props: ComponentRenderProps<SelectInputProps>
) => (
  <div className="mb-4">
    <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-1">
      {props.props.label}
      {props.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <select
      id={props.id}
      required={props.props.required}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {props.props.placeholder && <option value="">{props.props.placeholder}</option>}
      {props.props.options.map((option: { label: string; value: string }) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const CheckboxInput: ComponentRenderer<CheckboxInputProps> = (
  props: ComponentRenderProps<CheckboxInputProps>
) => (
  <div className="mb-4">
    <div className="flex items-start">
      <input
        id={props.id}
        type="checkbox"
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
      />
      <div className="ml-3">
        <label htmlFor={props.id} className="text-sm font-medium text-gray-700">
          {props.props.label}
        </label>
        {props.props.description && (
          <p className="text-sm text-gray-500">{props.props.description}</p>
        )}
      </div>
    </div>
  </div>
);

const TextareaInput: ComponentRenderer<TextareaInputProps> = (
  props: ComponentRenderProps<TextareaInputProps>
) => (
  <div className="mb-4">
    <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-1">
      {props.props.label}
      {props.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <textarea
      id={props.id}
      placeholder={props.props.placeholder}
      rows={props.props.rows || 4}
      required={props.props.required}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

// =================================================================
// RILAY CONFIGURATION
// =================================================================

const rilConfig = ril
  .create()
  .addComponent('text', {
    name: 'Text Input',
    description: 'Single line text input field',
    renderer: TextInput,
    defaultProps: {
      label: 'Text Field',
      placeholder: 'Enter text...',
      required: false,
    },
    builder: {
      category: 'Basic Inputs',
      icon: '📝',
      tags: ['text', 'input', 'string'],
      editableProps: [
        {
          key: 'label',
          label: 'Label',
          editorType: 'text',
          required: true,
          placeholder: 'Field label',
        },
        {
          key: 'placeholder',
          label: 'Placeholder',
          editorType: 'text',
          placeholder: 'Enter placeholder text',
        },
        {
          key: 'helpText',
          label: 'Help Text',
          editorType: 'textarea',
          placeholder: 'Additional help text',
        },
        {
          key: 'required',
          label: 'Required',
          editorType: 'boolean',
          defaultValue: false,
        },
      ],
    },
  })
  .addComponent('email', {
    name: 'Email Input',
    description: 'Email address input with validation',
    renderer: EmailInput,
    defaultProps: {
      label: 'Email',
      placeholder: 'user@example.com',
      required: false,
    },
    builder: {
      category: 'Basic Inputs',
      icon: '📧',
      tags: ['email', 'input', 'contact'],
      editableProps: [
        {
          key: 'label',
          label: 'Label',
          editorType: 'text',
          required: true,
        },
        {
          key: 'placeholder',
          label: 'Placeholder',
          editorType: 'text',
        },
        {
          key: 'helpText',
          label: 'Help Text',
          editorType: 'textarea',
        },
        {
          key: 'required',
          label: 'Required',
          editorType: 'boolean',
        },
      ],
    },
  })
  .addComponent('number', {
    name: 'Number Input',
    description: 'Numeric input field',
    renderer: NumberInput,
    defaultProps: {
      label: 'Number',
      placeholder: 'Enter number',
      required: false,
    },
    builder: {
      category: 'Basic Inputs',
      icon: '🔢',
      tags: ['number', 'numeric', 'integer'],
      editableProps: [
        {
          key: 'label',
          label: 'Label',
          editorType: 'text',
          required: true,
        },
        {
          key: 'placeholder',
          label: 'Placeholder',
          editorType: 'text',
        },
        {
          key: 'min',
          label: 'Minimum Value',
          editorType: 'number',
        },
        {
          key: 'max',
          label: 'Maximum Value',
          editorType: 'number',
        },
        {
          key: 'required',
          label: 'Required',
          editorType: 'boolean',
        },
      ],
    },
  })
  .addComponent('select', {
    name: 'Select Dropdown',
    description: 'Dropdown selection field',
    renderer: SelectInput,
    defaultProps: {
      label: 'Select',
      options: [],
      placeholder: 'Choose an option',
      required: false,
    },
    builder: {
      category: 'Selection',
      icon: '📋',
      tags: ['select', 'dropdown', 'options'],
      editableProps: [
        {
          key: 'label',
          label: 'Label',
          editorType: 'text',
          required: true,
        },
        {
          key: 'placeholder',
          label: 'Placeholder',
          editorType: 'text',
        },
        {
          key: 'required',
          label: 'Required',
          editorType: 'boolean',
        },
      ],
    },
  })
  .addComponent('checkbox', {
    name: 'Checkbox',
    description: 'Single checkbox input',
    renderer: CheckboxInput,
    defaultProps: {
      label: 'Checkbox',
    },
    builder: {
      category: 'Selection',
      icon: '☑️',
      tags: ['checkbox', 'boolean', 'toggle'],
      editableProps: [
        {
          key: 'label',
          label: 'Label',
          editorType: 'text',
          required: true,
        },
        {
          key: 'description',
          label: 'Description',
          editorType: 'textarea',
        },
      ],
    },
  })
  .addComponent('textarea', {
    name: 'Text Area',
    description: 'Multi-line text input',
    renderer: TextareaInput,
    defaultProps: {
      label: 'Text Area',
      placeholder: 'Enter text...',
      rows: 4,
      required: false,
    },
    builder: {
      category: 'Basic Inputs',
      icon: '📄',
      tags: ['textarea', 'multiline', 'long text'],
      editableProps: [
        {
          key: 'label',
          label: 'Label',
          editorType: 'text',
          required: true,
        },
        {
          key: 'placeholder',
          label: 'Placeholder',
          editorType: 'text',
        },
        {
          key: 'rows',
          label: 'Number of Rows',
          editorType: 'number',
          defaultValue: 4,
        },
        {
          key: 'required',
          label: 'Required',
          editorType: 'boolean',
        },
      ],
    },
  });

// =================================================================
// BUILDER TEST PAGE
// =================================================================

export default function BuilderTestPage() {
  const [exportedData, setExportedData] = useState<string | null>(null);

  const handleSave = (event: any) => {
    console.log('Form saved:', event);
    const jsonData = JSON.stringify(event.data, null, 2);
    setExportedData(jsonData);
  };

  const handleExport = (event: any) => {
    console.log('Form exported:', event);
    // Download the exported content
    const blob = new Blob([event.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-export.${event.format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">🏗️ Form Builder Test</h1>
          <p className="mt-2 text-gray-600">
            Test the visual form builder with drag & drop functionality
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">📖 Instructions</h2>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li>Select components from the left sidebar to add them to your form</li>
            <li>Click on a field to select it and edit its properties in the right panel</li>
            <li>Use the toolbar buttons to undo/redo changes or save the form</li>
            <li>The form configuration will be exported as JSON when you click Save</li>
          </ul>
        </div>

        {/* Builder */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
          <FormBuilder
            rilConfig={rilConfig}
            handlers={{
              onSave: handleSave,
              onExport: handleExport,
            }}
          />
        </div>

        {/* Exported Data */}
        {exportedData && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">💾 Exported Configuration</h2>
              <button
                type="button"
                onClick={() => setExportedData(null)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96">
              {exportedData}
            </pre>
          </div>
        )}
      </div>

      {/* Global Styles for Builder */}
      <style jsx global>{`
        .rilay-builder {
          min-height: 600px;
        }
      `}</style>
    </div>
  );
}
