import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { isTelegram, getTelegramInitData } from '@shared/utils/environment';
import { telegramSellerAuth, switchBranch as switchBranchApi, type BranchInfo } from '../api/sellerClient';

const SELLER_TOKEN_KEY = 'seller_token';
const REFRESH_TOKEN_KEY = 'seller_refresh_token';
const SELLER_ID_KEY = 'seller_id';
const BRANCHES_KEY = 'branches';
const IS_PRIMARY_KEY = 'is_primary';
const MAX_BRANCHES_KEY = 'max_branches';

// Migration: move data from sessionStorage to localStorage (one-time)
(() => {
  if (typeof window === 'undefined') return;
  const oldToken = sessionStorage.getItem(SELLER_TOKEN_KEY);
  if (oldToken && !localStorage.getItem(SELLER_TOKEN_KEY)) {
    localStorage.setItem(SELLER_TOKEN_KEY, oldToken);
    const sid = sessionStorage.getItem(SELLER_ID_KEY);
    if (sid) localStorage.setItem(SELLER_ID_KEY, sid);
    const branches = sessionStorage.getItem(BRANCHES_KEY);
    if (branches) localStorage.setItem(BRANCHES_KEY, branches);
    const isPrimary = sessionStorage.getItem(IS_PRIMARY_KEY);
    if (isPrimary) localStorage.setItem(IS_PRIMARY_KEY, isPrimary);
    const maxBranches = sessionStorage.getItem(MAX_BRANCHES_KEY);
    if (maxBranches) localStorage.setItem(MAX_BRANCHES_KEY, maxBranches);
  }
  // Clean up old sessionStorage keys
  sessionStorage.removeItem(SELLER_TOKEN_KEY);
  sessionStorage.removeItem(SELLER_ID_KEY);
  sessionStorage.removeItem(BRANCHES_KEY);
  sessionStorage.removeItem(IS_PRIMARY_KEY);
  sessionStorage.removeItem(MAX_BRANCHES_KEY);
})();

interface SellerAuthContextType {
  isAuthenticated: boolean;
  sellerId: number | null;
  branches: BranchInfo[];
  isNetwork: boolean;
  isNetworkOwner: boolean;
  isPrimary: boolean;
  maxBranches: number | null;
  telegramAuthLoading: boolean;
  telegramAuthError: string | null;
  login: (params: { token: string; refreshToken?: string; sellerId: number; branches?: BranchInfo[]; isPrimary?: boolean; maxBranches?: number | null }) => void;
  logout: () => void;
  switchBranch: (sellerId: number) => Promise<void>;
}

const SellerAuthContext = createContext<SellerAuthContextType | null>(null);

