/**
 * Environment detection utilities for Telegram Mini App vs Browser
 */

/**
 * Check if the app is running inside Telegram
 * @returns true if Telegram WebApp initData is available
 */
export function isTelegram(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    
    // Check for Telegram WebApp SDK
    const webApp = (window as any).Telegram?.WebApp;
    if (!webApp) return false;
    
    // Check if initData exists and is not empty
    const initData = webApp.initData;
    return initData != null && initData.length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * Check if the app is running in a regular browser
 * @returns true if not in Telegram
 */
export function isBrowser(): boolean {
  return !isTelegram();
}

/**
 * Safely get Telegram WebApp initData
 * @returns initData string or null if not available
 */
export function getTelegramInitData(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    
    const webApp = (window as any).Telegram?.WebApp;
    if (!webApp) return null;
    
    const initData = webApp.initData;
    return initData && initData.length > 0 ? initData : null;
  } catch (e) {
    return null;
  }
}

/**
 * Get Telegram WebApp instance (if available)
 * @returns Telegram WebApp instance or null
 */
export function getTelegramWebApp(): any | null {
  try {
    if (typeof window === 'undefined') return null;
    return (window as any).Telegram?.WebApp || null;
  } catch (e) {
    return null;
  }
}
