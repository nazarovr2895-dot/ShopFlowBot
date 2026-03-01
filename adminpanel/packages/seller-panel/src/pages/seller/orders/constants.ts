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

export type CardContext =
  | 'pending'
  | 'awaiting_payment'
  | 'active'
  | 'history'
  | 'cancelled'
  | 'preorder_requests'
  | 'preorder_waiting';

export interface StatusColor {
  bg: string;
  text: string;
  border: string;
}

const STATUS_COLORS: Record<string, StatusColor> = {
  pending:          { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', border: 'rgba(249,115,22,0.2)' },
  accepted:         { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.2)' },
  assembling:       { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', border: 'rgba(168,85,247,0.2)' },
  in_transit:       { bg: 'rgba(14,165,233,0.12)',  text: '#38bdf8', border: 'rgba(14,165,233,0.2)' },
  ready_for_pickup: { bg: 'rgba(34,197,94,0.12)',   text: '#4ade80', border: 'rgba(34,197,94,0.2)' },
  done:             { bg: 'rgba(34,197,94,0.15)',   text: '#22c55e', border: 'rgba(34,197,94,0.25)' },
  completed:        { bg: 'rgba(34,197,94,0.15)',   text: '#22c55e', border: 'rgba(34,197,94,0.25)' },
  rejected:         { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.2)' },
  cancelled:        { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.2)' },
};

const DEFAULT_STATUS_COLOR: StatusColor = {
  bg: 'rgba(148,163,184,0.1)',
  text: '#94a3b8',
  border: 'rgba(148,163,184,0.15)',
};

export function getStatusColor(status: string): StatusColor {
  return STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;
}

export function isPickup(type?: string): boolean {
  if (!type) return false;
  const v = type.trim().toLowerCase();
  return v === 'pickup' || v === 'самовывоз';
}
