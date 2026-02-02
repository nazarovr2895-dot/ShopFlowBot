export interface Seller {
  tg_id: number
  fio: string
  phone?: string
  shop_name: string
  description?: string
  city_id?: number
  district_id?: number
  map_url?: string
  metro_id?: number
  metro_walk_minutes?: number
  delivery_type?: string
  delivery_price?: number
  placement_expired_at?: string
  is_blocked?: boolean
  is_deleted?: boolean
  max_orders?: number
  active_orders?: number
  pending_requests?: number
}

export interface SellerStats {
  fio: string
  orders_count: number
  total_sales: number
  platform_profit: number
}

export interface AgentStats {
  fio: string
  orders_count: number
  total_sales: number
}

export interface Agent {
  tg_id: number
  fio?: string
  phone?: string
  age?: number
  is_self_employed?: boolean
  balance: number
  referrals_count: number
  created_at?: string
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
