import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarCtx {
  extras: ReactNode;
  setExtras: (n: ReactNode) => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
}

const Ctx = createContext<SidebarCtx | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [extras, setExtras] = useState<ReactNode>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Ctx.Provider value={{ extras, setExtras, mobileOpen, setMobileOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

/** Hook for pages to inject content below the main "Navegación" sidebar section. */
export function useSidebarExtras(node: ReactNode, deps: any[] = []) {
  const { setExtras } = useSidebar();
  useEffect(() => {
    setExtras(node);
    return () => setExtras(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
