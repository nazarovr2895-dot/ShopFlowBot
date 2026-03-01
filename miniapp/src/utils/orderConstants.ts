/**
 * Shared order status labels, colors, and sets for miniapp.
 */

export const ACTIVE_STATUSES = new Set([
  'pending', 'accepted', 'assembling', 'in_transit', 'ready_for_pickup', 'done',
]);

export const COMPLETED_STATUSES = new Set([
  'completed', 'rejected', 'cancelled',
]);

/** Short labels for order list views. */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  ready_for_pickup: 'Готов к выдаче',
  done: 'Выполнен',
  completed: 'Получен',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

/** Detailed labels for order detail view. */
export const STATUS_LABELS_DETAIL: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  accepted: 'Принят продавцом',
  assembling: 'Собирается',
  in_transit: 'В пути',
  ready_for_pickup: 'Готов к выдаче',
  done: 'Выполнен',
  completed: 'Получен',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#f39c12',
  accepted: '#27ae60',
  assembling: '#3498db',
  in_transit: '#9b59b6',
  ready_for_pickup: '#9b59b6',
  done: '#2ecc71',
  completed: '#95a5a6',
  rejected: '#e74c3c',
  cancelled: '#95a5a6',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает оплаты',
  waiting_for_capture: 'Обработка оплаты',
  succeeded: 'Оплачено',
  canceled: 'Оплата отменена',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: '#f39c12',
  waiting_for_capture: '#3498db',
  succeeded: '#27ae60',
  canceled: '#e74c3c',
};
