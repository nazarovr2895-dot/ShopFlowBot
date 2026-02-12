import { useState, useEffect } from 'react';
import { isDesktopLayout as checkDesktopLayout } from '../utils/environment';

/**
 * Returns whether desktop layout should be used. Updates on window resize.
 */
export function useDesktopLayout(): boolean {
  const [desktop, setDesktop] = useState(() => checkDesktopLayout());

  useEffect(() => {
    const update = () => setDesktop(checkDesktopLayout());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return desktop;
}
