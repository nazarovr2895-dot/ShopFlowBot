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
  line_color?: string;
}

// Seller types
export interface PublicSellerListItem {
  seller_id: number;
  shop_name: string | null;
  owner_fio: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  delivery_price: number;
  city_name: string | null;
  district_name: string | null;
  metro_name: string | null;
  metro_walk_minutes?: number;
  metro_line_color?: string;
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
  /** До 3 фото (пути /static/...). Для отображения использовать первый или карусель */
  photo_ids?: string[] | null;
  quantity?: number;
  is_preorder?: boolean;
}

// Cart (backend)
export interface CartItemEntry {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  is_preorder?: boolean;
  preorder_delivery_date?: string | null;
}

export interface CartSellerGroup {
  seller_id: number;
  shop_name: string;
  items: CartItemEntry[];
  total: number;
}

// Visited sellers
export interface VisitedSeller {
  seller_id: number;
  shop_name: string;
  owner_fio: string | null;
  visited_at: string | null;
}

// Orders
export interface BuyerOrder {
  id: number;
  buyer_id: number;
  seller_id: number;
  items_info: string;
  total_price: number;
  status: string;
  delivery_type: string;
  address: string | null;
  created_at: string | null;
}

export interface PublicSellerDetail {
  seller_id: number;
  shop_name: string | null;
  description: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  delivery_price: number;
  map_url: string | null;
  city_name: string | null;
  district_name: string | null;
  metro_name: string | null;
  metro_walk_minutes?: number;
  metro_line_color?: string;
  available_slots: number;
  products: Product[];
  preorder_products?: Product[];
  preorder_available_dates?: string[];
  preorder_enabled?: boolean;
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
  free_delivery?: boolean;
  sort_price?: 'asc' | 'desc';
  sort_mode?: 'all_city' | 'nearby';
  /** Поиск по названию магазина и хештегам */
  search?: string;
}