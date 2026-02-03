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

export interface SellerMe {
  seller_id: number;
  fio?: string;
  phone?: string;
  shop_name: string;
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
}

export interface SellerStats {
  total_completed_orders: number;
  total_revenue: number;
  commission_18: number;
  net_revenue: number;
  orders_by_status: Record<string, number>;
}

export interface SellerProduct {
  id: number;
  seller_id: number;
  name: string;
  description: string;
  price: number;
  photo_id?: string;
  quantity: number;
}

export async function getMe(): Promise<SellerMe> {
  return fetchSeller<SellerMe>('/seller-web/me');
}

export async function getOrders(params?: { status?: string; date_from?: string; date_to?: string }): Promise<SellerOrder[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return fetchSeller<SellerOrder[]>(`/seller-web/orders${q}`);
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

export async function getStats(): Promise<SellerStats> {
  return fetchSeller<SellerStats>('/seller-web/stats');
}

export async function getProducts(): Promise<SellerProduct[]> {
  return fetchSeller<SellerProduct[]>('/seller-web/products');
}

export async function createProduct(data: { seller_id: number; name: string; description: string; price: number; photo_id?: string; quantity: number }): Promise<SellerProduct> {
  return fetchSeller<SellerProduct>('/seller-web/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProduct(productId: number, data: Partial<{ name: string; description: string; price: number; quantity: number }>): Promise<SellerProduct> {
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
