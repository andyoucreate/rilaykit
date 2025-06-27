import Link from 'next/link';

export default function WorkflowTestPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-primary hover:text-blue-600 text-sm font-medium">
          ← Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-800 mb-4">🔀 Workflow Test</h1>

      <p className="text-gray-600 mb-8">
        This page tests the features of the{' '}
        <code className="bg-gray-100 px-2 py-1 rounded text-sm">@rilay/workflow</code> package.
      </p>

      <div className="bg-white p-8 border border-gray-200 rounded-lg shadow-sm">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🚧</div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Workflow Test Coming Soon</h2>
          <p className="text-gray-600 mb-6">
            The workflow component test will be implemented once we verify the core APIs are working
            correctly.
          </p>
          <div className="flex justify-center">
            <Link href="/form-test" className="btn-primary">
              Try Form Test Instead
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">🔧 Features to be tested:</h3>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Multi-step workflow navigation
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Step validation and progress tracking
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Dynamic step generation
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Data persistence between steps
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Analytics and performance tracking
          </li>
          <li className="flex items-start">
            <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
            Custom hooks and permissions
          </li>
        </ul>
      </div>
    </div>
  );
}
