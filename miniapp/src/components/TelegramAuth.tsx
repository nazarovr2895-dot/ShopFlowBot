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
  const actualBotName = botName || import.meta.env.VITE_BOT_USERNAME || 'FlowShopBot_bot';

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
        onAuthSuccess?.();
      } catch (err: any) {
        const errorMessage = err.message || 'Ошибка авторизации';
        setError(errorMessage);
        onAuthError?.(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    // Telegram Widget initialization
    // Using the official Telegram Widget approach
    function initWidget() {
      if (!widgetRef.current) return;

      // Clear previous widget
      widgetRef.current.innerHTML = '';

      // Create the widget script element with all required attributes
      // This must be in DOM BEFORE loading the Telegram widget script
      const widgetScriptId = `telegram-login-${Date.now()}`;
      const widgetScript = document.createElement('script');
      widgetScript.id = widgetScriptId;
      widgetScript.type = 'text/javascript';
      widgetScript.setAttribute('data-telegram-login', actualBotName);
      widgetScript.setAttribute('data-size', 'large');
      widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
      widgetScript.setAttribute('data-request-access', 'write');
      
      // Append to DOM first
      widgetRef.current.appendChild(widgetScript);
      console.log('[TelegramAuth] Widget script tag created, bot:', actualBotName, 'id:', widgetScriptId);

      // Check if Telegram Widget script is already loaded
      let existingScript = document.querySelector('script[src*="telegram-widget.js"]') as HTMLScriptElement;
      
      const loadTelegramScript = () => {
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.async = true;
        script.onload = () => {
          console.log('[TelegramAuth] Telegram widget script loaded successfully');
          // Widget should render automatically
        };
        script.onerror = () => {
          console.error('[TelegramAuth] Failed to load Telegram widget script');
          setError('Не удалось загрузить виджет Telegram');
        };
        document.body.appendChild(script);
      };

      if (!existingScript) {
        // Load Telegram Widget script - it will scan DOM and find our widget script
        loadTelegramScript();
      } else {
        console.log('[TelegramAuth] Telegram widget script already loaded');
        // Script already loaded - widget should detect our script tag automatically
        // But if it doesn't, try to force re-initialization
        // Telegram widget script stores references, so we might need to trigger it
        if ((window as any).Telegram && (window as any).Telegram.Login) {
          console.log('[TelegramAuth] Telegram.Login found, widget should render');
        } else {
          // Force widget to re-scan by temporarily removing and re-adding
          const temp = widgetScript.cloneNode(true) as HTMLScriptElement;
          widgetRef.current.removeChild(widgetScript);
          setTimeout(() => {
            if (widgetRef.current) {
              widgetRef.current.appendChild(temp);
              console.log('[TelegramAuth] Re-added widget script tag');
            }
          }, 200);
        }
      }
    }

    // Initialize widget with a delay to ensure DOM is ready
    const timer = setTimeout(initWidget, 200);
    
    return () => {
      clearTimeout(timer);
      if (widgetRef.current) {
        widgetRef.current.innerHTML = '';
      }
    };
  }, [actualBotName, onAuthSuccess, onAuthError]);

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
