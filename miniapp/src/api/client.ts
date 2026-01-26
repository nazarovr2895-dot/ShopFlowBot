import type {
  City,
  District,
  Metro,
  PublicSellersResponse,
  PublicSellerDetail,
  SellerFilters,
} from '../types';

// API base URL - пустой для использования прокси в dev режиме
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log('[API] Fetching:', url);
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',  // Bypass ngrok interstitial page
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

  // Sellers API
  async getSellers(
    filters: SellerFilters = {},
    page: number = 1,
    perPage: number = 20
  ): Promise<PublicSellersResponse> {
    const params = new URLSearchParams();
    
    if (filters.city_id) params.append('city_id', filters.city_id.toString());
    if (filters.district_id) params.append('district_id', filters.district_id.toString());
    if (filters.metro_id) params.append('metro_id', filters.metro_id.toString());
    if (filters.delivery_type) params.append('delivery_type', filters.delivery_type);
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
}

export const api = new ApiClient(API_BASE_URL);
