import type { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { isTelegram } from '../utils/environment';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { DesktopShellContext } from '../contexts/DesktopShellContext';
import './DesktopShell.css';

interface DesktopShellProps {
  children: ReactNode;
}

/**
 * Wraps the entire app on desktop browser to provide persistent TopNav
 * on all pages (including standalone pages like ProductDetail, Checkout, etc.).
 * On mobile or Telegram, renders children as-is.
 */
export function DesktopShell({ children }: DesktopShellProps) {
  const isDesktop = useDesktopLayout();
  const isTelegramEnv = isTelegram();

  // Only activate shell on desktop browser (not Telegram)
  const shellActive = isDesktop && !isTelegramEnv;

  return (
    <DesktopShellContext.Provider value={{ shellActive }}>
      {shellActive && (
        <TopNav />
      )}
      <div className={shellActive ? 'desktop-shell__content' : ''}>
        {children}
      </div>
    </DesktopShellContext.Provider>
  );
}
