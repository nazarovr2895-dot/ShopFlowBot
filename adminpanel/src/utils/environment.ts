/**
 * Environment detection utilities for Telegram Mini App vs Browser.
 * Adapted from miniapp/src/utils/environment.ts for the admin panel.
 */

/**
 * Check if the app is running inside Telegram.
 */
export function isTelegram(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const webApp = (window as any).Telegram?.WebApp;
    if (!webApp) return false;
    const initData = webApp.initData;
    return initData != null && initData.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if the app is running in a regular browser.
 */
export function isBrowser(): boolean {
  return !isTelegram();
}

/**
 * Safely get Telegram WebApp initData string.
 */
export function getTelegramInitData(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const webApp = (window as any).Telegram?.WebApp;
    if (!webApp) return null;
    const initData = webApp.initData;
    return initData && initData.length > 0 ? initData : null;
  } catch {
    return null;
  }
}

/**
 * Get Telegram WebApp instance (if available).
 */
export function getTelegramWebApp(): any | null {
  try {
    if (typeof window === 'undefined') return null;
    return (window as any).Telegram?.WebApp || null;
  } catch {
    return null;
  }
}
