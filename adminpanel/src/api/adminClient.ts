import type {
  Seller, SellerStats, City, District, MetroStation,
  AdminDashboardData, AdminOrdersResponse, AdminCustomersResponse, AdminFinanceResponse,
} from '../types';

// Runtime API URL (set from config.json) takes priority over build-time env var
let runtimeApiUrl: string | null = null;

export function setAdminApiBaseUrl(url: string): void {
  runtimeApiUrl = url;
}

function getApiBase(): string {
  return runtimeApiUrl ?? (import.meta.env.VITE_API_URL || '');
}

function getToken(): string | null {
  return sessionStorage.getItem('admin_token');
}

async function fetchAdmin<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getApiBase()}${endpoint}`;
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
  const url = `${getApiBase()}/public/metro/search?${params}`;
  const res = await fetch(url);
  return res.ok ? res.json() : [];
}

export interface InnData {
  inn: string;
  kpp?: string;
  ogrn?: string;
  name: string;
  short_name?: string;
  type: string;
  address: string;
  management?: string;
  state: {
    status: string;
    actuality_date?: number;
  };
  okved?: string;
  okveds?: string[];
  okved_type?: string;
  registration_date?: string;
  okved_match?: {
    matches_47_76: boolean;
    matches_47_91: boolean;
    main_okved: string;
  };
}

export async function getInnData(inn: string): Promise<InnData> {
  return fetchAdmin<InnData>(`/admin/inn/${encodeURIComponent(inn)}`);
}

export async function getOrgData(identifier: string): Promise<InnData> {
  return fetchAdmin<InnData>(`/admin/org/${encodeURIComponent(identifier)}`);
}

// Address suggest & coverage check
export interface AddressSuggestion {
  value: string;
  city_district: string | null;
  lat: string | null;
  lon: string | null;
  city: string | null;
}

export interface CoverageCheckResult {
  covered: boolean;
  district_id: number | null;
  district_name: string | null;
}

export async function suggestAddress(query: string, cityKladrId?: string): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (cityKladrId) params.set('city_kladr_id', cityKladrId);
  return fetchAdmin<AddressSuggestion[]>(`/admin/address/suggest?${params}`);
}

export async function checkAddressCoverage(address: string, cityId: number): Promise<CoverageCheckResult> {
  const params = new URLSearchParams({ address, city_id: String(cityId) });
  return fetchAdmin<CoverageCheckResult>(`/admin/address/check-coverage?${params}`);
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

export async function getSellerBranches(ownerId: number): Promise<import('../types').AdminBranchInfo[]> {
  return fetchAdmin(`/admin/sellers/${ownerId}/branches`);
}

export async function getFinanceBranchBreakdown(
  ownerId: number,
  params?: { date_from?: string; date_to?: string }
): Promise<import('../types').FinanceBranchRow[]> {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const q = sp.toString() ? `?${sp}` : '';
  return fetchAdmin(`/admin/finance/seller/${ownerId}/branches${q}`);
}

export async function setSellerLimit(tgId: number, maxOrders: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/set_limit?max_orders=${maxOrders}`, {
    method: 'PUT',
  });
}

