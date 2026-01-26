// Location types
export interface City {
  id: number;
  name: string;
}

export interface District {
  id: number;
  name: string;
  city_id: number;
}

export interface Metro {
  id: number;
  name: string;
  district_id: number;
}

// Seller types
export interface PublicSellerListItem {
  seller_id: number;
  shop_name: string | null;
  owner_fio: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  city_name: string | null;
  district_name: string | null;
  metro_name: string | null;
  available_slots: number;
  min_price: number | null;
  max_price: number | null;
  product_count: number;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  photo_id: string | null;
}

export interface PublicSellerDetail {
  seller_id: number;
  shop_name: string | null;
  description: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  map_url: string | null;
  city_name: string | null;
  district_name: string | null;
  metro_name: string | null;
  available_slots: number;
  products: Product[];
}

export interface PublicSellersResponse {
  sellers: PublicSellerListItem[];
  total: number;
  page: number;
  per_page: number;
}

// Filter types
export interface SellerFilters {
  city_id?: number;
  district_id?: number;
  metro_id?: number;
  delivery_type?: 'delivery' | 'pickup' | 'both';
  sort_price?: 'asc' | 'desc';
  sort_mode?: 'all_city' | 'nearby';
}
