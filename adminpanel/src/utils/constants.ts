/**
 * Shared constants — deduplicated from 4+ files.
 */

/** Order status labels (singular form for order cards) */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

/** Order status labels (plural form for stats) */
export const STATUS_LABELS_PLURAL: Record<string, string> = {
  pending: 'Ожидают',
  accepted: 'В работе',
  assembling: 'Собираются',
  in_transit: 'В пути',
  done: 'Выполнены',
  completed: 'Завершены',
  rejected: 'Отклонены',
};

/** Weekdays for schedule */
export const WEEKDAYS = [
  { value: 0, label: 'Понедельник' },
  { value: 1, label: 'Вторник' },
  { value: 2, label: 'Среда' },
  { value: 3, label: 'Четверг' },
  { value: 4, label: 'Пятница' },
  { value: 5, label: 'Суббота' },
  { value: 6, label: 'Воскресенье' },
] as const;

/** Delivery type options */
export const DELIVERY_TYPES = [
  { value: 'pickup', label: 'Самовывоз' },
  { value: 'delivery', label: 'Доставка' },
  { value: 'both', label: 'Оба' },
] as const;

/** Delivery type labels for display */
export const DELIVERY_LABELS: Record<string, string> = {
  pickup: 'Самовывоз',
  delivery: 'Доставка',
  both: 'Оба',
  'самовывоз': 'Самовывоз',
  'доставка': 'Доставка',
  'доставка и самовывоз': 'Доставка и самовывоз',
};

/** Customer segment colors */
export const SEGMENT_COLORS: Record<string, { bg: string; color: string }> = {
  VIP: { bg: '#fff3cd', color: '#856404' },
  'Постоянный': { bg: '#d4edda', color: '#155724' },
  'Новый': { bg: '#cce5ff', color: '#004085' },
  'Уходящий': { bg: '#f8d7da', color: '#721c24' },
  'Потерянный': { bg: '#e2e3e5', color: '#383d41' },
  'Случайный': { bg: '#e8e8e8', color: '#555' },
};

/** Subscription plan labels */
export const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
};
