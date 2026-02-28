import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { isTelegram, getTelegramInitData } from '../utils/environment';
import { telegramAdminAuth } from '../api/adminClient';
import { switchBranch as switchBranchApi, type BranchInfo } from '../api/sellerClient';

const ADMIN_TOKEN_KEY = 'admin_token';
const SELLER_TOKEN_KEY = 'seller_token';
const AUTH_ROLE_KEY = 'auth_role';
const SELLER_ID_KEY = 'seller_id';
const BRANCHES_KEY = 'branches';
const IS_PRIMARY_KEY = 'is_primary';
const MAX_BRANCHES_KEY = 'max_branches';

export type AuthRole = 'admin' | 'seller' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  role: AuthRole;
  sellerId: number | null;
  branches: BranchInfo[];
  isNetwork: boolean;
  isNetworkOwner: boolean;
  isPrimary: boolean;
  maxBranches: number | null;
  telegramAuthLoading: boolean;
  telegramAuthError: string | null;
  login: (params: { token: string; role: AuthRole; sellerId?: number; branches?: BranchInfo[]; isPrimary?: boolean; maxBranches?: number | null }) => void;
  logout: () => void;
  switchBranch: (sellerId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getStoredBranches(): BranchInfo[] {
  try {
    const raw = sessionStorage.getItem(BRANCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function getInitialAuth() {
  if (typeof sessionStorage === 'undefined') return { isAuth: false, role: null as AuthRole, sellerId: null as number | null, branches: [] as BranchInfo[], isPrimary: true, maxBranches: null as number | null };
  const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const sellerToken = sessionStorage.getItem(SELLER_TOKEN_KEY);
  const storedRole = sessionStorage.getItem(AUTH_ROLE_KEY) as AuthRole | '';
  const storedSellerId = sessionStorage.getItem(SELLER_ID_KEY);
  const hasAuth = !!(adminToken || sellerToken);
  const role = storedRole === 'admin' || storedRole === 'seller' ? storedRole : null;
  const sellerId = storedSellerId ? parseInt(storedSellerId, 10) : null;
  const branches = getStoredBranches();
  const isPrimary = sessionStorage.getItem(IS_PRIMARY_KEY) !== 'false';
  const storedMaxBranches = sessionStorage.getItem(MAX_BRANCHES_KEY);
  const maxBranches = storedMaxBranches != null ? parseInt(storedMaxBranches, 10) : null;
  return { isAuth: hasAuth, role, sellerId, branches, isPrimary, maxBranches: maxBranches != null && !isNaN(maxBranches) ? maxBranches : null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = getInitialAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(initial.isAuth);
  const [role, setRole] = useState<AuthRole>(initial.role);
  const [sellerId, setSellerId] = useState<number | null>(initial.sellerId);
  const [branches, setBranches] = useState<BranchInfo[]>(initial.branches);
  const [isPrimary, setIsPrimary] = useState(initial.isPrimary);
  const [maxBranches, setMaxBranches] = useState<number | null>(initial.maxBranches);
  const [telegramAuthLoading, setTelegramAuthLoading] = useState(() => isTelegram() && !initial.isAuth);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);

  const isNetwork = maxBranches != null && maxBranches > 0;
  const isNetworkOwner = isPrimary && isNetwork;

  const login = useCallback((params: { token: string; role: AuthRole; sellerId?: number; branches?: BranchInfo[]; isPrimary?: boolean; maxBranches?: number | null }) => {
    if (params.role === 'admin') {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, params.token);
      sessionStorage.removeItem(SELLER_TOKEN_KEY);
      sessionStorage.removeItem(SELLER_ID_KEY);
      sessionStorage.removeItem(BRANCHES_KEY);
      sessionStorage.removeItem(IS_PRIMARY_KEY);
      sessionStorage.removeItem(MAX_BRANCHES_KEY);
    } else if (params.role === 'seller') {
      sessionStorage.setItem(SELLER_TOKEN_KEY, params.token);
      if (params.sellerId != null) {
        sessionStorage.setItem(SELLER_ID_KEY, String(params.sellerId));
      }
      if (params.branches) {
        sessionStorage.setItem(BRANCHES_KEY, JSON.stringify(params.branches));
      }
      sessionStorage.setItem(IS_PRIMARY_KEY, String(params.isPrimary ?? true));
      if (params.maxBranches != null) {
        sessionStorage.setItem(MAX_BRANCHES_KEY, String(params.maxBranches));
      } else {
        sessionStorage.removeItem(MAX_BRANCHES_KEY);
      }
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    sessionStorage.setItem(AUTH_ROLE_KEY, params.role ?? '');
    setIsAuthenticated(true);
    setRole(params.role);
    setSellerId(params.sellerId ?? null);
    setBranches(params.branches ?? []);
    setIsPrimary(params.isPrimary ?? true);
    setMaxBranches(params.maxBranches ?? null);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(SELLER_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_ROLE_KEY);
    sessionStorage.removeItem(SELLER_ID_KEY);
    sessionStorage.removeItem(BRANCHES_KEY);
    sessionStorage.removeItem(IS_PRIMARY_KEY);
    sessionStorage.removeItem(MAX_BRANCHES_KEY);
    setIsAuthenticated(false);
    setRole(null);
    setSellerId(null);
    setBranches([]);
    setIsPrimary(true);
    setMaxBranches(null);
  }, []);

  const switchBranch = useCallback(async (targetSellerId: number) => {
    const result = await switchBranchApi(targetSellerId);
    sessionStorage.setItem(SELLER_TOKEN_KEY, result.token);
    sessionStorage.setItem(SELLER_ID_KEY, String(result.seller_id));
    if (result.branches) {
      sessionStorage.setItem(BRANCHES_KEY, JSON.stringify(result.branches));
      setBranches(result.branches);
    }
    setSellerId(result.seller_id);
    // Reload page to refresh all data for the new branch
    window.location.reload();
  }, []);

  // Auto-authenticate via Telegram initData when running inside Telegram
  useEffect(() => {
    if (!isTelegram()) return;

    // Already authenticated from sessionStorage
    if (isAuthenticated) {
      setTelegramAuthLoading(false);
      return;
    }

    const initData = getTelegramInitData();
    if (!initData) {
      setTelegramAuthLoading(false);
      return;
    }

    telegramAdminAuth(initData)
      .then(({ token, role: authRole, seller_id, branches: authBranches }) => {
        login({ token, role: authRole, sellerId: seller_id, branches: authBranches, isPrimary: true });
      })
      .catch((err) => {
        console.error('[TG Auth] Failed:', err);
        setTelegramAuthError(err instanceof Error ? err.message : 'Ошибка авторизации');
      })
      .finally(() => {
        setTelegramAuthLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from sessionStorage on mount (browser reload)
  useEffect(() => {
    if (isTelegram()) return; // Telegram auth is handled above
    const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const sellerToken = sessionStorage.getItem(SELLER_TOKEN_KEY);
    const storedRole = sessionStorage.getItem(AUTH_ROLE_KEY) as AuthRole | '';
    const storedSellerId = sessionStorage.getItem(SELLER_ID_KEY);
    const hasAuth = !!(adminToken || sellerToken);
    setIsAuthenticated(hasAuth);
    setRole(storedRole === 'admin' || storedRole === 'seller' ? storedRole : null);
    setSellerId(storedSellerId ? parseInt(storedSellerId, 10) : null);
    setBranches(getStoredBranches());
    setIsPrimary(sessionStorage.getItem(IS_PRIMARY_KEY) !== 'false');
    const storedMb = sessionStorage.getItem(MAX_BRANCHES_KEY);
    setMaxBranches(storedMb != null ? parseInt(storedMb, 10) : null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, sellerId, branches, isNetwork, isNetworkOwner, isPrimary, maxBranches, telegramAuthLoading, telegramAuthError, login, logout, switchBranch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
