import { useEffect, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { isTelegram } from '../utils/environment';

let initialized = false;

function initOnce() {
  if (initialized) return;
  initialized = true;
  if (!isTelegram()) return;
  try {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor('#0f172a');
    if (typeof WebApp.disableVerticalSwipes === 'function') {
      WebApp.disableVerticalSwipes();
    }

    // Request fullscreen if available (Telegram Bot API 8.0+)
    if (typeof (WebApp as any).requestFullscreen === 'function') {
      try {
        (WebApp as any).requestFullscreen();
      } catch {
        // Not supported or denied — no problem
      }
    }

    // Apply safe-area offset for Telegram header
    applyTelegramSafeArea();
  } catch (e) {
    console.warn('[AdminTG] Init failed:', e);
  }
}

/**
 * Add a CSS class and variable to body so the layout respects
 * the Telegram header / status-bar area in fullscreen mode.
 */
function applyTelegramSafeArea() {
  const body = document.body;
  body.classList.add('tg-fullscreen');

  // Telegram provides these CSS variables in newer clients:
  //   --tg-viewport-stable-height
  //   --tg-content-safe-area-inset-top (Bot API 8.0+)
  //   --tg-safe-area-inset-top (Bot API 8.0+)
  // We read them and set our own --tg-header-offset for the CSS.

  const update = () => {
    const root = document.documentElement;

    // Try Telegram 8.0+ content safe area
    const tgContentTop = getComputedStyle(root).getPropertyValue('--tg-content-safe-area-inset-top')?.trim();
    const tgSafeTop = getComputedStyle(root).getPropertyValue('--tg-safe-area-inset-top')?.trim();

    let offset = 0;

    if (tgContentTop && parseInt(tgContentTop) > 0) {
      // Bot API 8.0+: use content safe area (below Telegram header)
      offset = parseInt(tgContentTop);
    } else if (tgSafeTop && parseInt(tgSafeTop) > 0) {
      offset = parseInt(tgSafeTop);
    }

    // Set the offset CSS variable on body
    body.style.setProperty('--tg-header-offset', `${offset}px`);
  };

  // Run immediately and on viewport change
  update();

  // Listen for viewport changes (Telegram resizes when keyboard opens, etc.)
  if (typeof WebApp.onEvent === 'function') {
    WebApp.onEvent('viewportChanged', update);
  }

  // Also update after a short delay (Telegram may set CSS vars async)
  setTimeout(update, 300);
  setTimeout(update, 1000);
}

export function useTelegramWebApp() {
  useEffect(() => {
    initOnce();
  }, []);

  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    try {
      WebApp.HapticFeedback?.impactOccurred(type);
    } catch {
      // ignore
    }
  }, []);

  const showAlert = useCallback((message: string) => {
    try {
      if (typeof WebApp.showAlert === 'function' && isTelegram()) {
        WebApp.showAlert(message);
      } else {
        alert(message);
      }
    } catch {
      alert(message);
    }
  }, []);

  const showConfirm = useCallback((message: string, callback: (confirmed: boolean) => void) => {
    try {
      if (typeof WebApp.showConfirm === 'function' && isTelegram()) {
        WebApp.showConfirm(message, callback);
      } else {
        callback(window.confirm(message));
      }
    } catch {
      callback(window.confirm(message));
    }
  }, []);

  return { webApp: WebApp, hapticFeedback, showAlert, showConfirm };
}
