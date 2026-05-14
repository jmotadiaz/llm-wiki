import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import { SidebarProvider, useSidebar } from './SidebarContext';

function LayoutInner() {
  const location = useLocation();
  const { setMobileOpen } = useSidebar();

  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Topbar />
      <div className="max-w-shell mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-[theme(spacing.sidebar)_1fr] gap-0 md:gap-10 min-h-[calc(100vh-64px)]">
        <Sidebar />
        <main className="min-w-0 py-6 md:py-10 pb-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <SidebarProvider>
      <LayoutInner />
    </SidebarProvider>
  );
}
