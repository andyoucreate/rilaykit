import {
  type ComponentRenderProps,
  type ComponentRenderer,
  email,
  minLength,
  required,
  ril,
} from '@rilaykit/core';
import { Form, FormField, FormSubmitButton, form } from '@rilaykit/forms';
import type React from 'react';
import { useState } from 'react';
import { z } from 'zod';

// Simple input component
const TextInput: React.FC<ComponentRenderProps<{ label: string; type?: string }>> = (props) => (
  <div className="mb-4">
    <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-2">
      {props.props.label}
    </label>
    <input
      id={props.id}
      type={props.props.type || 'text'}
      value={props.value || ''}
      onChange={(e) => props.onChange?.(e.target.value)}
      onBlur={props.onBlur}
      disabled={props.disabled}
      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        props.error && props.error.length > 0 ? 'border-red-500' : 'border-gray-300'
      }`}
    />
    {props.error && props.error.length > 0 && (
      <div className="mt-1">
        {props.error.map((err, idx) => (
          <p key={idx} className="text-sm text-red-600">
            {err.message}
          </p>
        ))}
      </div>
    )}
  </div>
);

// Simple button component
const SubmitButton: React.FC<ComponentRenderProps<{ children?: React.ReactNode }>> = (props) => (
  <button
    type="submit"
    onClick={props.onChange}
    disabled={props.disabled}
    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
  >
    {props.props.children || props.children || 'Submit'}
  </button>
);

// Setup RilayKit factory
const factory = ril
  .create()
  .addComponent('text', {
    name: 'Text Input',
    renderer: TextInput as ComponentRenderer<{ label: string; type?: string }>,
  })
  .configure({
    submitButtonRenderer: (props) => (
      <button
        type="submit"
        onClick={props.onSubmit}
        disabled={props.isSubmitting}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {props.isSubmitting ? 'Submitting...' : props.children || 'Submit'}
      </button>
    ),
  });

export default function ValidationDemo() {
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Demo 1: Built-in RilayKit validators (now Standard Schema)
  const builtInValidatorsForm = form
    .create(factory, 'builtin-demo')
    .add({
      id: 'name',
      type: 'text',
      props: { label: 'Name' },
      validation: {
        validate: required('Name is required'),
        validateOnChange: true,
      },
    })
    .add({
      id: 'email',
      type: 'text',
      props: { label: 'Email', type: 'email' },
      validation: {
        validate: [required('Email is required'), email('Please enter a valid email')],
        validateOnBlur: true,
      },
    });

  // Demo 2: Direct Zod usage (Standard Schema)
  const zodForm = form
    .create(factory, 'zod-demo')
    .add({
      id: 'username',
      type: 'text',
      props: { label: 'Username' },
      validation: {
        validate: z
          .string()
          .min(3, 'Username must be at least 3 characters')
          .max(20, 'Username must be less than 20 characters')
          .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
        validateOnChange: true,
      },
    })
    .add({
      id: 'age',
      type: 'text',
      props: { label: 'Age' },
      validation: {
        validate: z
          .string()
          .min(1, 'Age is required')
          .refine((val) => {
            const num = Number.parseInt(val);
            return !isNaN(num) && num >= 13 && num <= 120;
          }, 'Age must be between 13 and 120'),
      },
    });

  // Demo 3: Mixed RilayKit + Zod validators
  const mixedForm = form
    .create(factory, 'mixed-demo')
    .add({
      id: 'email',
      type: 'text',
      props: { label: 'Email', type: 'email' },
      validation: {
        validate: [
          required('Email is required'), // RilayKit built-in
          z
            .string()
            .email('Invalid email format'), // Zod validator
          z
            .string()
            .min(5, 'Email too short'), // Another Zod validator
        ],
        validateOnBlur: true,
        debounceMs: 300,
      },
    })
    .add({
      id: 'bio',
      type: 'text',
      props: { label: 'Bio' },
      validation: {
        validate: [
          required('Bio is required'), // RilayKit
          minLength(10, 'Bio must be at least 10 chars'), // RilayKit
          z
            .string()
            .max(500, 'Bio too long'), // Zod
        ],
      },
    });

  // Demo 4: Async validation with Zod
  const asyncForm = form.create(factory, 'async-demo').add({
    id: 'username',
    type: 'text',
    props: { label: 'Username (try "admin" or "taken")' },
    validation: {
      validate: z
        .string()
        .min(3, 'Username too short')
        .refine(async (username) => {
          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return !['admin', 'taken', 'reserved'].includes(username.toLowerCase());
        }, 'Username is not available'),
      validateOnBlur: true,
      debounceMs: 500,
    },
  });

  const handleSubmit = (formData: any, formName: string) => {
    console.log(`${formName} submitted:`, formData);
    setSubmittedData({ formName, data: formData });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">
        🚀 RilayKit Unified Validation API Demo
      </h1>

      <div className="mb-8 p-6 bg-green-50 border border-green-200 rounded-lg">
        <h2 className="text-xl font-semibold text-green-800 mb-4">
          ✅ Migration Complete: Standard Schema Everywhere!
        </h2>
        <p className="text-green-700 mb-4">
          RilayKit now uses Standard Schema exclusively for all validation. This means:
        </p>
        <ul className="list-disc list-inside text-green-700 space-y-2">
          <li>
            <strong>One unified API:</strong> Use <code>validate</code> property for everything
          </li>
          <li>
            <strong>Universal compatibility:</strong> Works with Zod, Yup, Joi, and any Standard
            Schema library
          </li>
          <li>
            <strong>No more adapters:</strong> Use validation libraries directly
          </li>
          <li>
            <strong>Better performance:</strong> No adapter overhead
          </li>
          <li>
            <strong>Simpler architecture:</strong> One validation system instead of two
          </li>
        </ul>
      </div>

      {submittedData && (
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">✅ Form Submitted!</h3>
          <p className="text-blue-700 mb-2">Form: {submittedData.formName}</p>
          <pre className="text-sm bg-blue-100 p-3 rounded">
            {JSON.stringify(submittedData.data, null, 2)}
          </pre>
          <button
            onClick={() => setSubmittedData(null)}
            className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm"
          >
            Clear
          </button>
        </div>
      )}

      <div className="grid gap-8">
        {/* Demo 1: Built-in validators */}
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">1. RilayKit Built-in Validators</h2>
          <p className="text-gray-600 mb-4">
            Using RilayKit's built-in validators that now implement Standard Schema.
          </p>
          <Form
            formConfig={builtInValidatorsForm}
            onSubmit={(data) => handleSubmit(data, 'Built-in Validators')}
          >
            <FormField fieldId="name" />
            <FormField fieldId="email" />
            <FormSubmitButton>Submit Built-in Demo</FormSubmitButton>
          </Form>
        </div>

        {/* Demo 2: Direct Zod */}
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">2. Direct Zod Usage</h2>
          <p className="text-gray-600 mb-4">
            Using Zod schemas directly without any adapters. Zod 3.24.0+ implements Standard Schema
            natively.
          </p>
          <Form formConfig={zodForm} onSubmit={(data) => handleSubmit(data, 'Direct Zod')}>
            <FormField fieldId="username" />
            <FormField fieldId="age" />
            <FormSubmitButton>Submit Zod Demo</FormSubmitButton>
          </Form>
        </div>

        {/* Demo 3: Mixed validators */}
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">3. Mixed RilayKit + Zod Validators</h2>
          <p className="text-gray-600 mb-4">
            Combining RilayKit built-in validators with Zod schemas in the same field configuration.
          </p>
          <Form formConfig={mixedForm} onSubmit={(data) => handleSubmit(data, 'Mixed Validators')}>
            <FormField fieldId="email" />
            <FormField fieldId="bio" />
            <FormSubmitButton>Submit Mixed Demo</FormSubmitButton>
          </Form>
        </div>

        {/* Demo 4: Async validation */}
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">4. Async Validation</h2>
          <p className="text-gray-600 mb-4">
            Demonstrating asynchronous validation with debouncing. Try "admin", "taken", or
            "reserved" to see validation errors.
          </p>
          <Form formConfig={asyncForm} onSubmit={(data) => handleSubmit(data, 'Async Validation')}>
            <FormField fieldId="username" />
            <FormSubmitButton>Submit Async Demo</FormSubmitButton>
          </Form>
        </div>
      </div>

      <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
        <h3 className="text-xl font-semibold text-purple-800 mb-4">
          🎯 Key Benefits of the New API
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-purple-700 mb-2">Before (confusing):</h4>
            <div className="bg-red-100 p-3 rounded text-sm">
              <code>{`validation: {
  validators: [required()],  // ❌ One way
  schema: z.string().email() // ❌ Another way
}`}</code>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-purple-700 mb-2">After (unified):</h4>
            <div className="bg-green-100 p-3 rounded text-sm">
              <code>{`validation: {
  validate: [required(), z.string().email()] // ✅ One way!
}`}</code>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="font-semibold text-purple-700 mb-3">✨ What's possible now:</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white p-3 rounded border">
              <strong>🎯 Single API</strong>
              <br />
              One <code>validate</code> property for everything
            </div>
            <div className="bg-white p-3 rounded border">
              <strong>🔗 Universal</strong>
              <br />
              Works with any Standard Schema library
            </div>
            <div className="bg-white p-3 rounded border">
              <strong>⚡ Fast</strong>
              <br />
              No adapter overhead
            </div>
            <div className="bg-white p-3 rounded border">
              <strong>🧩 Composable</strong>
              <br />
              Mix different validation libraries
            </div>
            <div className="bg-white p-3 rounded border">
              <strong>🔮 Future-proof</strong>
              <br />
              Aligned with ecosystem standards
            </div>
            <div className="bg-white p-3 rounded border">
              <strong>💡 Intuitive</strong>
              <br />
              No more choosing between validators vs schema
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
