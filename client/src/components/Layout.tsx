import { Outlet, Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">LLM Wiki</h1>
            <ThemeToggle />
          </div>
          <nav className="flex gap-6 flex-wrap">
            <Link to="/" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">
              Wiki
            </Link>
            <Link to="/ingest" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">
              Ingest
            </Link>
            <Link to="/chat" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">
              Chat
            </Link>
            <Link to="/graph" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">
              Graph
            </Link>
            <Link to="/dashboard" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600 dark:text-gray-400">
          <p>LLM Wiki — Personal knowledge base powered by AI</p>
        </div>
      </footer>
    </div>
  );
}
