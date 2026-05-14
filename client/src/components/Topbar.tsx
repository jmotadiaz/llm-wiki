import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useTheme } from './ThemeContext';
import { useSidebar } from './SidebarContext';

export default function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <header className="topbar">
      <div className="max-w-shell mx-auto h-topbar flex items-center gap-3 md:gap-4 px-4 md:px-8">
        {/* Mobile-only sidebar toggle, LEFT of brand */}
        <button
          type="button"
          className="icon-btn lg:hidden"
          aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <Icon name={mobileOpen ? 'close' : 'sidebar'} size={18} />
        </button>

        <Link to="/" className="brand flex items-center gap-2.5 text-fg font-extrabold text-base tracking-tight">
          <span>LLM Wiki</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="icon-btn-bare"
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
