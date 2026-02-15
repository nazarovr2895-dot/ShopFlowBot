const API_BASE = import.meta.env.VITE_API_URL || '';

function getSellerToken(): string | null {
  return sessionStorage.getItem('seller_token');
}

async function fetchSeller<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = getSellerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['X-Seller-Token'] = token;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Full URL for a product photo (photo_id from backend, e.g. /static/uploads/products/...). Returns null for Telegram file_id or other non-static paths. */
export function getProductImageUrl(photoId: string | null | undefined): string | null {
  if (photoId == null || String(photoId).trim() === '') return null;
  const raw = String(photoId).trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (!path.startsWith('/static/')) return null;
  const base = (API_BASE || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export interface SellerMe {
  seller_id: number;
  fio?: string;
  phone?: string;
  shop_name: string;
  hashtags?: string;
  description?: string;
  max_orders: number;
  limit_set_for_today: boolean;
  orders_used_today: number;
  active_orders: number;
  pending_requests: number;
  shop_link: string | null;
  delivery_type?: string;
  delivery_price?: number;
  city_id?: number;
  district_id?: number;
  metro_id?: number;
  metro_walk_minutes?: number;
  map_url?: string;
  placement_expired_at?: string;
  preorder_enabled?: boolean;
  preorder_schedule_type?: string;
  preorder_weekday?: number;
  preorder_interval_days?: number;
  preorder_base_date?: string | null;
  preorder_custom_dates?: string[];
  preorder_available_dates?: string[];
}

export interface SellerOrder {
  id: number;
  buyer_id: number;
  seller_id: number;
  items_info: string;
  total_price: number;
  original_price?: number;
  status: string;
  delivery_type?: string;
  address?: string;
  created_at?: string;
  completed_at?: string;
  is_preorder?: boolean;
  preorder_delivery_date?: string | null;
}

export type SellerStatsPeriod = '1d' | '7d' | '30d' | 'custom';

export interface SellerStatsFilters {
  period?: SellerStatsPeriod | null;
  date_from?: string | null;
  date_to?: string | null;
}

export interface SellerStatsDailyPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface SellerStatsDeliveryBucket {
  orders: number;
  revenue: number;
}

export interface SellerStatsDeliveryBreakdown {
  delivery: SellerStatsDeliveryBucket;
  pickup: SellerStatsDeliveryBucket;
  other: SellerStatsDeliveryBucket;
  unknown: SellerStatsDeliveryBucket;
}

export interface SellerStatsTopProduct {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  order_count: number;
}

export interface SellerStatsTopBouquet {
  bouquet_id: number;
  bouquet_name: string;
  quantity_sold: number;
}

export interface SellerStats {
  total_completed_orders: number;
  total_revenue: number;
  commission_18: number;
  net_revenue: number;
  average_check?: number;
  previous_period_orders?: number;
  previous_period_revenue?: number;
  top_products?: SellerStatsTopProduct[];
  top_bouquets?: SellerStatsTopBouquet[];
  orders_by_status?: Record<string, number>;
  daily_sales?: SellerStatsDailyPoint[];
  delivery_breakdown?: SellerStatsDeliveryBreakdown;
  filters?: SellerStatsFilters;
}

export interface SellerProduct {
  id: number;
  seller_id: number;
  name: string;
  description: string;
  price: number;
  photo_id?: string;
  photo_ids?: string[];
  quantity: number;
  is_active?: boolean;
  is_preorder?: boolean;
}

export async function getMe(): Promise<SellerMe> {
  return fetchSeller<SellerMe>('/seller-web/me');
}

export interface DashboardAlerts {
  low_stock_bouquets: { id: number; name: string; can_assemble_count: number }[];
  expiring_items: { reception_id: number; reception_name: string; flower_name: string; days_left: number; remaining_quantity: number }[];
}

export async function getDashboardAlerts(): Promise<DashboardAlerts> {
  return fetchSeller<DashboardAlerts>('/seller-web/dashboard/alerts');
}

export async function updateMe(payload: {
  hashtags?: string;
  preorder_enabled?: boolean;
  preorder_schedule_type?: string;
  preorder_weekday?: number;
  preorder_interval_days?: number;
  preorder_base_date?: string | null;
  preorder_custom_dates?: string[] | null;
  shop_name?: string;
  description?: string;
  delivery_type?: string;
  delivery_price?: number;
  map_url?: string;
}): Promise<SellerMe> {
  return fetchSeller<SellerMe>('/seller-web/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getOrders(params?: { status?: string; date_from?: string; date_to?: string; preorder?: boolean }): Promise<SellerOrder[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.preorder !== undefined) sp.set('preorder', String(params.preorder));
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchSeller<SellerOrder[]>(`/seller-web/orders${q}`);
}

export interface SellerOrderDetail extends SellerOrder {
  buyer_fio?: string | null;
  buyer_phone?: string | null;
  customer_id?: number | null;
}

export async function getOrder(orderId: number): Promise<SellerOrderDetail> {
  return fetchSeller<SellerOrderDetail>(`/seller-web/orders/${orderId}`);
}

export async function acceptOrder(orderId: number): Promise<unknown> {
  return fetchSeller(`/seller-web/orders/${orderId}/accept`, { method: 'POST' });
}

export async function rejectOrder(orderId: number): Promise<unknown> {
  return fetchSeller(`/seller-web/orders/${orderId}/reject`, { method: 'POST' });
}

export async function updateOrderStatus(orderId: number, status: string): Promise<unknown> {
  return fetchSeller(`/seller-web/orders/${orderId}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' });
}

export async function updateOrderPrice(orderId: number, newPrice: number): Promise<unknown> {
  return fetchSeller(`/seller-web/orders/${orderId}/price?new_price=${newPrice}`, { method: 'PUT' });
}

export async function getStats(params?: { period?: '1d' | '7d' | '30d'; date_from?: string; date_to?: string }): Promise<SellerStats> {
  const sp = new URLSearchParams();
  if (params?.period) sp.set('period', params.period);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const query = sp.toString();
  const suffix = query ? `?${query}` : '';
  return fetchSeller<SellerStats>(`/seller-web/stats${suffix}`);
}

export async function exportStatsCSV(params?: { period?: '1d' | '7d' | '30d'; date_from?: string; date_to?: string }): Promise<Blob> {
  const token = localStorage.getItem(SELLER_TOKEN_KEY);
  if (!token) throw new Error('Не авторизован');

  const sp = new URLSearchParams();
  if (params?.period) sp.set('period', params.period);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const query = sp.toString();
  const suffix = query ? `?${query}` : '';

  const res = await fetch(`${API_BASE_URL}/seller-web/stats/export${suffix}`, {
    headers: {
      'X-Seller-Token': token,
    },
  });
  if (!res.ok) throw new Error('Ошибка экспорта');
  return res.blob();
}

export async function getProducts(params?: { preorder?: boolean }): Promise<SellerProduct[]> {
  const sp = new URLSearchParams();
  if (params?.preorder !== undefined) sp.set('preorder', String(params.preorder));
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchSeller<SellerProduct[]>(`/seller-web/products${q}`);
}

export async function uploadProductPhoto(file: File): Promise<{ photo_id: string }> {
  const API_BASE = import.meta.env.VITE_API_URL || '';
  const token = sessionStorage.getItem('seller_token');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/seller-web/upload-photo`, {
    method: 'POST',
    headers: token ? { 'X-Seller-Token': token } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function createProduct(data: { seller_id: number; name: string; description: string; price: number; photo_id?: string; photo_ids?: string[]; quantity: number; bouquet_id?: number; is_preorder?: boolean }): Promise<SellerProduct> {
  return fetchSeller<SellerProduct>('/seller-web/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProduct(productId: number, data: Partial<{ name: string; description: string; price: number; quantity: number; photo_ids: string[]; is_active: boolean; is_preorder: boolean }>): Promise<SellerProduct> {
  return fetchSeller<SellerProduct>(`/seller-web/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProduct(productId: number): Promise<{ status: string }> {
  return fetchSeller(`/seller-web/products/${productId}`, { method: 'DELETE' });
}

export async function updateLimits(maxOrders: number): Promise<{ status: string }> {
  return fetchSeller(`/seller-web/limits?max_orders=${maxOrders}`, { method: 'PUT' });
}

export async function changeCredentials(data: { old_login: string; old_password: string; new_login: string; new_password: string }): Promise<{ status: string }> {
  return fetchSeller('/seller-web/security/change-credentials', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// --- Loyalty / Customers ---
export interface LoyaltySettings {
  points_percent: number;
}

export interface SellerCustomerBrief {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  card_number: string;
  points_balance: number;
  created_at: string | null;
  notes?: string | null;
  tags?: string | null;
}

export interface LoyaltyTransaction {
  id: number;
  amount: number;
  points_accrued: number;
  order_id: number | null;
  created_at: string | null;
}

export interface SellerCustomerDetail extends SellerCustomerBrief {
  transactions: LoyaltyTransaction[];
  total_purchases?: number;
  last_order_at?: string | null;
  completed_orders_count?: number;
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  return fetchSeller<LoyaltySettings>('/seller-web/loyalty/settings');
}

export async function updateLoyaltySettings(points_percent: number): Promise<LoyaltySettings> {
  return fetchSeller<LoyaltySettings>('/seller-web/loyalty/settings', {
    method: 'PUT',
    body: JSON.stringify({ points_percent }),
  });
}

export async function getCustomers(): Promise<SellerCustomerBrief[]> {
  return fetchSeller<SellerCustomerBrief[]>('/seller-web/customers');
}

export async function createCustomer(data: { phone: string; first_name: string; last_name: string }): Promise<SellerCustomerBrief> {
  return fetchSeller<SellerCustomerBrief>('/seller-web/customers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getCustomer(customerId: number): Promise<SellerCustomerDetail> {
  return fetchSeller<SellerCustomerDetail>(`/seller-web/customers/${customerId}`);
}

export async function recordSale(customerId: number, amount: number): Promise<{ customer_id: number; amount: number; points_accrued: number; new_balance: number }> {
  return fetchSeller(`/seller-web/customers/${customerId}/sales`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function getCustomerOrders(customerId: number): Promise<SellerOrder[]> {
  return fetchSeller<SellerOrder[]>(`/seller-web/customers/${customerId}/orders`);
}

export async function deductPoints(customerId: number, points: number): Promise<{ customer_id: number; points_deducted: number; new_balance: number }> {
  return fetchSeller(`/seller-web/customers/${customerId}/deduct`, {
    method: 'POST',
    body: JSON.stringify({ points }),
  });
}

export async function updateCustomer(customerId: number, data: { notes?: string; tags?: string }): Promise<SellerCustomerBrief> {
  return fetchSeller<SellerCustomerBrief>(`/seller-web/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function exportCustomersCSV(): Promise<Blob> {
  const token = localStorage.getItem(SELLER_TOKEN_KEY);
  if (!token) throw new Error('Не авторизован');

  const res = await fetch(`${API_BASE_URL}/seller-web/customers/export`, {
    headers: {
      'X-Seller-Token': token,
    },
  });
  if (!res.ok) throw new Error('Ошибка экспорта');
  return res.blob();
}

// --- CRM: Flowers ---
export interface Flower {
  id: number;
  name: string;
  default_shelf_life_days: number | null;
}

export async function getFlowers(): Promise<Flower[]> {
  return fetchSeller<Flower[]>('/seller-web/flowers');
}

export async function createFlower(data: { name: string; default_shelf_life_days?: number | null }): Promise<Flower> {
  return fetchSeller<Flower>('/seller-web/flowers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteFlower(flowerId: number): Promise<{ status: string }> {
  return fetchSeller(`/seller-web/flowers/${flowerId}`, { method: 'DELETE' });
}

// --- CRM: Receptions ---
export interface ReceptionBrief {
  id: number;
  name: string;
  reception_date: string | null;
  is_closed?: boolean;
  supplier?: string | null;
  invoice_number?: string | null;
}

export interface ReceptionItemRow {
  id: number;
  flower_id: number;
  flower_name: string;
  quantity_initial: number;
  arrival_date: string | null;
  shelf_life_days: number;
  price_per_unit: number;
  remaining_quantity: number;
  sold_quantity: number;
  sold_amount: number;
  days_left: number | null;
}

export interface ReceptionDetail {
  id: number;
  name: string;
  reception_date: string | null;
  is_closed?: boolean;
  supplier?: string | null;
  invoice_number?: string | null;
  items: ReceptionItemRow[];
}

export async function getReceptions(): Promise<ReceptionBrief[]> {
  return fetchSeller<ReceptionBrief[]>('/seller-web/receptions');
}

export async function createReception(data: { name: string; reception_date?: string | null; supplier?: string | null; invoice_number?: string | null }): Promise<ReceptionBrief> {
  return fetchSeller<ReceptionBrief>('/seller-web/receptions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReception(
  receptionId: number,
  data: { is_closed?: boolean; supplier?: string | null; invoice_number?: string | null }
): Promise<ReceptionBrief> {
  return fetchSeller<ReceptionBrief>(`/seller-web/receptions/${receptionId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getReception(receptionId: number): Promise<ReceptionDetail> {
  return fetchSeller<ReceptionDetail>(`/seller-web/receptions/${receptionId}`);
}

export async function addReceptionItem(
  receptionId: number,
  data: { flower_id: number; quantity_initial: number; arrival_date?: string | null; shelf_life_days: number; price_per_unit: number }
): Promise<ReceptionItemRow> {
  return fetchSeller(`/seller-web/receptions/${receptionId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReceptionItem(
  itemId: number,
  data: Partial<{ remaining_quantity: number; quantity_initial: number; arrival_date: string | null; shelf_life_days: number; price_per_unit: number }>
): Promise<unknown> {
  return fetchSeller(`/seller-web/receptions/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteReceptionItem(itemId: number): Promise<{ status: string }> {
  return fetchSeller(`/seller-web/receptions/items/${itemId}`, { method: 'DELETE' });
}

// --- Inventory ---
export interface InventoryItem {
  id: number;
  flower_id: number;
  flower_name: string;
  remaining_quantity: number;
  price_per_unit: number;
  days_left: number | null;
}

export async function getReceptionInventory(receptionId: number): Promise<{ reception_id: number; items: InventoryItem[] }> {
  return fetchSeller(`/seller-web/receptions/${receptionId}/inventory`);
}

export async function inventoryCheck(
  receptionId: number,
  lines: { reception_item_id: number; actual_quantity: number }[]
): Promise<{ lines: { reception_item_id: number; flower_name: string; system_quantity: number; actual_quantity: number; difference: number; loss_amount: number }[]; total_loss: number }> {
  return fetchSeller(`/seller-web/receptions/${receptionId}/inventory/check`, {
    method: 'POST',
    body: JSON.stringify(lines),
  });
}

export async function inventoryApply(
  receptionId: number,
  lines: { reception_item_id: number; actual_quantity: number }[]
): Promise<{ applied: number }> {
  return fetchSeller(`/seller-web/receptions/${receptionId}/inventory/apply`, {
    method: 'POST',
    body: JSON.stringify(lines),
  });
}

// --- Bouquets ---
export interface BouquetItemDto {
  flower_id: number;
  flower_name: string;
  quantity: number;
  markup_multiplier: number;
}

export interface BouquetDetail {
  id: number;
  name: string;
  packaging_cost: number;
  total_cost: number | null;
  total_price: number | null;
  items: BouquetItemDto[];
  /** Сколько таких букетов можно собрать из текущих остатков в приёмке */
  can_assemble_count?: number;
  /** false = в приёмке не хватает цветов, букет скрыт в mini app */
  is_active?: boolean;
}

export interface FlowerStock {
  flower_id: number;
  flower_name: string;
  remaining_quantity: number;
  avg_price: number;
}

export async function getBouquets(): Promise<BouquetDetail[]> {
  return fetchSeller<BouquetDetail[]>('/seller-web/bouquets');
}

export async function getBouquet(bouquetId: number): Promise<BouquetDetail> {
  return fetchSeller<BouquetDetail>(`/seller-web/bouquets/${bouquetId}`);
}

export async function createBouquet(data: {
  name: string;
  packaging_cost: number;
  items: { flower_id: number; quantity: number; markup_multiplier: number }[];
}): Promise<BouquetDetail> {
  return fetchSeller<BouquetDetail>('/seller-web/bouquets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBouquet(
  bouquetId: number,
  data: {
    name: string;
    packaging_cost: number;
    items: { flower_id: number; quantity: number; markup_multiplier: number }[];
  }
): Promise<BouquetDetail> {
  return fetchSeller<BouquetDetail>(`/seller-web/bouquets/${bouquetId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBouquet(bouquetId: number): Promise<{ status: string }> {
  return fetchSeller(`/seller-web/bouquets/${bouquetId}`, { method: 'DELETE' });
}
