import type { City, District, MetroStation } from '@shared/types/common';
export type { City, District, MetroStation };

export interface Seller {
  tg_id: number
  seller_id?: number
  owner_id?: number
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
  default_daily_limit?: number
  daily_limit_date?: string
  active_orders?: number
  pending_requests?: number
  subscription_plan?: string
  plan_limit_cap?: number
  weekly_schedule?: Record<string, number> | null
  hashtags?: string
  commission_percent?: number | null
  yookassa_account_id?: string | null
  max_branches?: number | null
  branch_count?: number
  branches?: AdminBranchInfo[]
}

export interface AdminBranchInfo {
  seller_id: number
  shop_name: string | null
  address_name: string | null
  is_owner?: boolean
  is_blocked?: boolean
}

export interface FinanceBranchRow {
  seller_id: number
  shop_name: string
  address_name: string | null
  orders: number
  revenue: number
  commission: number
}

export interface SellerStats {
  fio: string
  orders_count: number
  total_sales: number
  platform_profit: number
}

// ── Dashboard ──

export interface DashboardTodayMetrics {
  orders: number
  orders_yesterday: number
  revenue: number
  revenue_yesterday: number
  profit: number
  profit_yesterday: number
  avg_check: number
  avg_check_yesterday: number
  new_customers: number
  new_customers_yesterday: number
}

export interface PipelineItem {
  count: number
  amount: number
}

export interface DashboardPipeline {
  pending: PipelineItem
  in_progress: PipelineItem
  in_transit: PipelineItem
  completed_today: PipelineItem
  rejected_today: PipelineItem
}

export interface AlertExpiringPlacement {
  tg_id: number
  shop_name: string
  expires_in_days: number
}

export interface AlertExhaustedLimit {
  tg_id: number
  shop_name: string
  used: number
  limit: number
}

export interface AlertStuckOrder {
  order_id: number
  seller_id: number
  seller_name: string
  minutes_pending: number
  amount: number
}

export interface DashboardAlerts {
  expiring_placements: AlertExpiringPlacement[]
  exhausted_limits: AlertExhaustedLimit[]
  stuck_orders: AlertStuckOrder[]
}

export interface WeeklyRevenuePoint {
  date: string
  revenue: number
  orders: number
}

export interface DashboardTopSeller {
  tg_id: number
  shop_name: string
  orders: number
  revenue: number
  load_pct: number
}

export interface DashboardTotals {
  sellers: number
  buyers: number
  orders: number
}

export interface AdminDashboardData {
  today: DashboardTodayMetrics
  pipeline: DashboardPipeline
  alerts: DashboardAlerts
  weekly_revenue: WeeklyRevenuePoint[]
  top_sellers_today: DashboardTopSeller[]
  totals: DashboardTotals
}

// ── Orders ──

export interface AdminOrder {
  id: number
  buyer_id: number
  seller_id: number
  items_info: string
  total_price: number
  original_price: number | null
  points_discount: number
  status: string
  delivery_type: string | null
  address: string | null
  comment: string | null
  created_at: string | null
  completed_at: string | null
  is_preorder: boolean
  preorder_delivery_date: string | null
  seller_name: string
  buyer_fio: string
  buyer_phone: string
}

export interface AdminOrdersResponse {
  orders: AdminOrder[]
  total: number
  pages: number
  page: number
  status_breakdown: Record<string, number>
  total_amount: number
  sellers_list: { id: number; name: string }[]
}

// ── Customers ──

export interface AdminCustomer {
  tg_id: number
  fio: string | null
  username: string | null
  phone: string | null
  city: string | null
  orders_count: number
  total_spent: number
  last_order_at: string | null
  registered_at: string | null
}

export interface CustomersSummary {
  total_buyers: number
  active_buyers: number
  new_today: number
  avg_ltv: number
}

export interface CityDistribution {
  city: string
  count: number
}

export interface AdminCustomersResponse {
  customers: AdminCustomer[]
  total: number
  pages: number
  page: number
  summary: CustomersSummary
  city_distribution: CityDistribution[]
}

// ── Finance ──

export interface FinancePeriodMetrics {
  revenue: number
  profit: number
  orders: number
  avg_check: number
}

export interface FinanceSeriesPoint {
  period: string
  orders: number
  revenue: number
}

export interface FinanceSellerRow {
  seller_id: number
  shop_name: string
  plan: string
  orders: number
  revenue: number
  commission: number
  commission_rate: number
  share_pct: number
}

export interface AdminFinanceResponse {
  period: FinancePeriodMetrics
  previous_period: FinancePeriodMetrics
  series: FinanceSeriesPoint[]
  by_seller: FinanceSellerRow[]
  global_commission_rate: number
  date_from: string
  date_to: string
}
