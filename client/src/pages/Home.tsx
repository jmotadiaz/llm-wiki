export default function Home() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Welcome to LLM Wiki</h2>
      <p className="text-gray-600 dark:text-gray-400">
        A personal knowledge base that compiles raw sources into a cross-referenced wiki using LLM intelligence.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-2">Ingest</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Upload files or fetch URLs to add sources</p>
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-2">Wiki</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Browse compiled wiki pages</p>
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h3 className="font-semibold mb-2">Chat</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Query your wiki with natural language</p>
        </div>
      </div>
    </div>
  );
}
