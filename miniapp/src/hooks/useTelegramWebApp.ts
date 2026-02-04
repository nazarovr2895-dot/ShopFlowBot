import { useEffect, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';

let telegramWebAppInitialized = false;

function initTelegramWebAppOnce() {
  if (telegramWebAppInitialized) return;
  telegramWebAppInitialized = true;
  WebApp.ready();
  WebApp.expand();
  WebApp.setHeaderColor('secondary_bg_color');
  WebApp.enableClosingConfirmation();
}

export function useTelegramWebApp() {
  useEffect(() => {
    initTelegramWebAppOnce();
  }, []);

  const openShop = useCallback((sellerId: number) => {
    // Open shop in main bot via deep link
    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'FlowShopBot';
    const deepLink = `https://t.me/${botUsername}?start=seller_${sellerId}`;
    
    // Close Mini App and open deep link
    WebApp.openTelegramLink(deepLink);
    WebApp.close();
  }, []);

  const showAlert = useCallback((message: string) => {
    WebApp.showAlert(message);
  }, []);

  const showConfirm = useCallback((message: string, callback: (confirmed: boolean) => void) => {
    WebApp.showConfirm(message, callback);
  }, []);

  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    WebApp.HapticFeedback.impactOccurred(type);
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
  }, []);

  const hideMainButton = useCallback(() => {
    WebApp.MainButton.hide();
  }, []);

  const setBackButton = useCallback((visible: boolean, onClick?: () => void) => {
    if (visible && onClick) {
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(onClick);
    } else {
      WebApp.BackButton.hide();
    }
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
  };
}
