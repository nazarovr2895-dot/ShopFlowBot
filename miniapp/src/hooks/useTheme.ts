import { useEffect, useState } from 'react';
import { useTelegramWebApp } from './useTelegramWebApp';
import { isTelegram } from '../utils/environment';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'flowshop-theme';

/**
 * Hook for managing theme (light/dark) with support for:
 * - System preference (prefers-color-scheme)
 * - Telegram colorScheme
 * - User preference stored in localStorage
 */
export function useTheme() {
  const { colorScheme } = useTelegramWebApp();
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    // Check Telegram theme if in Telegram
    if (isTelegram() && colorScheme) {
      return colorScheme === 'dark' ? 'dark' : 'light';
    }

    // Check system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    return 'light';
  });

  useEffect(() => {
    // Apply theme to document
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    
    // Update meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
    }
  }, [theme]);

  useEffect(() => {
    // Listen to Telegram theme changes
    if (isTelegram() && colorScheme) {
      const newTheme = colorScheme === 'dark' ? 'dark' : 'light';
      setTheme(newTheme);
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
  }, [colorScheme]);

  useEffect(() => {
    // Listen to system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        // Only use system preference if no user preference is stored
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          setTheme(e.matches ? 'dark' : 'light');
        }
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

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  };

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
