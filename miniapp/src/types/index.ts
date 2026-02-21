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
  availability?: 'available' | 'busy' | 'unavailable';
  min_price: number | null;
  max_price: number | null;
  product_count: number;
  subscriber_count?: number;
  working_hours?: Record<string, { open: string; close: string } | null> | null;
  is_open_now?: boolean | null;
}

export interface CompositionItem {
  name: string;
  qty: number | null;
  unit: string | null;
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
  composition?: CompositionItem[] | null;
}

// Cart (backend)
export interface CartItemEntry {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  is_preorder?: boolean;
  preorder_delivery_date?: string | null;
  photo_id?: string | null;
  reserved_at?: string | null;
}

export interface CartSellerGroup {
  seller_id: number;
  shop_name: string;
  items: CartItemEntry[];
  total: number;
  /** Cost of delivery for this seller (when delivery is chosen). */
  delivery_price?: number;
  /** Address name for pickup. */
  address_name?: string | null;
  /** Link to map for pickup (e.g. Google Maps). */
  map_url?: string | null;
}

// Visited / Subscribed sellers (rich data, same shape as PublicSellerListItem)
export interface VisitedSeller {
  seller_id: number;
  shop_name: string;
  owner_fio: string | null;
  visited_at?: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  delivery_price: number;
  city_name: string | null;
  district_name: string | null;
  metro_name: string | null;
  metro_walk_minutes?: number;
  metro_line_color?: string;
  available_slots: number;
  availability?: 'available' | 'busy' | 'unavailable';
  min_price: number | null;
  max_price: number | null;
  product_count: number;
  subscriber_count?: number;
  working_hours?: Record<string, { open: string; close: string } | null> | null;
  is_open_now?: boolean | null;
}

// Favorite products
export interface FavoriteProduct {
  product_id: number;
  name: string;
  description: string | null;
  price: number;
  photo_id: string | null;
  photo_ids?: string[] | null;
  quantity?: number;
  is_preorder?: boolean;
  composition?: CompositionItem[] | null;
  seller_id: number;
  shop_name: string;
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
  is_preorder?: boolean;
  preorder_delivery_date?: string | null;
  shop_name?: string;
  seller_username?: string | null;
  first_product_photo?: string | null;
  seller_address_name?: string | null;
  seller_map_url?: string | null;
  // Payment (YuKassa)
  payment_id?: string | null;
  payment_status?: string | null;
}

export interface PublicSellerDetail {
  seller_id: number;
  shop_name: string | null;
  description: string | null;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
  delivery_price: number;
  address_name?: string | null;
  map_url: string | null;
  city_name: string | null;
  district_name: string | null;
  metro_name: string | null;
  metro_walk_minutes?: number;
  metro_line_color?: string;
  available_slots: number;
  availability?: 'available' | 'busy' | 'unavailable';
  products: Product[];
  preorder_products?: Product[];
  preorder_available_dates?: string[];
  preorder_enabled?: boolean;
  preorder_discount_percent?: number;
  preorder_discount_min_days?: number;
  preorder_max_per_date?: number | null;
  banner_url?: string | null;
  subscriber_count?: number;
  working_hours?: Record<string, { open: string; close: string } | null> | null;
  is_open_now?: boolean | null;
  owner_username?: string | null;
  owner_tg_id?: number | null;
  owner_fio?: string | null;
  inn?: string | null;
  ogrn?: string | null;
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