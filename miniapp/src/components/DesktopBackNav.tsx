import { useNavigate } from 'react-router-dom';
import { useDesktopShell } from '../contexts/DesktopShellContext';
import './DesktopBackNav.css';

interface DesktopBackNavProps {
  title?: string;
}

/**
 * Back navigation bar for standalone pages on desktop browser.
 * Shows a "← Назад" link + optional page title.
 * Only renders when DesktopShell is active.
 */
export function DesktopBackNav({ title }: DesktopBackNavProps) {
  const { shellActive } = useDesktopShell();
  const navigate = useNavigate();

  if (!shellActive) return null;

  return (
    <div className="desktop-back-nav">
      <div className="desktop-back-nav__inner">
        <button className="desktop-back-nav__back" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Назад</span>
        </button>
        {title && <span className="desktop-back-nav__title">{title}</span>}
      </div>
    </div>
  );
}