function getStoredBranches(): BranchInfo[] {
  try {
    const raw = localStorage.getItem(BRANCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function getApiBase(): string {
  return (import.meta.env.VITE_API_URL || '') as string;
}

function getInitialAuth() {
  if (typeof localStorage === 'undefined') return { isAuth: false, sellerId: null as number | null, branches: [] as BranchInfo[], isPrimary: true, maxBranches: null as number | null };
  const sellerToken = localStorage.getItem(SELLER_TOKEN_KEY);
  const storedSellerId = localStorage.getItem(SELLER_ID_KEY);
  const hasAuth = !!sellerToken;
  const sellerId = storedSellerId ? parseInt(storedSellerId, 10) : null;
  const branches = getStoredBranches();
  const isPrimary = localStorage.getItem(IS_PRIMARY_KEY) !== 'false';
  const storedMaxBranches = localStorage.getItem(MAX_BRANCHES_KEY);
  const maxBranches = storedMaxBranches != null ? parseInt(storedMaxBranches, 10) : null;
  return { isAuth: hasAuth, sellerId, branches, isPrimary, maxBranches: maxBranches != null && !isNaN(maxBranches) ? maxBranches : null };
}

export function SellerAuthProvider({ children }: { children: ReactNode }) {
  const initial = getInitialAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(initial.isAuth);
  const [sellerId, setSellerId] = useState<number | null>(initial.sellerId);
  const [branches, setBranches] = useState<BranchInfo[]>(initial.branches);
  const [isPrimary, setIsPrimary] = useState(initial.isPrimary);
  const [maxBranches, setMaxBranches] = useState<number | null>(initial.maxBranches);
  const [telegramAuthLoading, setTelegramAuthLoading] = useState(() => isTelegram() && !initial.isAuth);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);

  const isNetwork = maxBranches != null && maxBranches > 0;
  const isNetworkOwner = isPrimary && isNetwork;

  const login = useCallback((params: { token: string; refreshToken?: string; sellerId: number; branches?: BranchInfo[]; isPrimary?: boolean; maxBranches?: number | null }) => {
    localStorage.setItem(SELLER_TOKEN_KEY, params.token);
    if (params.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
    }
    localStorage.setItem(SELLER_ID_KEY, String(params.sellerId));
    if (params.branches) {
      localStorage.setItem(BRANCHES_KEY, JSON.stringify(params.branches));
    }
    localStorage.setItem(IS_PRIMARY_KEY, String(params.isPrimary ?? true));
    if (params.maxBranches != null) {
      localStorage.setItem(MAX_BRANCHES_KEY, String(params.maxBranches));
    } else {
      localStorage.removeItem(MAX_BRANCHES_KEY);
    }
    setIsAuthenticated(true);
    setSellerId(params.sellerId);
    setBranches(params.branches ?? []);
    setIsPrimary(params.isPrimary ?? true);
    setMaxBranches(params.maxBranches ?? null);
  }, []);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      fetch(`${getApiBase()}/seller-web/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem(SELLER_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(SELLER_ID_KEY);
    localStorage.removeItem(BRANCHES_KEY);
    localStorage.removeItem(IS_PRIMARY_KEY);
    localStorage.removeItem(MAX_BRANCHES_KEY);
    setIsAuthenticated(false);
    setSellerId(null);
    setBranches([]);
    setIsPrimary(true);
    setMaxBranches(null);
  }, []);

  const switchBranch = useCallback(async (targetSellerId: number) => {
    const result = await switchBranchApi(targetSellerId);
    localStorage.setItem(SELLER_TOKEN_KEY, result.token);
    if (result.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
    }
    localStorage.setItem(SELLER_ID_KEY, String(result.seller_id));
    if (result.branches) {
      localStorage.setItem(BRANCHES_KEY, JSON.stringify(result.branches));
      setBranches(result.branches);
    }
    setSellerId(result.seller_id);
    window.location.reload();
  }, []);

  // Listen for auth-expired events from the fetch interceptor
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('seller-auth-expired', handler);
    return () => window.removeEventListener('seller-auth-expired', handler);
  }, [logout]);

  // Auto-authenticate via Telegram
  useEffect(() => {
    if (!isTelegram()) return;
    if (isAuthenticated) { setTelegramAuthLoading(false); return; }

    const initData = getTelegramInitData();
    if (!initData) { setTelegramAuthLoading(false); return; }

    telegramSellerAuth(initData)
      .then(({ token, refresh_token, role, seller_id, branches: authBranches, is_primary, max_branches }) => {
        if (role !== 'seller') {
          throw new Error('Этот аккаунт не является продавцом');
        }
        if (!seller_id) {
          throw new Error('Не удалось определить аккаунт продавца');
        }
        login({ token, refreshToken: refresh_token, sellerId: seller_id, branches: authBranches, isPrimary: is_primary ?? true, maxBranches: max_branches ?? null });
      })
      .catch((err) => {
        console.error('[TG Auth] Failed:', err);
        setTelegramAuthError(err instanceof Error ? err.message : 'Ошибка авторизации');
      })
      .finally(() => setTelegramAuthLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from localStorage on mount
  useEffect(() => {
    if (isTelegram()) return;
    const sellerToken = localStorage.getItem(SELLER_TOKEN_KEY);
    const storedSellerId = localStorage.getItem(SELLER_ID_KEY);
    setIsAuthenticated(!!sellerToken);
    setSellerId(storedSellerId ? parseInt(storedSellerId, 10) : null);
    setBranches(getStoredBranches());
    setIsPrimary(localStorage.getItem(IS_PRIMARY_KEY) !== 'false');
    const storedMb = localStorage.getItem(MAX_BRANCHES_KEY);
    setMaxBranches(storedMb != null ? parseInt(storedMb, 10) : null);
  }, []);

  return (
    <SellerAuthContext.Provider value={{ isAuthenticated, sellerId, branches, isNetwork, isNetworkOwner, isPrimary, maxBranches, telegramAuthLoading, telegramAuthError, login, logout, switchBranch }}>
      {children}
    </SellerAuthContext.Provider>
  );
}

export function useSellerAuth() {
  const ctx = useContext(SellerAuthContext);
  if (!ctx) throw new Error('useSellerAuth must be used within SellerAuthProvider');
  return ctx;
}