export async function setSellerSubscriptionPlan(tgId: number, plan: string): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/subscription_plan?plan=${plan}`, {
    method: 'PUT',
  });
}

export async function setSellerDefaultLimit(tgId: number, defaultDailyLimit: number): Promise<{ status?: string }> {
  return fetchAdmin(`/admin/sellers/${tgId}/default_limit?default_daily_limit=${defaultDailyLimit}`, {
    method: 'PUT',
  });
}

// Stats
export type StatsDateRange = { date_from?: string; date_to?: string };

export interface StatsOverviewDailyPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface StatsOverview {
  daily_sales: StatsOverviewDailyPoint[];
}

export async function getAllStats(params?: StatsDateRange): Promise<SellerStats[]> {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchAdmin<SellerStats[]>(`/admin/stats/all${q}`);
}

export async function getStatsOverview(params?: StatsDateRange): Promise<StatsOverview> {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchAdmin<StatsOverview>(`/admin/stats/overview${q}`);
}

export interface LimitsAnalyticsItem {
  seller_id: number;
  fio: string;
  shop_name: string;
  used: number;
  limit: number;
  load_pct: number;
  plan: string;
}

export interface LimitsAnalytics {
  total_sellers: number;
  active_today: number;
  exhausted: number;
  closed_today: number;
  no_limit: number;
  avg_load_pct: number;
  by_plan: Record<string, { total: number; active: number; exhausted: number }>;
  top_loaded: LimitsAnalyticsItem[];
}

export async function getLimitsAnalytics(): Promise<LimitsAnalytics> {
  return fetchAdmin<LimitsAnalytics>('/admin/stats/limits');
}

export async function getSellerStats(fio: string): Promise<SellerStats | null> {
  try {
    return await fetchAdmin<SellerStats>(`/admin/stats/seller?fio=${encodeURIComponent(fio)}`);
  } catch {
    return null;
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
  const url = `${getApiBase()}/admin/login`;
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
export async function sellerLogin(login: string, password: string): Promise<{
  token: string;
  seller_id: number;
  owner_id: number;
  is_primary: boolean;
  branches: Array<{ seller_id: number; shop_name: string | null; address_name: string | null }>;
}> {
  const url = `${getApiBase()}/seller-web/login`;
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

// ── Dashboard ──
export async function getAdminDashboard(): Promise<AdminDashboardData> {
  return fetchAdmin<AdminDashboardData>('/admin/dashboard');
}

// ── Orders ──
export interface AdminOrdersParams {
  status?: string;
  seller_id?: number;
  date_from?: string;
  date_to?: string;
  delivery_type?: string;
  is_preorder?: boolean;
  page?: number;
  per_page?: number;
}

export async function getAdminOrders(params?: AdminOrdersParams): Promise<AdminOrdersResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.seller_id) sp.set('seller_id', String(params.seller_id));
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.delivery_type) sp.set('delivery_type', params.delivery_type);
  if (params?.is_preorder !== undefined) sp.set('is_preorder', String(params.is_preorder));
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchAdmin<AdminOrdersResponse>(`/admin/orders${q}`);
}

// ── Customers ──
export interface AdminCustomersParams {
  city_id?: number;
  min_orders?: number;
  page?: number;
  per_page?: number;
}

export async function getAdminCustomers(params?: AdminCustomersParams): Promise<AdminCustomersResponse> {
  const sp = new URLSearchParams();
  if (params?.city_id) sp.set('city_id', String(params.city_id));
  if (params?.min_orders) sp.set('min_orders', String(params.min_orders));
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchAdmin<AdminCustomersResponse>(`/admin/customers${q}`);
}

// ── Finance ──
export interface AdminFinanceParams {
  date_from?: string;
  date_to?: string;
  group_by?: 'day' | 'week' | 'month';
}

export async function getFinanceSummary(params?: AdminFinanceParams): Promise<AdminFinanceResponse> {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.group_by) sp.set('group_by', params.group_by);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchAdmin<AdminFinanceResponse>(`/admin/finance/summary${q}`);
}

// ── Commission settings ──
export async function getGlobalCommission(): Promise<{ commission_percent: number }> {
  return fetchAdmin<{ commission_percent: number }>('/admin/settings/commission');
}

export async function updateGlobalCommission(commissionPercent: number): Promise<{ status: string; commission_percent: number }> {
  return fetchAdmin('/admin/settings/commission', {
    method: 'PUT',
    body: JSON.stringify({ commission_percent: commissionPercent }),
  });
}

// ── Telegram Mini App Auth ──
export async function telegramAdminAuth(initData: string): Promise<{
  token: string;
  role: 'admin' | 'seller';
  seller_id?: number;
  owner_id?: number;
  branches?: Array<{ seller_id: number; shop_name: string | null; address_name: string | null }>;
}> {
  const url = `${getApiBase()}/admin/auth/telegram`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Coverage Areas (Cities, Districts, Metro) ──

export interface CoverageCity {
  id: number;
  name: string;
  kladr_id: string | null;
  districts_count: number;
  metro_count: number;
  sellers_count: number;
}

export interface CoverageDistrict {
  id: number;
  name: string;
  city_id: number;
  metro_count: number;
  sellers_count: number;
}

export interface CoverageMetro {
  id: number;
  name: string;
  district_id: number | null;
  city_id: number | null;
  line_color: string | null;
  line_name: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
}

export interface DaDataCitySuggestion {
  name: string;
  kladr_id: string;
  region: string | null;
}

export interface MetroImportResult {
  imported: number;
  skipped: number;
  unmapped: number;
  details: Array<{
    name: string;
    status: string;
    line_name: string | null;
    line_color: string | null;
    district_id: number | null;
  }>;
  message?: string;
}

// Cities
export async function getCoverageCities(): Promise<CoverageCity[]> {
  return fetchAdmin<CoverageCity[]>('/admin/coverage/cities');
}

export async function createCoverageCity(data: { name: string; kladr_id?: string }): Promise<CoverageCity> {
  return fetchAdmin<CoverageCity>('/admin/coverage/cities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCoverageCity(cityId: number, data: { name?: string; kladr_id?: string }): Promise<CoverageCity> {
  return fetchAdmin<CoverageCity>(`/admin/coverage/cities/${cityId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCoverageCity(cityId: number): Promise<{ status: string }> {
  return fetchAdmin<{ status: string }>(`/admin/coverage/cities/${cityId}`, { method: 'DELETE' });
}

// Districts
export async function getCoverageDistricts(cityId: number): Promise<CoverageDistrict[]> {
  return fetchAdmin<CoverageDistrict[]>(`/admin/coverage/cities/${cityId}/districts`);
}

export async function createCoverageDistrict(cityId: number, data: { name: string }): Promise<CoverageDistrict> {
  return fetchAdmin<CoverageDistrict>(`/admin/coverage/cities/${cityId}/districts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCoverageDistrict(districtId: number, data: { name: string }): Promise<CoverageDistrict> {
  return fetchAdmin<CoverageDistrict>(`/admin/coverage/districts/${districtId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCoverageDistrict(districtId: number): Promise<{ status: string }> {
  return fetchAdmin<{ status: string }>(`/admin/coverage/districts/${districtId}`, { method: 'DELETE' });
}

// Metro
export async function getCoverageMetroByCity(cityId: number): Promise<CoverageMetro[]> {
  return fetchAdmin<CoverageMetro[]>(`/admin/coverage/cities/${cityId}/metro`);
}

export async function getCoverageMetroByDistrict(districtId: number): Promise<CoverageMetro[]> {
  return fetchAdmin<CoverageMetro[]>(`/admin/coverage/districts/${districtId}/metro`);
}

export async function createCoverageMetro(districtId: number, data: {
  name: string;
  line_color?: string;
  line_name?: string;
}): Promise<CoverageMetro> {
  return fetchAdmin<CoverageMetro>(`/admin/coverage/districts/${districtId}/metro`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCoverageMetro(metroId: number, data: {
  name?: string;
  district_id?: number;
  line_color?: string;
  line_name?: string;
}): Promise<CoverageMetro> {
  return fetchAdmin<CoverageMetro>(`/admin/coverage/metro/${metroId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCoverageMetro(metroId: number): Promise<{ status: string }> {
  return fetchAdmin<{ status: string }>(`/admin/coverage/metro/${metroId}`, { method: 'DELETE' });
}

// DaData integration
export async function suggestCityDadata(query: string): Promise<DaDataCitySuggestion[]> {
  const params = new URLSearchParams({ q: query.trim() });
  return fetchAdmin<DaDataCitySuggestion[]>(`/admin/coverage/dadata/suggest-city?${params}`);
}

export async function suggestDistrictDadata(query: string, cityKladrId: string): Promise<string[]> {
  const params = new URLSearchParams({ q: query.trim(), city_kladr_id: cityKladrId });
  return fetchAdmin<string[]>(`/admin/coverage/dadata/suggest-district?${params}`);
}

export async function importMetroFromDadata(cityId: number): Promise<MetroImportResult> {
  return fetchAdmin<MetroImportResult>(`/admin/coverage/cities/${cityId}/import-metro`, {
    method: 'POST',
  });
}

export async function remapMetroDistricts(cityId: number): Promise<{ remapped: number; still_unmapped: number }> {
  return fetchAdmin<{ remapped: number; still_unmapped: number }>(`/admin/coverage/cities/${cityId}/remap-metro`, {
    method: 'POST',
  });
}
