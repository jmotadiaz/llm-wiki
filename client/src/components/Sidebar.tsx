import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useSidebar } from './SidebarContext';

const NAV_ITEMS = [
  { to: '/', label: 'Wiki Index', icon: 'list' as const, exact: true },
  { to: '/learning-paths', label: 'Learning Paths', icon: 'book' as const },
  { to: '/ingest', label: 'Ingest', icon: 'upload' as const },
  { to: '/chat', label: 'Chat', icon: 'msg' as const },
  { to: '/graph', label: 'Knowledge Graph', icon: 'graph' as const },
  { to: '/dashboard', label: 'Dashboard', icon: 'dash' as const },
];

export default function Sidebar() {
  const { extras, mobileOpen, setMobileOpen } = useSidebar();
  const location = useLocation();
  const closeOnMobile = () => setMobileOpen(false);

  const onWikiIndex = location.pathname === '/' || location.pathname.startsWith('/wiki/');

  const navContent = (
    <>
      <div className="mb-7">
        <div className="mono-label px-2.5 mb-2">Navegación</div>
        <nav className="flex flex-col gap-px">
          {NAV_ITEMS.map(item => {
            const isActive = item.exact
              ? onWikiIndex
              : location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={closeOnMobile}
                className={() => 'sb-link' + (isActive ? ' active' : '')}
              >
                <Icon name={item.icon} size={14} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {extras && <div className="mb-7">{extras}</div>}
    </>
  );

  return (
    <>
      {/* Desktop sidebar — column inside the shell grid */}
      <aside className="hidden md:block border-r border-line py-9 pr-6 sticky top-topbar self-start max-h-[calc(100vh-64px)] overflow-y-auto">
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/55 z-[70] backdrop-blur-sm"
          onClick={closeOnMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={[
          'md:hidden fixed top-0 left-0 bottom-0 w-[min(86vw,320px)]',
          'bg-bg border-r border-line-strong z-[80] overflow-y-auto pt-4 pb-8 px-3',
          'transition-transform duration-200 ease-out shadow-2xl',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="font-extrabold text-base tracking-tight text-fg">LLM Wiki</span>
          <button
            type="button"
            className="icon-btn-bare"
            aria-label="Cerrar"
            onClick={closeOnMobile}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {navContent}
      </aside>
    </>
  );
}
