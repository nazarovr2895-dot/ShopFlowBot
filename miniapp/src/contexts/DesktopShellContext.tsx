import { createContext, useContext } from 'react';

/**
 * Context to coordinate between DesktopShell and MainLayout.
 * When DesktopShell is active (desktop browser), MainLayout skips its own TopNav.
 */
interface DesktopShellContextValue {
  shellActive: boolean;
}

export const DesktopShellContext = createContext<DesktopShellContextValue>({ shellActive: false });

export function useDesktopShell() {
  return useContext(DesktopShellContext);
}
