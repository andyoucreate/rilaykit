import {
  type ComponentRenderProps,
  type ComponentRenderer,
  type FormBodyRenderer,
  type FormBodyRendererProps,
  type FormRowRenderer,
  type FormRowRendererProps,
  type FormSubmitButtonRenderer,
  type FormSubmitButtonRendererProps,
  createZodValidator,
  ril,
} from '@rilay/core';
import { Form, FormBody, FormBuilder, FormSubmitButton } from '@rilay/form-builder';
import Link from 'next/link';
import type React from 'react';
import { z } from 'zod';

// Define props interfaces for our input components
interface TextInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
}

interface EmailInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
}

interface NumberInputProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
}

interface TextareaInputProps {
  label: string;
  placeholder?: string;
  rows?: number;
}

// Create basic input components with proper types
const TextInput: React.FC<ComponentRenderProps<TextInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
      {renderProps.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={renderProps.id}
      type="text"
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      required={renderProps.props.required}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

const EmailInput: React.FC<ComponentRenderProps<EmailInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
      {renderProps.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={renderProps.id}
      type="email"
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      required={renderProps.props.required}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

const NumberInput: React.FC<ComponentRenderProps<NumberInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
      {renderProps.props.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={renderProps.id}
      type="number"
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      required={renderProps.props.required}
      min={renderProps.props.min}
      max={renderProps.props.max}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

const TextareaInput: React.FC<ComponentRenderProps<TextareaInputProps>> = (renderProps) => (
  <div className="mb-4">
    <label htmlFor={renderProps.id} className="block text-sm font-medium text-gray-700 mb-2">
      {renderProps.props.label}
    </label>
    <textarea
      id={renderProps.id}
      value={renderProps.value || ''}
      onChange={(e) => renderProps.onChange?.(e.target.value)}
      onBlur={renderProps.onBlur}
      placeholder={renderProps.props.placeholder}
      rows={renderProps.props.rows || 4}
      disabled={renderProps.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        renderProps.error && renderProps.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {renderProps.error && renderProps.error.length > 0 && (
      <p className="mt-1 text-sm text-red-600">{renderProps.error[0].message}</p>
    )}
  </div>
);

// Custom renderers with proper types
const formRowRenderer: FormRowRenderer = (props: FormRowRendererProps): React.ReactElement => (
  <div
    className={`grid gap-4 mb-4 ${
      props.row.fields.length === 1
        ? 'grid-cols-1'
        : props.row.fields.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-3'
    }`}
  >
    {props.children}
  </div>
);

const formBodyRenderer: FormBodyRenderer = (props: FormBodyRendererProps): React.ReactElement => (
  <div className="space-y-4">
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-800">Test Form</h2>
      <p className="text-gray-600 mt-2">Test the FormBuilder features</p>
    </div>
    {props.children}
  </div>
);

// Submit button renderer with proper types
const formSubmitButtonRenderer: FormSubmitButtonRenderer = (
  props: FormSubmitButtonRendererProps
): React.ReactElement => (
  <button
    type="submit"
    onClick={props.onSubmit}
    disabled={props.isSubmitting || !props.isValid}
    className={`btn-primary w-full ${props.className || ''}`}
  >
    {props.isSubmitting ? 'Submitting...' : props.children || 'Submit'}
  </button>
);

export default function FormTestPage() {
  // Create and configure ril
  // Register input components with proper types
  const config = ril
    .create()
    .addComponent('text', {
      type: 'input',
      name: 'Text Input',
      description: 'Basic text input field',
      renderer: TextInput as ComponentRenderer<TextInputProps>,
      defaultProps: {
        placeholder: 'Enter text...',
      },
      category: 'inputs',
    })
    .addComponent('email', {
      type: 'input',
      name: 'Email Input',
      description: 'Email input field with validation',
      renderer: EmailInput as ComponentRenderer<EmailInputProps>,
      defaultProps: {
        placeholder: 'Enter email...',
      },
      category: 'inputs',
    })
    .addComponent('number', {
      type: 'input',
      name: 'Number Input',
      description: 'Numeric input field',
      renderer: NumberInput as ComponentRenderer<NumberInputProps>,
      defaultProps: {
        placeholder: 'Enter number...',
      },
      category: 'inputs',
    })
    .addComponent('textarea', {
      type: 'input',
      name: 'Textarea Input',
      description: 'Multi-line text input field',
      renderer: TextareaInput as ComponentRenderer<TextareaInputProps>,
      defaultProps: {
        placeholder: 'Enter text...',
        rows: 4,
      },
      category: 'inputs',
    });

  // Set custom renderers
  config
    .setRowRenderer(formRowRenderer)
    .setBodyRenderer(formBodyRenderer)
    .setSubmitButtonRenderer(formSubmitButtonRenderer);

  // Define Zod schema for validation
  const formSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    age: z.coerce
      .number({
        invalid_type_error: 'Age must be a number',
        required_error: 'Age is required',
      })
      .min(18, 'Must be at least 18 years old')
      .max(100, 'Must be 100 or younger'),
    bio: z.string().max(500, 'Biography must be 500 characters or less').optional(),
  });

  // Build form configuration using FormBuilder
  const formConfig = FormBuilder.create(config)
    .addRowFields([
      {
        fieldId: 'firstName',
        componentSubType: 'text',
        props: {
          label: 'First Name',
          placeholder: 'Enter your first name',
          required: true,
        },
        validation: { validator: createZodValidator(formSchema.shape.firstName) },
      },
      {
        fieldId: 'lastName',
        componentSubType: 'text',
        props: {
          label: 'Last Name',
          placeholder: 'Enter your last name',
          required: true,
        },
        validation: { validator: createZodValidator(formSchema.shape.lastName) },
      },
    ])
    .addField(
      'email',
      'email',
      {
        label: 'Email',
        placeholder: 'your@email.com',
        required: true,
      },
      { validation: { validator: createZodValidator(formSchema.shape.email) } }
    )
    .addField(
      'age',
      'number',
      {
        label: 'Age',
        required: true,
      },
      { validation: { validator: createZodValidator(formSchema.shape.age) } }
    )
    .addField(
      'bio',
      'textarea',
      {
        label: 'Biography',
        placeholder: 'Tell us about yourself...',
        rows: 4,
      },
      { validation: { validator: createZodValidator(formSchema.shape.bio) } }
    )
    .build();

  const handleSubmit = (data: Record<string, any>) => {
    console.log('Form data:', data);
    alert(`Form submitted successfully!\n\nData:\n${JSON.stringify(data, null, 2)}`);
  };

  const handleFieldChange = (fieldId: string, value: any, formData: Record<string, any>) => {
    console.log(`Field ${fieldId} changed:`, value);
    console.log('Complete data:', formData);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-primary hover:text-blue-600 text-sm font-medium">
          ← Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-800 mb-4">📝 Form Builder Test</h1>

      <p className="text-gray-600 mb-8">
        This form tests the features of the{' '}
        <code className="bg-gray-100 px-2 py-1 rounded text-sm">@rilay/form-builder</code> package.
      </p>

      <div className="form-container">
        <Form
          formConfig={formConfig}
          onSubmit={handleSubmit}
          onFieldChange={handleFieldChange}
          defaultValues={{
            firstName: '',
            lastName: '',
            email: '',
            age: '',
            bio: '',
          }}
        >
          <FormBody />
          <FormSubmitButton className="btn-primary w-full mt-6">Submit Form</FormSubmitButton>
        </Form>
      </div>

      <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">🔧 Features being tested:</h3>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Text fields with validation
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Email field with format validation
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Number field with min/max constraints
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Textarea for long text
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Real-time validation
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Submit callback
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Field change callback
          </li>
        </ul>
      </div>
    </div>
  );
}
