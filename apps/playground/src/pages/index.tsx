import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">🚀 Streamline Playground</h1>

      <p className="text-lg text-gray-600 mb-8">
        Welcome to the test playground for the Streamline library!
      </p>

      <div className="flex gap-4 flex-wrap mb-12">
        <Link href="/form-test" className="btn-primary inline-block text-decoration-none">
          📝 Test Form Builder
        </Link>

        <Link href="/workflow-test" className="btn-secondary inline-block text-decoration-none">
          🔀 Test Workflow
        </Link>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">📦 Packages being tested:</h2>
        <ul className="space-y-2">
          <li className="flex items-center">
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
            <code className="bg-gray-100 px-2 py-1 rounded text-sm">@rilaykit/core</code>
          </li>
          <li className="flex items-center">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-3" />
            <code className="bg-gray-100 px-2 py-1 rounded text-sm">@rilaykit/forms</code>
          </li>
          <li className="flex items-center">
            <span className="w-2 h-2 bg-purple-500 rounded-full mr-3" />
            <code className="bg-gray-100 px-2 py-1 rounded text-sm">@rilaykit/workflow</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
