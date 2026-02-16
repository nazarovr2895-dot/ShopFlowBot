export interface Seller {
  tg_id: number
  fio: string
  phone?: string
  shop_name: string
  inn?: string
  ogrn?: string
  description?: string
  city_id?: number
  district_id?: number
  address_name?: string
  map_url?: string
  metro_id?: number
  metro_walk_minutes?: number
  delivery_type?: string
  delivery_price?: number
  placement_expired_at?: string
  is_blocked?: boolean
  is_deleted?: boolean
  deleted_at?: string
  max_orders?: number
  daily_limit_date?: string
  active_orders?: number
  pending_requests?: number
  hashtags?: string
}

export interface SellerStats {
  fio: string
  orders_count: number
  total_sales: number
  platform_profit: number
}

export interface City {
  id: number
  name: string
}

export interface District {
  id: number
  name: string
  city_id: number
}

export interface MetroStation {
  id: number
  name: string
  district_id?: number
  line_color?: string
}
