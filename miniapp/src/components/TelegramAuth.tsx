import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { isBrowser } from '../utils/environment';
import './TelegramAuth.css';

interface TelegramAuthProps {
  botName?: string;
  onAuthSuccess?: () => void;
  onAuthError?: (error: string) => void;
}

/**
 * Telegram Widget Authentication Component
 *
 * Displays Telegram Login Widget for browser authentication.
 * Uses official Telegram Widget API: https://core.telegram.org/widgets/login
 */
export function TelegramAuth({
  botName,
  onAuthSuccess,
  onAuthError
}: TelegramAuthProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get bot name from env or prop
  const actualBotName = botName || import.meta.env.VITE_BOT_USERNAME || 'flurai_bot';

  // Stable callback ref to avoid re-creating widget on every render
  const onAuthSuccessRef = useRef(onAuthSuccess);
  const onAuthErrorRef = useRef(onAuthError);
  useEffect(() => { onAuthSuccessRef.current = onAuthSuccess; }, [onAuthSuccess]);
  useEffect(() => { onAuthErrorRef.current = onAuthError; }, [onAuthError]);

  useEffect(() => {
    // Only render widget in browser (not in Telegram)
    if (!isBrowser() || !widgetRef.current) {
      return;
    }

    // Set up global callback function (must be on window)
    (window as any).onTelegramAuth = async (user: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      auth_date: number;
      hash: string;
    }) => {
      setLoading(true);
      setError(null);

      try {
        // Authenticate with backend
        await api.authWithWidget({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          photo_url: user.photo_url,
          auth_date: user.auth_date,
          hash: user.hash,
        });

        // Success
        onAuthSuccessRef.current?.();
      } catch (err: any) {
        const errorMessage = err.message || 'Ошибка авторизации';
        setError(errorMessage);
        onAuthErrorRef.current?.(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    const container = widgetRef.current;

    // Clean up: remove old widget content and any previously appended scripts
    container.innerHTML = '';

    // Remove any previously appended Telegram widget scripts from body
    document.querySelectorAll('script[src*="telegram-widget.js"]').forEach(el => el.remove());

    // Create the widget script element (acts as a placeholder for the widget)
    const widgetScript = document.createElement('script');
    widgetScript.async = true;
    widgetScript.src = `https://telegram.org/js/telegram-widget.js?22`;
    widgetScript.setAttribute('data-telegram-login', actualBotName);
    widgetScript.setAttribute('data-size', 'large');
    widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
    widgetScript.setAttribute('data-request-access', 'write');

    widgetScript.onload = () => {
      console.log('[TelegramAuth] Widget loaded, bot:', actualBotName);
    };
    widgetScript.onerror = () => {
      console.error('[TelegramAuth] Failed to load Telegram widget script');
      setError('Не удалось загрузить виджет Telegram');
    };

    container.appendChild(widgetScript);

    return () => {
      container.innerHTML = '';
    };
  }, [actualBotName]);

  // Don't render in Telegram (should use initData instead)
  if (!isBrowser()) {
    return null;
  }

  return (
    <div className="telegram-auth">
      <div ref={widgetRef} className="telegram-auth__widget" />
      {loading && (
        <div className="telegram-auth__loading">
          Авторизация...
        </div>
      )}
      {error && (
        <div className="telegram-auth__error">
          {error}
        </div>
      )}
    </div>
  );
}
