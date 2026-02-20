import { useEffect, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { isTelegram } from '../utils/environment';
import { showBrowserToast } from '../components/Toast';

let telegramWebAppInitialized = false;

function initTelegramWebAppOnce() {
  if (telegramWebAppInitialized) return;
  telegramWebAppInitialized = true;

  // Only initialize if in Telegram
  if (isTelegram()) {
    try {
      WebApp.ready();
      WebApp.expand();
      WebApp.setHeaderColor('secondary_bg_color');
      WebApp.enableClosingConfirmation();
      if (typeof WebApp.disableVerticalSwipes === 'function') {
        WebApp.disableVerticalSwipes();
      }

      // Request fullscreen if available (Telegram Bot API 8.0+)
      if (typeof (WebApp as any).requestFullscreen === 'function') {
        try {
          (WebApp as any).requestFullscreen();
        } catch {
          // Not supported or denied
        }
      }

      // Apply safe-area offset for Telegram header in fullscreen
      applyTelegramSafeArea();
    } catch (e) {
      console.warn('[useTelegramWebApp] Failed to initialize Telegram WebApp:', e);
    }
  }
}

/**
 * Read Telegram CSS safe-area variables and set --tg-content-safe-area
 * so the layout can account for the Telegram header in fullscreen mode.
 */
function applyTelegramSafeArea() {
  const body = document.body;
  body.classList.add('tg-fullscreen');

  const update = () => {
    const root = document.documentElement;
    const tgContentTop = getComputedStyle(root).getPropertyValue('--tg-content-safe-area-inset-top')?.trim();
    const tgSafeTop = getComputedStyle(root).getPropertyValue('--tg-safe-area-inset-top')?.trim();

    let offset = 0;
    if (tgContentTop && parseInt(tgContentTop) > 0) {
      offset = parseInt(tgContentTop);
    } else if (tgSafeTop && parseInt(tgSafeTop) > 0) {
      offset = parseInt(tgSafeTop);
    }

    body.style.setProperty('--tg-header-offset', `${offset}px`);
  };

  update();
  if (typeof WebApp.onEvent === 'function') {
    WebApp.onEvent('viewportChanged', update);
  }
  setTimeout(update, 300);
  setTimeout(update, 1000);
}

export function useTelegramWebApp() {
  useEffect(() => {
    initTelegramWebAppOnce();
  }, []);

  const openShop = useCallback((sellerId: number) => {
    // Open shop in main bot via deep link
    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'flurai_bot';
    const deepLink = `https://t.me/${botUsername}?start=seller_${sellerId}`;
    
    if (isTelegram()) {
      try {
        // Close Mini App and open deep link
        WebApp.openTelegramLink(deepLink);
        WebApp.close();
      } catch (e) {
        console.warn('[useTelegramWebApp] Failed to open Telegram link:', e);
        // Fallback: open in new window
        window.open(deepLink, '_blank');
      }
    } else {
      // In browser, just open the link
      window.open(deepLink, '_blank');
    }
  }, []);

  const showAlert = useCallback((message: string) => {
    try {
      if (typeof WebApp.showAlert === 'function' && isTelegram()) {
        WebApp.showAlert(message);
      } else {
        showBrowserToast(message);
      }
    } catch {
      showBrowserToast(message);
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

  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    try {
      if (WebApp.HapticFeedback?.impactOccurred) {
        WebApp.HapticFeedback.impactOccurred(type);
      }
    } catch {
      // ignore when not supported (e.g. outside Telegram)
    }
  }, []);

  const setMainButton = useCallback((
    text: string,
    onClick: () => void,
    options?: {
      color?: string;
      textColor?: string;
      isActive?: boolean;
      isVisible?: boolean;
    }
  ) => {
    // Only work in Telegram
    if (!isTelegram() || !WebApp.MainButton) return;
    
    try {
      WebApp.MainButton.setText(text);
      WebApp.MainButton.onClick(onClick);
      
      if (options?.color) WebApp.MainButton.setParams({ color: options.color });
      if (options?.textColor) WebApp.MainButton.setParams({ text_color: options.textColor });
      if (options?.isActive !== undefined) {
        options.isActive ? WebApp.MainButton.enable() : WebApp.MainButton.disable();
      }
      if (options?.isVisible !== undefined) {
        options.isVisible ? WebApp.MainButton.show() : WebApp.MainButton.hide();
      }
    } catch (e) {
      console.warn('[useTelegramWebApp] Failed to set MainButton:', e);
    }
  }, []);

  const hideMainButton = useCallback(() => {
    if (!isTelegram() || !WebApp.MainButton) return;
    try {
      WebApp.MainButton.hide();
    } catch (e) {
      console.warn('[useTelegramWebApp] Failed to hide MainButton:', e);
    }
  }, []);

  const setBackButton = useCallback((visible: boolean, onClick?: () => void) => {
    if (!isTelegram() || !WebApp.BackButton) return;
    
    try {
      if (visible && onClick) {
        WebApp.BackButton.show();
        WebApp.BackButton.onClick(onClick);
      } else {
        WebApp.BackButton.hide();
      }
    } catch (e) {
      console.warn('[useTelegramWebApp] Failed to set BackButton:', e);
    }
  }, []);

  const requestContact = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        if (typeof WebApp.requestContact === 'function') {
          WebApp.requestContact((contact: any) => {
            resolve(contact?.phone_number || null);
          });
        } else {
          // Fallback if requestContact is not available
          resolve(null);
        }
      } catch (error) {
        console.error('Error requesting contact:', error);
        resolve(null);
      }
    });
  }, []);

  return {
    webApp: WebApp,
    user: WebApp.initDataUnsafe.user,
    themeParams: WebApp.themeParams,
    colorScheme: WebApp.colorScheme,
    openShop,
    showAlert,
    showConfirm,
    hapticFeedback,
    setMainButton,
    hideMainButton,
    setBackButton,
    requestContact,
  };
}
