import type { Seller, SellerStats, AgentStats, Agent, City, District, MetroStation } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return sessionStorage.getItem('admin_token');
}

async function fetchAdmin<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['X-Admin-Token'] = token;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Cities, districts, metro
export async function getCities(): Promise<City[]> {
  return fetchAdmin<City[]>('/admin/cities');
}

export async function getDistricts(cityId: number): Promise<District[]> {
  return fetchAdmin<District[]>(`/admin/districts/${cityId}`);
}

export async function searchMetro(query: string): Promise<MetroStation[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query.trim() });
  const url = `${API_BASE}/public/metro/search?${params}`;
  const res = await fetch(url);
  return res.ok ? res.json() : [];
}

// Sellers
export async function createSeller(data: Record<string, unknown>): Promise<{ status?: string }> {
  return fetchAdmin('/admin/create_seller', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function searchSellers(fio: string, includeDeleted = false): Promise<Seller[]> {
  const params = new URLSearchParams({ fio });
  if (includeDeleted) params.set('include_deleted', 'true');
  return fetchAdmin<Seller[]>(`/admin/sellers/search?${params}`);
}

export async function getAllSellers(includeDeleted = false): Promise<Seller[]> {
  const params = includeDeleted ? '?include_deleted=true' : '';
  return fetchAdmin<Seller[]>(`/admin/sellers/all${params}`);
}

export async function updateSellerField(
  tgId: number,
  field: string,
  value: string
): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/update`, {
    method: 'PUT',
    body: JSON.stringify({ field, value }),
  });
}

export async function blockSeller(tgId: number, isBlocked: boolean): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/block?is_blocked=${isBlocked}`, {
    method: 'PUT',
  });
}

export async function softDeleteSeller(tgId: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/soft-delete`, { method: 'PUT' });
}

export async function restoreSeller(tgId: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/restore`, { method: 'PUT' });
}

export async function deleteSeller(tgId: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}`, { method: 'DELETE' });
}

export async function setSellerLimit(tgId: number, maxOrders: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/set_limit?max_orders=${maxOrders}`, {
    method: 'PUT',
  });
}

// Stats
export type StatsDateRange = { date_from?: string; date_to?: string };

export async function getAllStats(params?: StatsDateRange): Promise<SellerStats[]> {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchAdmin<SellerStats[]>(`/admin/stats/all${q}`);
}

export async function getSellerStats(fio: string): Promise<SellerStats | null> {
  try {
    return await fetchAdmin<SellerStats>(`/admin/stats/seller?fio=${encodeURIComponent(fio)}`);
  } catch {
    return null;
  }
}

export async function getAgentsStats(): Promise<AgentStats[]> {
  return fetchAdmin<AgentStats[]>('/admin/stats/agents');
}

// Agents
export async function getAllAgents(): Promise<Agent[]> {
  return fetchAdmin<Agent[]>('/admin/agents/all');
}

export async function searchAgents(query: string): Promise<Agent[]> {
  const params = new URLSearchParams({ query });
  return fetchAdmin<Agent[]>(`/admin/agents/search?${params}`);
}

export async function getAgentDetails(tgId: number): Promise<Agent | { status: string }> {
  return fetchAdmin(`/admin/agents/${tgId}`);
}

export async function removeAgentStatus(tgId: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/agents/${tgId}/remove`, { method: 'PUT' });
}

export async function setAgentBalance(tgId: number, newBalance: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/agents/${tgId}/set_balance?new_balance=${newBalance}`, {
    method: 'PUT',
  });
}

export async function getAgentReferrals(tgId: number): Promise<unknown[]> {
  try {
    const data = await fetchAdmin<{ status?: string } | unknown[]>(
      `/admin/agents/${tgId}/referrals`
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const LOGIN_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = LOGIN_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (e) {
    if (e instanceof Error) {
      if (e.name === 'AbortError') {
        throw new Error('Сервер не отвечает. Проверьте, что бэкенд запущен на http://localhost:8000');
      }
      throw new Error(e.message || 'Ошибка сети');
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

// Admin login
export async function login(login: string, password: string): Promise<{ token: string }> {
  const url = `${API_BASE}/admin/login`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Seller login (for web panel)
export async function sellerLogin(login: string, password: string): Promise<{ token: string; seller_id: number }> {
  const url = `${API_BASE}/seller-web/login`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getSellerWebCredentials(tgId: number): Promise<{ web_login: string | null; web_password: string | null }> {
  return fetchAdmin<{ web_login: string | null; web_password: string | null }>(`/admin/sellers/${tgId}/web_credentials`);
}

export async function setSellerWebCredentials(tgId: number): Promise<{ web_login: string; web_password: string }> {
  return fetchAdmin<{ web_login: string; web_password: string }>(`/admin/sellers/${tgId}/set_web_credentials`, {
    method: 'POST',
  });
}

// Auth check (verify token works)
export async function checkAuth(): Promise<boolean> {
  try {
    await fetchAdmin('/admin/stats/all');
    return true;
  } catch {
    return false;
  }
}
