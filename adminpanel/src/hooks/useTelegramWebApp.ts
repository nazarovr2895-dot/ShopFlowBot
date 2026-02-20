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

  const update = () => {
    const wa = WebApp as any;
    let offset = 0;

    // 1. Try JS API (Bot API 7.10+ / 8.0+)
    const safeTop = wa.safeAreaInset?.top ?? 0;
    const contentTop = wa.contentSafeAreaInset?.top ?? 0;
    if (safeTop > 0 || contentTop > 0) {
      offset = safeTop + contentTop;
    }

    // 2. Fallback: try CSS variables
    if (offset === 0) {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const tgContentTop = parseInt(style.getPropertyValue('--tg-content-safe-area-inset-top')) || 0;
      const tgSafeTop = parseInt(style.getPropertyValue('--tg-safe-area-inset-top')) || 0;
      if (tgContentTop > 0 || tgSafeTop > 0) {
        offset = tgContentTop + tgSafeTop;
      }
    }

    // 3. Fallback for Android: compare viewportStableHeight to window height
    if (offset === 0 && wa.viewportStableHeight && wa.viewportStableHeight < window.innerHeight) {
      const delta = window.innerHeight - wa.viewportStableHeight;
      if (delta > 10 && delta < 200) {
        offset = delta;
      }
    }

    body.style.setProperty('--tg-header-offset', `${offset}px`);
  };

  update();
  if (typeof WebApp.onEvent === 'function') {
    WebApp.onEvent('viewportChanged', update);
    try {
      WebApp.onEvent('fullscreenChanged' as any, update);
      WebApp.onEvent('safeAreaChanged' as any, update);
      WebApp.onEvent('contentSafeAreaChanged' as any, update);
    } catch { /* events not supported */ }
  }
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
