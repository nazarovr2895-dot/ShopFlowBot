import { useState, useEffect, useCallback } from 'react';
import './Toast.css';

// --- Global toast bridge (callable from non-React code like hooks) ---

let globalShowToast: ((msg: string) => void) | null = null;

/**
 * Show a toast notification from anywhere (including useTelegramWebApp hook).
 * Falls back to console.log if ToastProvider is not yet mounted.
 */
export function showBrowserToast(msg: string) {
  if (globalShowToast) {
    globalShowToast(msg);
  } else {
    // Provider not mounted yet — shouldn't happen in practice
    console.log('[Toast]', msg);
  }
}

// --- ToastProvider component ---

interface ToastItem {
  id: number;
  message: string;
}

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  // Register global bridge
  useEffect(() => {
    globalShowToast = showToast;
    return () => {
      globalShowToast = null;
    };
  }, [showToast]);

  return (
    <>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
