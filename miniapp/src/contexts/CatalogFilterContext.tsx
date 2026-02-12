import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type OpenFilterFn = (() => void) | null;

interface CatalogFilterContextValue {
  registerOpenFilter: (fn: OpenFilterFn) => void;
  openFilter: () => void;
}

const CatalogFilterContext = createContext<CatalogFilterContextValue | null>(null);

export function CatalogFilterProvider({ children }: { children: ReactNode }) {
  const openFilterRef = useRef<OpenFilterFn>(null);
  const [, setTick] = useState(0);

  const registerOpenFilter = useCallback((fn: OpenFilterFn) => {
    openFilterRef.current = fn;
    setTick((t) => t + 1);
  }, []);

  const openFilter = useCallback(() => {
    openFilterRef.current?.();
  }, []);

  return (
    <CatalogFilterContext.Provider value={{ registerOpenFilter, openFilter }}>
      {children}
    </CatalogFilterContext.Provider>
  );
}

export function useCatalogFilter(): CatalogFilterContextValue {
  const ctx = useContext(CatalogFilterContext);
  if (!ctx) {
    return {
      registerOpenFilter: () => {},
      openFilter: () => {},
    };
  }
  return ctx;
}
