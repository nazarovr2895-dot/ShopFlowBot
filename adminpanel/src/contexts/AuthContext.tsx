import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const ADMIN_TOKEN_KEY = 'admin_token';
const SELLER_TOKEN_KEY = 'seller_token';
const AUTH_ROLE_KEY = 'auth_role';
const SELLER_ID_KEY = 'seller_id';

export type AuthRole = 'admin' | 'seller' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  role: AuthRole;
  sellerId: number | null;
  login: (params: { token: string; role: AuthRole; sellerId?: number }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getInitialAuth() {
  if (typeof sessionStorage === 'undefined') return { isAuth: false, role: null as AuthRole, sellerId: null as number | null };
  const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const sellerToken = sessionStorage.getItem(SELLER_TOKEN_KEY);
  const storedRole = sessionStorage.getItem(AUTH_ROLE_KEY) as AuthRole | '';
  const storedSellerId = sessionStorage.getItem(SELLER_ID_KEY);
  const hasAuth = !!(adminToken || sellerToken);
  const role = storedRole === 'admin' || storedRole === 'seller' ? storedRole : null;
  const sellerId = storedSellerId ? parseInt(storedSellerId, 10) : null;
  return { isAuth: hasAuth, role, sellerId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = getInitialAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(initial.isAuth);
  const [role, setRole] = useState<AuthRole>(initial.role);
  const [sellerId, setSellerId] = useState<number | null>(initial.sellerId);

  const login = useCallback((params: { token: string; role: AuthRole; sellerId?: number }) => {
    if (params.role === 'admin') {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, params.token);
      sessionStorage.removeItem(SELLER_TOKEN_KEY);
      sessionStorage.removeItem(SELLER_ID_KEY);
    } else if (params.role === 'seller') {
      sessionStorage.setItem(SELLER_TOKEN_KEY, params.token);
      if (params.sellerId != null) {
        sessionStorage.setItem(SELLER_ID_KEY, String(params.sellerId));
      }
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    sessionStorage.setItem(AUTH_ROLE_KEY, params.role ?? '');
    setIsAuthenticated(true);
    setRole(params.role);
    setSellerId(params.sellerId ?? null);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(SELLER_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_ROLE_KEY);
    sessionStorage.removeItem(SELLER_ID_KEY);
    setIsAuthenticated(false);
    setRole(null);
    setSellerId(null);
  }, []);

  useEffect(() => {
    const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const sellerToken = sessionStorage.getItem(SELLER_TOKEN_KEY);
    const storedRole = sessionStorage.getItem(AUTH_ROLE_KEY) as AuthRole | '';
    const storedSellerId = sessionStorage.getItem(SELLER_ID_KEY);
    const hasAuth = !!(adminToken || sellerToken);
    setIsAuthenticated(hasAuth);
    setRole(storedRole === 'admin' || storedRole === 'seller' ? storedRole : null);
    setSellerId(storedSellerId ? parseInt(storedSellerId, 10) : null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, sellerId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
