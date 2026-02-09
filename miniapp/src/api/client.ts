import WebApp from '@twa-dev/sdk';
import type {
  City,
  District,
  Metro,
  PublicSellersResponse,
  PublicSellerDetail,
  SellerFilters,
  CartSellerGroup,
  VisitedSeller,
  BuyerOrder,
} from '../types';

// API base URL: сначала runtime (config.json), иначе из сборки (VITE_API_URL)
let runtimeApiUrl: string | null = null;

export function setApiBaseUrl(url: string): void {
  runtimeApiUrl = url;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Get Telegram WebApp init data for authentication.
 * Uses the same source as the rest of the app (@twa-dev/sdk).
 */
function getTelegramInitData(): string | null {
  try {
    const data = WebApp.initData;
    const result = data && data.length > 0 ? data : null;
    return result;
  } catch (e) {
    return null;
  }
}

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
    const isLocalBase =
      typeof window !== 'undefined' &&
      base &&
      (base.startsWith('http://localhost') || base.startsWith('http://127.0.0.1'));
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isPageLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    // В Telegram (не localhost) не подставлять localhost в URL картинок — грузить с того же origin (прокси)
    let url: string;
    if (isLocalBase && !isPageLocal) {
      url = path;
    } else {
      url = base ? `${base}${path}` : path;
    }
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      console.log('[API] Product image URL:', url, '(photo_id:', photoId, ', base:', base || '(empty)');
    }
    return url;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    console.log('[API] Fetching:', url);
    
    // Build headers with optional Telegram auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',  // Bypass ngrok interstitial page
    };
    
    // Add Telegram authentication if available
    const initData = getTelegramInitData();
    if (initData) {
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
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[API] Response data:', data);
      return data;
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

  // User API
  async getCurrentUser(): Promise<{
    tg_id: number;
    username?: string;
    fio?: string;
    phone?: string;
    role: string;
    city_id?: number;
    district_id?: number;
  }> {
    return this.fetch<{
      tg_id: number;
      username?: string;
      fio?: string;
      phone?: string;
      role: string;
      city_id?: number;
      district_id?: number;
    }>('/buyers/me');
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
  ): Promise<{ product_id: number; quantity: number; seller_id: number }> {
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

  async clearCart(): Promise<{ status: string }> {
    return this.fetch('/buyers/me/cart', { method: 'DELETE' });
  }

  async checkoutCart(data: { fio: string; phone: string; delivery_type: string; address: string }): Promise<{ orders: Array<{ order_id: number; seller_id: number; total_price: number }> }> {
    return this.fetch('/buyers/me/cart/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Visited sellers API
  async recordVisitedSeller(sellerId: number): Promise<{ status: string }> {
    return this.fetch('/buyers/me/visited-sellers', {
      method: 'POST',
      body: JSON.stringify({ seller_id: sellerId }),
    });
  }

  async getVisitedSellers(): Promise<VisitedSeller[]> {
    return this.fetch<VisitedSeller[]>('/buyers/me/visited-sellers');
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
  }> {
    return this.fetch(`/buyers/me/loyalty/${sellerId}`);
  }

  async confirmOrderReceived(orderId: number): Promise<{ status: string; new_status: string }> {
    return this.fetch(`/buyers/me/orders/${orderId}/confirm`, { method: 'POST' });
  }
}

export const api = new ApiClient(API_BASE_URL);
