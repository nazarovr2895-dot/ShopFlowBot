import { getTelegramInitData } from '../utils/environment';
import type {
  City,
  District,
  Metro,
  PublicSellersResponse,
  PublicSellerDetail,
  SellerFilters,
  CartSellerGroup,
  VisitedSeller,
  FavoriteProduct,
  BuyerOrder,
  SellerGeoItem,
  MetroGeoItem,
} from '../types';

// API base URL: сначала runtime (config.json), иначе из сборки (VITE_API_URL)
let runtimeApiUrl: string | null = null;

export function setApiBaseUrl(url: string): void {
  runtimeApiUrl = url;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// JWT token storage key
const JWT_TOKEN_KEY = 'flurai_jwt_token';

// Migration: rename old key to new
(() => {
  if (typeof window === 'undefined') return;
  const old = localStorage.getItem('flowshop_jwt_token');
  if (old) {
    localStorage.setItem(JWT_TOKEN_KEY, old);
    localStorage.removeItem('flowshop_jwt_token');
  }
})();

/** True if we have Telegram init data (e.g. app opened inside Telegram). */
export function hasTelegramAuth(): boolean {
  return getTelegramInitData() != null;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getBaseUrl(): string {
    return runtimeApiUrl != null && runtimeApiUrl !== '' ? runtimeApiUrl : this.baseUrl;
  }

  // JWT Token management
  private getJwtToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(JWT_TOKEN_KEY);
  }

  private setJwtToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(JWT_TOKEN_KEY, token);
  }

  private clearJwtToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(JWT_TOKEN_KEY);
  }

  /**
   * Check if user is authenticated (has JWT token or Telegram initData)
   */
  isAuthenticated(): boolean {
    return this.getJwtToken() != null || hasTelegramAuth();
  }

  /**
   * Authenticate using Telegram Mini App initData
   */
  async authWithMiniApp(initData: string): Promise<{ token: string; telegram_id: number; username?: string; first_name: string }> {
    const response = await fetch(`${this.getBaseUrl()}/auth/telegram-mini-app`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ init_data: initData }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    this.setJwtToken(data.token);
    return data;
  }

  /**
   * Authenticate using Telegram Widget data
   */
  async authWithWidget(widgetData: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
  }): Promise<{ token: string; telegram_id: number; username?: string; first_name: string }> {
    const response = await fetch(`${this.getBaseUrl()}/auth/telegram-widget`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(widgetData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    this.setJwtToken(data.token);
    return data;
  }

  /**
   * Logout - clear JWT token
   */
  logout(): void {
    this.clearJwtToken();
  }

  /** Полный URL фото товара (photo_id с бэкенда — путь вида /static/... или полный URL) */
  getProductImageUrl(photoId: string | null | undefined): string | null {
    if (photoId == null || String(photoId).trim() === '') return null;
    const raw = String(photoId).trim();

    // Уже полный URL
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

    // Путь без ведущего слэша (например "static/uploads/...") — нормализуем
    const path = raw.startsWith('/') ? raw : `/${raw}`;

    // Не используем как URL Telegram file_id и прочие не-пути
    if (!path.startsWith('/static/')) return null;

    const base = this.getBaseUrl().replace(/\/$/, '');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isPageLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');

    let url: string;

    // Если есть base URL - используем его
    if (base) {
      url = `${base}${path}`;
    } else {
      // Если base URL не установлен, пробуем использовать относительный путь
      // Это работает когда Mini App и backend на одном домене
      if (isPageLocal) {
        // Для localhost используем относительный путь
        url = path;
      } else {
        // Для production пытаемся определить URL из window.location
        // Telegram Web App обычно открывается на поддомене или основном домене
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

        // Проверяем, не является ли origin Mini App доменом типа *.telegram.org
        if (currentOrigin.includes('telegram.org') || currentOrigin.includes('t.me')) {
          // Это Telegram Web - изображения не доступны напрямую
          console.warn('[API] Product image: in Telegram Web context without base URL, image may not load:', photoId);
          // Возвращаем null, чтобы показать placeholder
          return null;
        }

        // Пытаемся использовать текущий origin (может работать если Mini App на том же домене что и API)
        url = `${currentOrigin}${path}`;

        if (import.meta.env.MODE === 'development') {
          console.warn('[API] Product image: base URL empty, using current origin as fallback:', url);
        }
      }
    }

    if (import.meta.env.MODE === 'development' && typeof window !== 'undefined') {
      console.log('[API] Product image URL:', url, '(photo_id:', photoId, ', base:', base || '(empty)', ', origin:', origin, ')');
    }

    return url;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    console.log('[API] Fetching:', url);

    // Build headers with authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',  // Bypass ngrok interstitial page
    };

    // Priority: JWT token first (for browser), then Telegram initData (for Mini App)
    const jwtToken = this.getJwtToken();
    const initData = getTelegramInitData();

    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    } else if (initData) {
      headers['X-Telegram-Init-Data'] = initData;
    }

    try {
      const response = await fetch(url, {
        headers: {
          ...headers,
          ...(options?.headers || {}),
        },
        ...options,
      });

      console.log('[API] Response status:', response.status);

      if (!response.ok) {
        // If 401 and we used JWT, clear it and retry with initData if available
        if (response.status === 401 && jwtToken) {
          this.clearJwtToken();

          // Retry with Telegram initData if available
          if (initData) {
            console.log('[API] JWT expired, retrying with Telegram initData');
            const retryHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
              'X-Telegram-Init-Data': initData,
            };
            const retryResponse = await fetch(url, {
              headers: {
                ...retryHeaders,
                ...(options?.headers || {}),
              },
              ...options,
            });
            if (retryResponse.ok) {
              return await retryResponse.json();
            }
          }
        }
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('[API] Error:', err);
      throw err;
    }
  }

  // Location API
  async getCities(): Promise<City[]> {
    return this.fetch<City[]>('/public/cities');
  }

  async getDistricts(cityId: number): Promise<District[]> {
    return this.fetch<District[]>(`/public/districts/${cityId}`);
  }

  async getMetroStations(districtId: number): Promise<Metro[]> {
    return this.fetch<Metro[]>(`/public/metro/${districtId}`);
  }

  async searchMetroStations(query: string): Promise<Metro[]> {
    const params = new URLSearchParams({ q: query });
    return this.fetch<Metro[]>(`/public/metro/search?${params.toString()}`);
  }

  // Geo API (map)
  async getSellersGeo(cityId?: number): Promise<SellerGeoItem[]> {
    const params = cityId ? `?city_id=${cityId}` : '';
    return this.fetchPublic<SellerGeoItem[]>(`/public/sellers/geo${params}`);
  }

  async getMetroStationsByCity(cityId: number): Promise<MetroGeoItem[]> {
    return this.fetchPublic<MetroGeoItem[]>(`/public/metro/city/${cityId}`);
  }

  // Sellers API
  async getSellers(
    filters: SellerFilters = {},
    page: number = 1,
    perPage: number = 20
  ): Promise<PublicSellersResponse> {
    const params = new URLSearchParams();
    
    if (filters.search && filters.search.trim()) params.append('search', filters.search.trim());
    if (filters.city_id) params.append('city_id', filters.city_id.toString());
    if (filters.district_id) params.append('district_id', filters.district_id.toString());
    if (filters.metro_id) params.append('metro_id', filters.metro_id.toString());
    if (filters.delivery_type) params.append('delivery_type', filters.delivery_type);
    if (filters.free_delivery !== undefined) params.append('free_delivery', filters.free_delivery.toString());
    if (filters.sort_price) params.append('sort_price', filters.sort_price);
    if (filters.sort_mode) params.append('sort_mode', filters.sort_mode);
    
    params.append('page', page.toString());
    params.append('per_page', perPage.toString());

    const queryString = params.toString();
    return this.fetch<PublicSellersResponse>(`/public/sellers?${queryString}`);
  }

  async getSellerDetail(sellerId: number): Promise<PublicSellerDetail> {
    return this.fetch<PublicSellerDetail>(`/public/sellers/${sellerId}`);
  }

  async getSellerAvailability(sellerId: number): Promise<{
    delivery_remaining: number;
    pickup_remaining: number;
    delivery_limit: number;
    pickup_limit: number;
    delivery_used: number;
    pickup_used: number;
  }> {
    return this.fetch(`/public/sellers/${sellerId}/availability`);
  }

  // User API
  async getCurrentUser(): Promise<{
    tg_id: number;
    username?: string;
    fio?: string;
    phone?: string;
    role: string;
    city_id?: number;
    district_id?: number;
    privacy_accepted?: boolean;
  }> {
    return this.fetch<{
      tg_id: number;
      username?: string;
      fio?: string;
      phone?: string;
      role: string;
      city_id?: number;
      district_id?: number;
      privacy_accepted?: boolean;
    }>('/buyers/me');
  }

  async acceptPrivacy(): Promise<void> {
    await this.fetch('/buyers/me/accept-privacy', { method: 'POST' });
  }

  async updateLocation(cityId?: number, districtId?: number): Promise<void> {
    await this.fetch('/buyers/me/location', {
      method: 'PUT',
      body: JSON.stringify({
        city_id: cityId || null,
        district_id: districtId || null,
      }),
    });
  }

  async updateProfile(data: { fio?: string; phone?: string }): Promise<{
    tg_id: number;
    username?: string;
    fio?: string;
    phone?: string;
    role: string;
    city_id?: number;
    district_id?: number;
  }> {
    return this.fetch('/buyers/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Cart API
  async getCart(): Promise<CartSellerGroup[]> {
    return this.fetch<CartSellerGroup[]>('/buyers/me/cart');
  }

  async addCartItem(
    productId: number,
    quantity: number = 1,
    preorderDeliveryDate?: string | null
  ): Promise<{ product_id: number; quantity: number; seller_id: number; reserved_at?: string | null }> {
    const body: { product_id: number; quantity: number; preorder_delivery_date?: string } = {
      product_id: productId,
      quantity,
    };
    if (preorderDeliveryDate) body.preorder_delivery_date = preorderDeliveryDate;
    return this.fetch('/buyers/me/cart/items', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateCartItem(productId: number, quantity: number): Promise<{ status: string }> {
    return this.fetch(`/buyers/me/cart/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
  }

  async removeCartItem(productId: number): Promise<{ status: string }> {
    return this.fetch(`/buyers/me/cart/items/${productId}`, { method: 'DELETE' });
  }

  async extendReservation(productId: number): Promise<{ reserved_at: string; ttl_seconds: number }> {
    return this.fetch(`/buyers/me/cart/items/${productId}/extend-reservation`, { method: 'POST' });
  }

  async clearCart(): Promise<{ status: string }> {
    return this.fetch('/buyers/me/cart', { method: 'DELETE' });
  }

  async checkoutCart(data: {
    fio: string;
    phone: string;
    delivery_type: string;
    address: string;
    comment?: string;
    points_usage?: Array<{ seller_id: number; points_to_use: number }>;
    delivery_by_seller?: Array<{ seller_id: number; delivery_type: string }>;
    delivery_slots?: Array<{ seller_id: number; date: string; start: string; end: string }>;
    buyer_district_id?: number | null;
    buyer_district_name?: string | null;
  }): Promise<{ orders: Array<{ order_id: number; seller_id: number; total_price: number }> }> {
    return this.fetch('/buyers/me/cart/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** Guest checkout — no auth headers, sends cart items directly. */
  async guestCheckout(data: {
    guest_name: string;
    guest_phone: string;
    delivery_type: string;
    address: string;
    comment?: string;
    items: Array<{
      product_id: number;
      seller_id: number;
      quantity: number;
      name: string;
      price: number;
    }>;
    delivery_by_seller?: Array<{ seller_id: number; delivery_type: string }>;
    delivery_slots?: Array<{ seller_id: number; date: string; start: string; end: string }>;
    buyer_district_id?: number | null;
    buyer_district_name?: string | null;
  }): Promise<{ orders: Array<{ order_id: number; seller_id: number; total_price: number }> }> {
    const url = `${this.getBaseUrl()}/orders/guest-checkout`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Ошибка оформления' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // Favorite products API
  async getFavoriteProducts(): Promise<FavoriteProduct[]> {
    return this.fetch<FavoriteProduct[]>('/buyers/me/favorite-products');
  }

  async addFavoriteProduct(productId: number): Promise<{ status: string }> {
    return this.fetch('/buyers/me/favorite-products', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    });
  }

  async removeFavoriteProduct(productId: number): Promise<{ status: string }> {
    return this.fetch(`/buyers/me/favorite-products/${productId}`, { method: 'DELETE' });
  }

  // Favorite sellers / Мои цветочные API
  async getFavoriteSellers(): Promise<VisitedSeller[]> {
    return this.fetch<VisitedSeller[]>('/buyers/me/favorite-sellers');
  }

  async addFavoriteSeller(sellerId: number): Promise<{ status: string }> {
    return this.fetch('/buyers/me/favorite-sellers', {
      method: 'POST',
      body: JSON.stringify({ seller_id: sellerId }),
    });
  }

  async removeFavoriteSeller(sellerId: number): Promise<{ status: string }> {
    return this.fetch(`/buyers/me/favorite-sellers/${sellerId}`, { method: 'DELETE' });
  }

  // Orders API (buyer)
  async getMyOrders(): Promise<BuyerOrder[]> {
    return this.fetch<BuyerOrder[]>('/buyers/me/orders');
  }

  /** Баланс баллов клубной карты у данного продавца (по телефону покупателя). */
  async getMyLoyaltyAtSeller(sellerId: number): Promise<{
    points_balance: number;
    points_percent: number;
    card_number: string | null;
    linked: boolean;
    max_points_discount_percent: number;
    points_to_ruble_rate: number;
  }> {
    return this.fetch(`/buyers/me/loyalty/${sellerId}`);
  }

  async confirmOrderReceived(orderId: number): Promise<{ status: string; new_status: string }> {
    return this.fetch(`/buyers/me/orders/${orderId}/confirm`, { method: 'POST' });
  }

  async cancelOrder(orderId: number): Promise<{ status: string; new_status: string; points_refunded?: number }> {
    return this.fetch(`/buyers/me/orders/${orderId}/cancel`, { method: 'POST' });
  }

  // Payment API (YuKassa)

  /** Create a YuKassa payment for an accepted order. Returns confirmation_url for redirect. */
  async createPayment(orderId: number, returnUrl?: string): Promise<{
    payment_id: string;
    confirmation_url: string | null;
    status: string;
  }> {
    return this.fetch('/payments/create', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, ...(returnUrl ? { return_url: returnUrl } : {}) }),
    });
  }

  /** Get current payment status for an order (fetches fresh data from YuKassa). */
  async getPaymentStatus(orderId: number): Promise<{
    order_id: number;
    payment_id: string | null;
    payment_status: string | null;
    paid: boolean;
    amount?: string | null;
  }> {
    return this.fetch(`/payments/${orderId}/status`);
  }

  /** Create payment for a guest order (no auth required). */
  async createGuestPayment(orderId: number, returnUrl?: string): Promise<{
    payment_id: string;
    confirmation_url: string | null;
    status: string;
  }> {
    const url = `${this.getBaseUrl()}/payments/guest/create`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ order_id: orderId, ...(returnUrl ? { return_url: returnUrl } : {}) }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Payment error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // --- Address autocomplete & delivery zone check ---

  async suggestAddress(query: string, city?: string): Promise<Array<{
    value: string;
    lat: string | null;
    lon: string | null;
    city: string | null;
    city_district: string | null;
    area: string | null;
    region: string | null;
    postal_code: string | null;
  }>> {
    const params = new URLSearchParams({ query });
    if (city) params.set('city', city);
    return this.fetchPublic<any[]>(`/public/address/suggest?${params}`);
  }

  async getDistrictsByCityId(cityId: number): Promise<Array<{ id: number; name: string; city_id: number }>> {
    return this.fetchPublic(`/public/districts/${cityId}`);
  }

  async checkDelivery(sellerId: number, params: { districtId?: number; districtName?: string; address?: string }): Promise<{
    delivers: boolean;
    zone: any | null;
    delivery_price: number;
    district_id?: number | null;
    message: string;
  }> {
    return this.fetchPublic(`/public/sellers/${sellerId}/check-delivery`, {
      method: 'POST',
      body: JSON.stringify({
        district_id: params.districtId,
        district_name: params.districtName,
        address: params.address,
      }),
    });
  }

  async getDeliverySlots(sellerId: number, dateFrom: string, dateTo: string): Promise<{
    slots_enabled: boolean;
    slot_duration_minutes: number;
    slots: Record<string, Array<{ start: string; end: string; available: number }>>;
  }> {
    return this.fetchPublic(`/public/sellers/${sellerId}/delivery-slots?date_from=${dateFrom}&date_to=${dateTo}`);
  }

  private async fetchPublic<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string> || {}),
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

export const api = new ApiClient(API_BASE_URL);
