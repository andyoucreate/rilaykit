import type { ComponentRenderProps, ComponentRenderer } from '@rilaykit/core';
import { ril } from '@rilaykit/core';

// Define component prop interfaces
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

// Simple components for testing
const TextInput: ComponentRenderer<TextInputProps> = (
  props: ComponentRenderProps<TextInputProps>
) => (
  <div>
    <label htmlFor={props.id}>{props.props.label}</label>
    <input id={props.id} type="text" placeholder={props.props.placeholder} />
  </div>
);

const EmailInput: ComponentRenderer<EmailInputProps> = (
  props: ComponentRenderProps<EmailInputProps>
) => (
  <div>
    <label htmlFor={props.id}>{props.props.label}</label>
    <input id={props.id} type="email" placeholder={props.props.placeholder} />
  </div>
);

export default function FormTestPage() {
  // Test the typing system
  const factory = ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: TextInput,
      defaultProps: { label: 'Default Text', placeholder: 'Enter text...' },
    })
    .addComponent('email', {
      name: 'Email Input',
      renderer: EmailInput,
      defaultProps: { label: 'Default Email', placeholder: 'Enter email...' },
    });

  // This should have autocompletion
  const testForm = factory.form('test-form').add({
    id: 'userEmail',
    type: 'text',
    props: {
      label: 'Email Address',
      placeholder: 'Enter your email',
      required: true,
    },
  });

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">🧪 Typing Test</h1>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-green-800 mb-2">✅ Test du système de typage</h2>
        <p className="text-green-700">
          Dans VS Code, testez l'autocomplétion en éditant le code ci-dessus :
        </p>
        <ul className="list-disc list-inside mt-2 text-green-700">
          <li>
            Le champ <code>type</code> devrait proposer 'text' | 'email'
          </li>
          <li>
            Le champ <code>props</code> devrait proposer les bonnes propriétés selon le type
          </li>
          <li>Pour 'text': label, placeholder?, required?</li>
          <li>Pour 'email': label, placeholder?, required?</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-yellow-800 mb-2">🔧 Debug Info</h2>
        <pre className="text-sm text-yellow-700">
          {`Form stats: ${JSON.stringify(testForm.getStats(), null, 2)}`}
        </pre>
      </div>
    </div>
  );
}
