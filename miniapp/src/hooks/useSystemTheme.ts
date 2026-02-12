import { useEffect, useState } from 'react';

type SystemTheme = 'light' | 'dark';

/**
 * Hook for getting system theme (prefers-color-scheme) only.
 * Does not depend on app theme settings (localStorage, Telegram).
 * Returns 'light' or 'dark' based on system preferences.
 */
export function useSystemTheme(): SystemTheme {
  const [systemTheme, setSystemTheme] = useState<SystemTheme>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setSystemTheme(e.matches ? 'dark' : 'light');
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, []);

  return systemTheme;
}
