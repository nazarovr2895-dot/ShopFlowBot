// Runtime API URL (set from config.json) takes priority over build-time env var
let runtimeApiUrl: string | null = null;

export function setSellerApiBaseUrl(url: string): void {
  runtimeApiUrl = url;
}

function getApiBase(): string {
  return runtimeApiUrl ?? (import.meta.env.VITE_API_URL || '');
}

function getSellerToken(): string | null {
  return sessionStorage.getItem('seller_token');
}

async function fetchSeller<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${getApiBase()}${endpoint}`;
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
  const base = (getApiBase() || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export interface SellerMe {
  seller_id: number;
  fio?: string;
  phone?: string;
  shop_name: string;
  description?: string;
  max_orders: number;
  default_daily_limit: number;
  limit_set_for_today: boolean;
  orders_used_today: number;
  active_orders: number;
  pending_requests: number;
  max_delivery_orders: number;
  max_pickup_orders: number;
  active_delivery_orders: number;
  active_pickup_orders: number;
  pending_delivery_requests: number;
  pending_pickup_requests: number;
  subscription_plan?: string;
  weekly_schedule?: Record<string, number | { delivery: number; pickup: number }> | null;
  working_hours?: Record<string, { open: string; close: string } | null> | null;
  shop_link: string | null;
  delivery_type?: string;
  delivery_price?: number;
  city_id?: number;
  district_id?: number;
  district_name?: string;
  metro_id?: number;
  metro_walk_minutes?: number;
  metro_name?: string | null;
  metro_line_color?: string | null;
  has_metro?: boolean;
  address_name?: string;
  map_url?: string;
  placement_expired_at?: string;
  preorder_enabled?: boolean;
  preorder_schedule_type?: string;
  preorder_weekday?: number;
  preorder_interval_days?: number;
  preorder_base_date?: string | null;
  preorder_custom_dates?: string[];
  preorder_available_dates?: string[];
  preorder_min_lead_days?: number;
  preorder_max_per_date?: number | null;
  preorder_discount_percent?: number;
  preorder_discount_min_days?: number;
  banner_url?: string | null;
  yookassa_account_id?: string | null;
  use_delivery_zones?: boolean;
  // Delivery slot settings
  deliveries_per_slot?: number | null;
  slot_days_ahead?: number;
  min_slot_lead_minutes?: number;
  slot_duration_minutes?: number;
  // Geo coordinates
  geo_lat?: number | null;
  geo_lon?: number | null;
  // Multi-branch
  owner_id?: number;
  branches_count?: number;
  max_branches?: number | null;
  // Gift note
  gift_note_enabled?: boolean;
}

export interface DeliveryZone {
  id: number;
  seller_id: number;
  name: string;
  district_ids: number[];
  delivery_price: number;
  min_order_amount?: number | null;
  free_delivery_from?: number | null;
  is_active: boolean;
  priority: number;
}

export interface CreateDeliveryZoneData {
  name: string;
  district_ids: number[];
  delivery_price: number;
  min_order_amount?: number | null;
  free_delivery_from?: number | null;
  is_active?: boolean;
  priority?: number;
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
  buyer_fio?: string | null;
  buyer_phone?: string | null;
  customer_id?: number | null;
  points_used?: number;
  points_discount?: number;
  payment_method?: string | null;
  payment_id?: string | null;
  payment_status?: string | null;
  delivery_slot_date?: string | null;
  delivery_slot_start?: string | null;
  delivery_slot_end?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  gift_note?: string | null;
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
  commission_rate?: number;
  commission_amount: number;
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

export interface CompositionItem {
  name: string;
  qty: number | null;
  unit: string | null;
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
  bouquet_id?: number | null;
  cost_price?: number | null;
  markup_percent?: number | null;
  stock_shortage?: { flower: string; need: number; have: number; deficit: number }[] | null;
  composition?: CompositionItem[] | null;
  category_id?: number | null;
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

export interface OrderEvent {
  type: 'cancelled' | 'payment_failed' | 'preorder_due' | 'completed';
  order_id: number;
  amount: number;
  buyer_name?: string;
  created_at?: string;
  completed_at?: string;
  payment_status?: string;
  minutes_since_accepted?: number;
  delivery_date?: string;
  is_today?: boolean;
}

export async function getDashboardOrderEvents(): Promise<{ events: OrderEvent[] }> {
  return fetchSeller<{ events: OrderEvent[] }>('/seller-web/dashboard/order-events');
}

export async function updateMe(payload: {
  preorder_enabled?: boolean;
  preorder_schedule_type?: string;
  preorder_weekday?: number;
  preorder_interval_days?: number;
  preorder_base_date?: string | null;
  preorder_custom_dates?: string[] | null;
  preorder_min_lead_days?: number;
  preorder_max_per_date?: number | null;
  preorder_discount_percent?: number;
  preorder_discount_min_days?: number;
  shop_name?: string;
  description?: string;
  delivery_type?: string;
  delivery_price?: number;
  address_name?: string;
  map_url?: string;
  banner_url?: string | null;
  yookassa_account_id?: string | null;
  use_delivery_zones?: boolean;
  deliveries_per_slot?: number | null;
  slot_days_ahead?: number;
  min_slot_lead_minutes?: number;
  slot_duration_minutes?: number;
  geo_lat?: number | null;
  geo_lon?: number | null;
  metro_id?: number | null;
  metro_walk_minutes?: number | null;
  gift_note_enabled?: boolean;
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

export async function getStats(params?: { period?: '1d' | '7d' | '30d'; date_from?: string; date_to?: string; branch?: string }): Promise<SellerStats> {
  const sp = new URLSearchParams();
  if (params?.period) sp.set('period', params.period);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.branch) sp.set('branch', params.branch);
  const query = sp.toString();
  const suffix = query ? `?${query}` : '';
  return fetchSeller<SellerStats>(`/seller-web/stats${suffix}`);
}

export interface CustomerStatsTopCustomer {
  buyer_id: number;
  name: string;
  phone: string;
  orders_count: number;
  total_spent: number;
}

export interface CustomerStats {
  total_customers: number;
  new_customers: number;
  returning_customers: number;
  repeat_orders: number;
  retention_rate: number;
  avg_ltv: number;
  top_customers: CustomerStatsTopCustomer[];
}

export async function getCustomerStats(params?: { period?: '1d' | '7d' | '30d'; date_from?: string; date_to?: string; branch?: string }): Promise<CustomerStats> {
  const sp = new URLSearchParams();
  if (params?.period) sp.set('period', params.period);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.branch) sp.set('branch', params.branch);
  const query = sp.toString();
  const suffix = query ? `?${query}` : '';
  return fetchSeller<CustomerStats>(`/seller-web/stats/customers${suffix}`);
}

export async function exportStatsCSV(params?: { period?: '1d' | '7d' | '30d'; date_from?: string; date_to?: string; branch?: string }): Promise<Blob> {
  const token = getSellerToken();
  if (!token) throw new Error('Не авторизован');

  const sp = new URLSearchParams();
  if (params?.period) sp.set('period', params.period);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.branch) sp.set('branch', params.branch);
  const query = sp.toString();
  const suffix = query ? `?${query}` : '';

  const res = await fetch(`${getApiBase()}/seller-web/stats/export${suffix}`, {
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
  const token = sessionStorage.getItem('seller_token');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${getApiBase()}/seller-web/upload-photo`, {
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

/** Full URL for shop banner (banner_url from backend). */
export function getBannerImageUrl(bannerUrl: string | null | undefined): string | null {
  if (bannerUrl == null || String(bannerUrl).trim() === '') return null;
  const raw = String(bannerUrl).trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (!path.startsWith('/static/')) return null;
  const base = (getApiBase() || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export async function uploadBannerPhoto(file: File): Promise<{ banner_url: string }> {
  const token = sessionStorage.getItem('seller_token');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${getApiBase()}/seller-web/upload-banner`, {
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

export async function createProduct(data: { seller_id: number; name: string; description: string; price: number; photo_id?: string; photo_ids?: string[]; quantity: number; bouquet_id?: number; is_preorder?: boolean; cost_price?: number; markup_percent?: number; composition?: CompositionItem[]; category_id?: number | null }): Promise<SellerProduct> {
  return fetchSeller<SellerProduct>('/seller-web/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProduct(productId: number, data: Partial<{ name: string; description: string; price: number; quantity: number; photo_ids: string[]; is_active: boolean; is_preorder: boolean; cost_price: number; markup_percent: number; composition: CompositionItem[]; category_id: number | null }>): Promise<SellerProduct> {
  return fetchSeller<SellerProduct>(`/seller-web/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProduct(productId: number): Promise<{ status: string }> {
  return fetchSeller(`/seller-web/products/${productId}`, { method: 'DELETE' });
}

export async function recalculateProductPrice(productId: number): Promise<{ id: number; name: string; price: number; cost_price: number | null; markup_percent: number | null; quantity: number }> {
  return fetchSeller(`/seller-web/products/${productId}/recalculate`, { method: 'POST' });
}


export async function updateWorkingHours(
  working_hours: Record<string, { open: string; close: string } | null> | null
): Promise<{ status: string; working_hours: Record<string, { open: string; close: string } | null> | null }> {
  return fetchSeller('/seller-web/working-hours', {
    method: 'PUT',
    body: JSON.stringify({ working_hours }),
  });
}

export async function changeCredentials(data: { old_login: string; old_password: string; new_login: string; new_password: string }): Promise<{ status: string }> {
  return fetchSeller('/seller-web/security/change-credentials', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// --- Loyalty / Customers ---
export interface LoyaltyTier {
  name: string;
  min_total: number;
  points_percent: number;
}

export interface LoyaltySettings {
  points_percent: number;
  max_points_discount_percent: number;
  points_to_ruble_rate: number;
  tiers_config: LoyaltyTier[] | null;
  points_expire_days: number | null;
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
  tags?: string[] | null;
  birthday?: string | null;
}

export interface LoyaltyTransaction {
  id: number;
  amount: number;
  points_accrued: number;
  order_id: number | null;
  created_at: string | null;
}

export interface CustomerEvent {
  id: number;
  title: string;
  event_date: string | null;
  remind_days_before: number;
  notes?: string | null;
}

export interface CustomerTierInfo {
  name: string | null;
  points_percent: number | null;
  next_tier: string | null;
  amount_to_next: number | null;
}

export interface SellerCustomerDetail extends SellerCustomerBrief {
  transactions: LoyaltyTransaction[];
  events?: CustomerEvent[];
  total_purchases?: number;
  last_order_at?: string | null;
  completed_orders_count?: number;
  tier?: CustomerTierInfo;
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  return fetchSeller<LoyaltySettings>('/seller-web/loyalty/settings');
}

export async function updateLoyaltySettings(data: {
  points_percent: number;
  max_points_discount_percent?: number;
  points_to_ruble_rate?: number;
  tiers_config?: LoyaltyTier[] | null;
  points_expire_days?: number | null;
}): Promise<LoyaltySettings> {
  return fetchSeller<LoyaltySettings>('/seller-web/loyalty/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getCustomers(tag?: string): Promise<SellerCustomerBrief[]> {
  const params = tag ? `?tag=${encodeURIComponent(tag)}` : '';
  return fetchSeller<SellerCustomerBrief[]>(`/seller-web/customers${params}`);
}

export async function getCustomerTags(): Promise<string[]> {
  return fetchSeller<string[]>('/seller-web/customers/tags');
}

export interface CustomerSegments {
  segments: Record<string, number>;
  customers: Array<{ id: number; name: string; phone: string; segment: string }>;
}

export async function getCustomerSegments(): Promise<CustomerSegments> {
  return fetchSeller<CustomerSegments>('/seller-web/customers/segments');
}

/** Unified customer entry: subscriber and/or loyalty card holder */
export interface UnifiedCustomerBrief {
  buyer_id: number | null;
  username: string | null;
  fio: string | null;
  phone: string | null;
  subscribed_at: string | null;
  loyalty_card_number: string | null;
  loyalty_points: number;
  loyalty_customer_id: number | null;
  has_loyalty: boolean;
  first_name: string | null;
  last_name: string | null;
  tags: string[] | null;
  birthday: string | null;
  segment: string | null;
}

export async function getAllCustomers(): Promise<UnifiedCustomerBrief[]> {
  return fetchSeller<UnifiedCustomerBrief[]>('/seller-web/customers/all');
}

export async function createCustomer(data: { phone: string; first_name: string; last_name: string; birthday?: string | null }): Promise<SellerCustomerBrief> {
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

export async function updateCustomer(customerId: number, data: { notes?: string; tags?: string[]; birthday?: string | null }): Promise<SellerCustomerBrief> {
  return fetchSeller<SellerCustomerBrief>(`/seller-web/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Customer Events ---
export async function createCustomerEvent(
  customerId: number,
  data: { title: string; event_date: string; remind_days_before?: number; notes?: string | null }
): Promise<CustomerEvent> {
  return fetchSeller<CustomerEvent>(`/seller-web/customers/${customerId}/events`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomerEvent(
  customerId: number,
  eventId: number,
  data: { title?: string; event_date?: string; remind_days_before?: number; notes?: string | null }
): Promise<CustomerEvent> {
  return fetchSeller<CustomerEvent>(`/seller-web/customers/${customerId}/events/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomerEvent(customerId: number, eventId: number): Promise<{ ok: boolean }> {
  return fetchSeller(`/seller-web/customers/${customerId}/events/${eventId}`, { method: 'DELETE' });
}

export interface UpcomingEvent {
  type: string;
  customer_id: number;
  customer_name: string;
  title: string;
  event_date: string;
  days_until: number;
}

export async function getUpcomingEvents(days: number = 7): Promise<UpcomingEvent[]> {
  return fetchSeller<UpcomingEvent[]>(`/seller-web/dashboard/upcoming-events?days=${days}`);
}

export async function exportCustomersCSV(): Promise<Blob> {
  const token = getSellerToken();
  if (!token) throw new Error('Не авторизован');

  const res = await fetch(`${getApiBase()}/seller-web/customers/export`, {
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

// --- Write-off ---
export interface WriteOffResult {
  id: number;
  reception_item_id: number;
  flower_name: string;
  quantity: number;
  reason: string;
  comment: string | null;
  loss_amount: number;
  remaining_after: number;
  created_at: string | null;
}

export async function writeOffItem(
  itemId: number,
  data: { quantity: number; reason: string; comment?: string }
): Promise<WriteOffResult> {
  return fetchSeller<WriteOffResult>(`/seller-web/receptions/items/${itemId}/write-off`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Write-off Stats ---
export interface WriteOffStatsFlower {
  flower_name: string;
  quantity: number;
  loss_amount: number;
}

export interface WriteOffStatsDaily {
  date: string;
  quantity: number;
  loss_amount: number;
}

export interface WriteOffStats {
  total_count: number;
  total_quantity: number;
  total_loss: number;
  by_reason: Record<string, { quantity: number; loss_amount: number }>;
  by_flower: WriteOffStatsFlower[];
  daily: WriteOffStatsDaily[];
}

export async function getWriteOffStats(dateFrom?: string, dateTo?: string): Promise<WriteOffStats> {
  const sp = new URLSearchParams();
  if (dateFrom) sp.set('date_from', dateFrom);
  if (dateTo) sp.set('date_to', dateTo);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchSeller<WriteOffStats>(`/seller-web/write-offs/stats${q}`);
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

// --- Global Inventory ---
export interface GlobalInventoryItem {
  flower_id: number;
  flower_name: string;
  total_remaining: number;
  avg_price: number;
}

export interface GlobalInventoryCheckLine {
  flower_id: number;
  flower_name: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  loss_amount: number;
}

export async function getGlobalInventory(): Promise<GlobalInventoryItem[]> {
  return fetchSeller<GlobalInventoryItem[]>('/seller-web/inventory/all');
}

export async function globalInventoryCheck(
  lines: { flower_id: number; actual_quantity: number }[]
): Promise<{ lines: GlobalInventoryCheckLine[]; total_loss: number }> {
  return fetchSeller(`/seller-web/inventory/all/check`, {
    method: 'POST',
    body: JSON.stringify(lines),
  });
}

export async function globalInventoryApply(
  lines: { flower_id: number; actual_quantity: number }[]
): Promise<{ applied: number }> {
  return fetchSeller(`/seller-web/inventory/all/apply`, {
    method: 'POST',
    body: JSON.stringify(lines),
  });
}

// --- Bouquets ---
export interface BouquetItemDto {
  flower_id: number;
  flower_name: string;
  quantity: number;
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
  items: { flower_id: number; quantity: number }[];
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
    items: { flower_id: number; quantity: number }[];
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

// --- Subscribers ---
export interface Subscriber {
  buyer_id: number;
  username: string | null;
  fio: string | null;
  phone: string | null;
  subscribed_at: string | null;
  loyalty_card_number: string | null;
  loyalty_points: number;
  loyalty_customer_id: number | null;
  has_loyalty: boolean;
}

export interface SubscribersResponse {
  subscribers: Subscriber[];
  total: number;
}

export async function getSubscribers(): Promise<SubscribersResponse> {
  return fetchSeller<SubscribersResponse>('/seller-web/subscribers');
}

export async function getSubscriberCount(branch?: string): Promise<{ count: number }> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return fetchSeller<{ count: number }>(`/seller-web/subscribers/count${params}`);
}

export interface BranchStats {
  seller_id: number;
  shop_name: string | null;
  address_name: string | null;
  is_primary: boolean;
  is_blocked: boolean;
  revenue: number;
  orders: number;
  active_orders: number;
  pending_requests: number;
}

export async function getBranchesStats(period?: string): Promise<{ branches: BranchStats[]; period: string }> {
  const params = period ? `?period=${encodeURIComponent(period)}` : '';
  return fetchSeller<{ branches: BranchStats[]; period: string }>(`/seller-web/branches/stats${params}`);
}

// --- Preorder Summary & Analytics ---
export interface PreorderSummaryItem {
  product_id: number;
  product_name: string;
  total_quantity: number;
  total_amount: number;
  orders_count: number;
}

export interface PreorderSummary {
  date: string;
  items: PreorderSummaryItem[];
  total_orders: number;
  total_amount: number;
}

export async function getPreorderSummary(date: string): Promise<PreorderSummary> {
  return fetchSeller<PreorderSummary>(`/seller-web/preorder-summary?date=${encodeURIComponent(date)}`);
}

export interface PreorderAnalytics {
  total_preorders: number;
  completed_preorders: number;
  cancelled_preorders: number;
  completion_rate: number;
  cancellation_rate: number;
  total_revenue: number;
  avg_lead_days: number;
  top_products: Array<{ product_name: string; count: number }>;
}

export async function getPreorderAnalytics(params?: { period?: '1d' | '7d' | '30d'; date_from?: string; date_to?: string; branch?: string }): Promise<PreorderAnalytics> {
  const sp = new URLSearchParams();
  if (params?.period) sp.set('period', params.period);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  if (params?.branch) sp.set('branch', params.branch);
  const query = sp.toString();
  const suffix = query ? `?${query}` : '';
  return fetchSeller<PreorderAnalytics>(`/seller-web/preorder-analytics${suffix}`);
}

// --- Subscription ---

export interface SubscriptionPricesResponse {
  base_price: number;
  prices: Record<number, number>;
  discounts: Record<number, number>;
}

export interface SubscriptionInfo {
  id: number;
  period_months: number;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  amount_paid: number;
  days_remaining?: number;
  auto_renew?: boolean;
  created_at?: string;
  payment_id?: string;
}

export interface SubscriptionStatusResponse {
  current: SubscriptionInfo | null;
  history: SubscriptionInfo[];
}

export interface CreateSubscriptionResponse {
  subscription_id: number;
  payment_id: string;
  confirmation_url: string | null;
  status: string;
}

export interface BranchSubscriptionInfo {
  seller_id: number;
  shop_name: string | null;
  address_name: string | null;
  subscription_plan: string;
  expires_at: string | null;
  days_remaining: number;
  is_owner: boolean;
}

export async function getSubscriptionPrices(): Promise<SubscriptionPricesResponse> {
  return fetchSeller<SubscriptionPricesResponse>('/subscriptions/prices/me');
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  return fetchSeller<SubscriptionStatusResponse>('/subscriptions/status');
}

export async function createSubscription(periodMonths: number, targetSellerId?: number): Promise<CreateSubscriptionResponse> {
  const body: Record<string, unknown> = { period_months: periodMonths };
  if (targetSellerId != null) body.target_seller_id = targetSellerId;
  return fetchSeller<CreateSubscriptionResponse>('/subscriptions/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getBranchesSubscriptionStatus(): Promise<BranchSubscriptionInfo[]> {
  const resp = await fetchSeller<{ branches: BranchSubscriptionInfo[] }>('/subscriptions/branches-status');
  return resp.branches;
}

// --- Delivery Zones ---

export async function getDeliveryZones(): Promise<DeliveryZone[]> {
  return fetchSeller<DeliveryZone[]>('/seller-web/delivery-zones');
}

export async function createDeliveryZone(data: CreateDeliveryZoneData): Promise<DeliveryZone> {
  return fetchSeller<DeliveryZone>('/seller-web/delivery-zones', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDeliveryZone(id: number, data: Partial<CreateDeliveryZoneData>): Promise<DeliveryZone> {
  return fetchSeller<DeliveryZone>(`/seller-web/delivery-zones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDeliveryZone(id: number): Promise<void> {
  await fetchSeller<{ status: string }>(`/seller-web/delivery-zones/${id}`, { method: 'DELETE' });
}

// --- CATEGORIES ---

export interface SellerCategory {
  id: number;
  seller_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export async function getCategories(): Promise<SellerCategory[]> {
  return fetchSeller<SellerCategory[]>('/seller-web/categories');
}

export async function createCategory(data: { name: string; sort_order?: number }): Promise<SellerCategory> {
  return fetchSeller<SellerCategory>('/seller-web/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCategory(id: number, data: { name?: string; sort_order?: number; is_active?: boolean }): Promise<SellerCategory> {
  return fetchSeller<SellerCategory>(`/seller-web/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: number): Promise<void> {
  await fetchSeller<{ status: string }>(`/seller-web/categories/${id}`, { method: 'DELETE' });
}

/** Fetch districts from public API (no auth needed). */
export async function getPublicDistricts(cityId: number): Promise<{ id: number; name: string; city_id: number }[]> {
  const url = `${getApiBase()}/public/districts/${cityId}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

// --- Reference data (public, no auth) ---

export async function getPublicCities(): Promise<{ id: number; name: string }[]> {
  const url = `${getApiBase()}/public/cities`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function getPublicMetro(districtId: number): Promise<{ id: number; name: string; line_color?: string }[]> {
  const url = `${getApiBase()}/public/metro/${districtId}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

// --- Branches ---

export interface BranchInfo {
  seller_id: number;
  shop_name: string | null;
  address_name: string | null;
}

export interface BranchDetail {
  seller_id: number;
  shop_name: string | null;
  address_name: string | null;
  city_id: number | null;
  district_id: number | null;
  metro_id: number | null;
  delivery_type: string | null;
  working_hours: string | null;
  is_blocked: boolean;
  geo_lat: number | null;
  geo_lon: number | null;
  web_login: string | null;
  contact_tg_id: number | null;
}

export async function getBranches(): Promise<BranchDetail[]> {
  return fetchSeller<BranchDetail[]>('/seller-web/branches');
}

export interface CreateBranchResponse {
  seller_id: number;
  shop_name: string | null;
  web_login: string;
  web_password: string;
  branches_count: number;
}

export async function createBranch(data: Record<string, unknown>): Promise<CreateBranchResponse> {
  return fetchSeller<CreateBranchResponse>('/seller-web/branches', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBranch(branchId: number, data: Record<string, unknown>): Promise<BranchDetail> {
  return fetchSeller<BranchDetail>(`/seller-web/branches/${branchId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBranch(branchId: number): Promise<void> {
  await fetchSeller<{ status: string }>(`/seller-web/branches/${branchId}`, { method: 'DELETE' });
}

export async function resetBranchPassword(branchId: number): Promise<{ web_login: string; web_password: string }> {
  return fetchSeller<{ web_login: string; web_password: string }>(`/seller-web/branches/${branchId}/reset-password`, {
    method: 'POST',
  });
}

export async function switchBranch(sellerId: number): Promise<{ token: string; seller_id: number; owner_id: number; branches: BranchInfo[] }> {
  return fetchSeller<{ token: string; seller_id: number; owner_id: number; branches: BranchInfo[] }>('/seller-auth/switch-branch', {
    method: 'POST',
    body: JSON.stringify({ seller_id: sellerId }),
  });
}

// ── Auth ──

export async function sellerLogin(login: string, password: string): Promise<{
  token: string;
  seller_id: number;
  owner_id: number;
  is_primary: boolean;
  branches: BranchInfo[];
  max_branches: number | null;
}> {
  const url = `${getApiBase()}/seller-web/login`;
  const res = await fetch(url, {
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

// ── Metro search (public endpoint, no auth) ──

export interface MetroStation {
  id: number;
  name: string;
  district_id?: number;
  line_color?: string;
}

export async function searchMetro(query: string): Promise<MetroStation[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query.trim() });
  const url = `${getApiBase()}/public/metro/search?${params}`;
  const res = await fetch(url);
  return res.ok ? res.json() : [];
}

export async function telegramSellerAuth(initData: string): Promise<{
  token: string;
  role: 'admin' | 'seller';
  seller_id?: number;
  owner_id?: number;
  branches?: BranchInfo[];
  is_primary?: boolean;
  max_branches?: number | null;
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
