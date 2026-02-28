import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { isTelegram, getTelegramInitData } from '@shared/utils/environment';
import { telegramAdminAuth } from '../api/adminClient';

const ADMIN_TOKEN_KEY = 'admin_token';

interface AdminAuthContextType {
  isAuthenticated: boolean;
  telegramAuthLoading: boolean;
  telegramAuthError: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return !!sessionStorage.getItem(ADMIN_TOKEN_KEY);
  });
  const [telegramAuthLoading, setTelegramAuthLoading] = useState(() => isTelegram() && !sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);

  const login = useCallback((token: string) => {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthenticated(false);
  }, []);

  // Auto-authenticate via Telegram
  useEffect(() => {
    if (!isTelegram()) return;
    if (isAuthenticated) { setTelegramAuthLoading(false); return; }

    const initData = getTelegramInitData();
    if (!initData) { setTelegramAuthLoading(false); return; }

    telegramAdminAuth(initData)
      .then(({ token, role }) => {
        if (role !== 'admin') {
          throw new Error('Доступ только для администратора платформы');
        }
        login(token);
      })
      .catch((err) => {
        console.error('[TG Auth] Failed:', err);
        setTelegramAuthError(err instanceof Error ? err.message : 'Ошибка авторизации');
      })
      .finally(() => setTelegramAuthLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, telegramAuthLoading, telegramAuthError, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
