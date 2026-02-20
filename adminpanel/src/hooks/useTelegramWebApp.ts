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
  } catch (e) {
    console.warn('[AdminTG] Init failed:', e);
  }
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
