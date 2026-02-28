export const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  ready_for_pickup: 'Готов к выдаче',
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

export const STATUS_ACTION_LABELS: Record<string, string> = {
  assembling: 'Начать сборку заказа?',
  in_transit: 'Отправить заказ в доставку?',
  ready_for_pickup: 'Отметить заказ как готовый к выдаче?',
  done: 'Завершить заказ? Это действие необратимо.',
};

export interface KanbanColumnConfig {
  key: string;
  label: string;
  statuses: string[];
  color: string;
}

export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { key: 'accepted', label: 'Принят', statuses: ['accepted'], color: 'var(--info)' },
  { key: 'assembling', label: 'Собирается', statuses: ['assembling'], color: 'var(--warning)' },
  { key: 'in_transit', label: 'В пути', statuses: ['in_transit'], color: 'var(--accent)' },
  { key: 'ready_for_pickup', label: 'Готов к выдаче', statuses: ['ready_for_pickup'], color: '#f97316' },
  { key: 'done', label: 'Выполнен', statuses: ['done'], color: 'var(--success)' },
];

export function getStatusVariant(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (['done', 'completed'].includes(status)) return 'success';
  if (['rejected', 'cancelled'].includes(status)) return 'danger';
  if (status === 'pending') return 'warning';
  if (['accepted', 'assembling', 'in_transit', 'ready_for_pickup'].includes(status)) return 'info';
  return 'neutral';
}

export function isPickup(type?: string): boolean {
  if (!type) return false;
  const v = type.trim().toLowerCase();
  return v === 'pickup' || v === 'самовывоз';
}
