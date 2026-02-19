import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { getAdminOrders } from '../api/adminClient';
import type { Seller, AdminOrdersResponse, FinanceSellerRow, FinancePeriodMetrics } from '../types';
import './SellerAnalyticsModal.css';

interface SellerAnalyticsModalProps {
  sellerId: number;
  seller?: Seller;
  financeRow?: FinanceSellerRow;
  platformMetrics: FinancePeriodMetrics;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Сборка',
  in_transit: 'Доставка',
  done: 'Готов',
  completed: 'Завершён',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

const STATUS_GROUP: Record<string, string> = {
  pending: 'pending',
  accepted: 'active',
  assembling: 'active',
  in_transit: 'active',
  done: 'done',
  completed: 'done',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function planLabel(plan?: string): string {
  if (plan === 'pro') return 'Pro';
  if (plan === 'premium') return 'Premium';
  return 'Free';
}

export function SellerAnalyticsModal({
  sellerId,
  seller,
  financeRow,
  platformMetrics,
  dateFrom,
  dateTo,
  onClose,
}: SellerAnalyticsModalProps) {
  const [ordersData, setOrdersData] = useState<AdminOrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAdminOrders({ seller_id: sellerId, date_from: dateFrom, date_to: dateTo, per_page: 10 })
      .then(setOrdersData)
      .catch(() => setOrdersData(null))
      .finally(() => setLoading(false));
  }, [sellerId, dateFrom, dateTo]);

  const shopName = seller?.shop_name || financeRow?.shop_name || `Продавец #${sellerId}`;
  const orders = financeRow?.orders ?? 0;
  const revenue = financeRow?.revenue ?? 0;
  const commission = financeRow?.commission ?? 0;
  const avgCheck = orders > 0 ? Math.round(revenue / orders) : 0;
  const sharePct = financeRow?.share_pct ?? 0;
  const maxOrders = seller?.max_orders ?? seller?.default_daily_limit ?? 0;
  const activeOrders = seller?.active_orders ?? 0;
  const loadPct = maxOrders > 0 ? Math.round((activeOrders / maxOrders) * 100) : 0;

  const platformAvgCheck = platformMetrics.avg_check || 0;
  const avgCheckDiff = platformAvgCheck > 0
    ? Math.round(((avgCheck - platformAvgCheck) / platformAvgCheck) * 100)
    : 0;

  // Status breakdown
  const breakdown = ordersData?.status_breakdown ?? {};
  const totalStatusOrders = Object.values(breakdown).reduce((s, v) => s + v, 0);

  const grouped: Record<string, number> = { pending: 0, active: 0, done: 0, rejected: 0, cancelled: 0 };
  for (const [status, count] of Object.entries(breakdown)) {
    const group = STATUS_GROUP[status] || 'cancelled';
    grouped[group] += count;
  }

  // Placement status
  const placementExpired = seller?.placement_expired_at
    ? new Date(seller.placement_expired_at) < new Date()
    : false;
  const placementDate = seller?.placement_expired_at
    ? new Date(seller.placement_expired_at).toLocaleDateString('ru-RU')
    : null;

  return (
    <Modal isOpen onClose={onClose} title={`Аналитика: ${shopName}`} size="xl">
      {/* ── Section 1: Profile ── */}
      <div className="sam-section">
        <div className="sam-profile">
          <div className="sam-profile-main">
            <div className="sam-shop-name">{shopName}</div>
            {seller?.fio && <div className="sam-fio">{seller.fio}</div>}
            <div className="sam-badges">
              <span className={`sam-badge sam-badge--${seller?.subscription_plan || 'free'}`}>
                {planLabel(seller?.subscription_plan)}
              </span>
              {placementDate && (
                <span className={`sam-badge ${placementExpired ? 'sam-badge--expired' : 'sam-badge--active'}`}>
                  {placementExpired ? 'Истёк' : 'Активен'} до {placementDate}
                </span>
              )}
              {seller?.is_blocked && (
                <span className="sam-badge sam-badge--blocked">Заблокирован</span>
              )}
            </div>
          </div>
          <div className="sam-profile-meta">
            {seller?.phone && <span>{seller.phone}</span>}
            {seller?.inn && <span>ИНН: {seller.inn}</span>}
            {seller?.ogrn && <span>ОГРН: {seller.ogrn}</span>}
          </div>
        </div>
      </div>

      {/* ── Section 2: KPIs ── */}
      <div className="sam-section">
        <div className="sam-section-title">Показатели за период</div>
        <div className="sam-kpi-grid">
          <div className="sam-kpi">
            <div className="sam-kpi-label">Заказов</div>
            <div className="sam-kpi-value">{orders}</div>
          </div>
          <div className="sam-kpi">
            <div className="sam-kpi-label">Выручка</div>
            <div className="sam-kpi-value">{fmtCurrency(revenue)}</div>
          </div>
          <div className="sam-kpi sam-kpi--accent">
            <div className="sam-kpi-label">Комиссия 18%</div>
            <div className="sam-kpi-value">{fmtCurrency(commission)}</div>
          </div>
          <div className="sam-kpi">
            <div className="sam-kpi-label">Средний чек</div>
            <div className="sam-kpi-value">{fmtCurrency(avgCheck)}</div>
          </div>
          <div className="sam-kpi">
            <div className="sam-kpi-label">Доля платформы</div>
            <div className="sam-kpi-value">{sharePct}%</div>
          </div>
          <div className="sam-kpi">
            <div className="sam-kpi-label">Загрузка</div>
            <div className="sam-kpi-value">{maxOrders > 0 ? `${loadPct}%` : '—'}</div>
            {maxOrders > 0 && (
              <div className="sam-load-bar">
                <div
                  className={`sam-load-fill ${loadPct >= 100 ? 'sam-load-fill--danger' : loadPct >= 75 ? 'sam-load-fill--warning' : ''}`}
                  style={{ width: `${Math.min(loadPct, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Comparison ── */}
      <div className="sam-section">
        <div className="sam-section-title">Сравнение с платформой</div>
        <div className="sam-compare-grid">
          <div className="sam-compare-item">
            <div className="sam-compare-label">Средний чек</div>
            <div className="sam-compare-row">
              <span>Продавец</span>
              <span className="sam-compare-value">{fmtCurrency(avgCheck)}</span>
            </div>
            <div className="sam-compare-row">
              <span>Платформа</span>
              <span className="sam-compare-value">{fmtCurrency(platformAvgCheck)}</span>
            </div>
            <div className="sam-compare-row">
              <span>Разница</span>
              <span className={`sam-indicator ${avgCheckDiff > 0 ? 'sam-indicator--up' : avgCheckDiff < 0 ? 'sam-indicator--down' : 'sam-indicator--neutral'}`}>
                {avgCheckDiff > 0 ? '+' : ''}{avgCheckDiff}%
              </span>
            </div>
          </div>
          <div className="sam-compare-item">
            <div className="sam-compare-label">Доля выручки</div>
            <div className="sam-compare-row">
              <span>{sharePct}% от общей</span>
            </div>
            <div className="sam-load-bar" style={{ marginTop: 8 }}>
              <div className="sam-load-fill" style={{ width: `${Math.min(sharePct, 100)}%` }} />
            </div>
          </div>
          <div className="sam-compare-item">
            <div className="sam-compare-label">Объём заказов</div>
            <div className="sam-compare-row">
              <span>Продавец</span>
              <span className="sam-compare-value">{orders}</span>
            </div>
            <div className="sam-compare-row">
              <span>Платформа</span>
              <span className="sam-compare-value">{platformMetrics.orders}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Status Breakdown ── */}
      {loading ? (
        <div className="sam-section">
          <div className="sam-loading"><div className="loader" /></div>
        </div>
      ) : totalStatusOrders > 0 ? (
        <div className="sam-section">
          <div className="sam-section-title">Распределение заказов</div>
          <div className="sam-status-bar-wrap">
            <div className="sam-status-bar">
              {grouped.pending > 0 && (
                <div className="sam-status-bar-segment sam-status-bar-segment--pending" style={{ width: `${(grouped.pending / totalStatusOrders) * 100}%` }} />
              )}
              {grouped.active > 0 && (
                <div className="sam-status-bar-segment sam-status-bar-segment--active" style={{ width: `${(grouped.active / totalStatusOrders) * 100}%` }} />
              )}
              {grouped.done > 0 && (
                <div className="sam-status-bar-segment sam-status-bar-segment--done" style={{ width: `${(grouped.done / totalStatusOrders) * 100}%` }} />
              )}
              {grouped.rejected > 0 && (
                <div className="sam-status-bar-segment sam-status-bar-segment--rejected" style={{ width: `${(grouped.rejected / totalStatusOrders) * 100}%` }} />
              )}
              {grouped.cancelled > 0 && (
                <div className="sam-status-bar-segment sam-status-bar-segment--cancelled" style={{ width: `${(grouped.cancelled / totalStatusOrders) * 100}%` }} />
              )}
            </div>
          </div>
          <div className="sam-status-legend">
            {grouped.pending > 0 && (
              <div className="sam-legend-item"><div className="sam-legend-dot sam-legend-dot--pending" /><span>Ожидает ({grouped.pending})</span></div>
            )}
            {grouped.active > 0 && (
              <div className="sam-legend-item"><div className="sam-legend-dot sam-legend-dot--active" /><span>В работе ({grouped.active})</span></div>
            )}
            {grouped.done > 0 && (
              <div className="sam-legend-item"><div className="sam-legend-dot sam-legend-dot--done" /><span>Выполнен ({grouped.done})</span></div>
            )}
            {grouped.rejected > 0 && (
              <div className="sam-legend-item"><div className="sam-legend-dot sam-legend-dot--rejected" /><span>Отклонён ({grouped.rejected})</span></div>
            )}
            {grouped.cancelled > 0 && (
              <div className="sam-legend-item"><div className="sam-legend-dot sam-legend-dot--cancelled" /><span>Отменён ({grouped.cancelled})</span></div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Section 5: Recent Orders ── */}
      {!loading && ordersData && ordersData.orders.length > 0 && (
        <div className="sam-section">
          <div className="sam-section-title">Последние заказы</div>
          <table className="sam-orders-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Покупатель</th>
                <th className="text-right">Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {ordersData.orders.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.buyer_fio || `#${o.buyer_id}`}</td>
                  <td className="text-right">{fmtCurrency(o.total_price)}</td>
                  <td>
                    <span className={`sam-order-status sam-order-status--${o.status}`}>
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  </td>
                  <td>{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Section 6: Operational Status ── */}
      {seller && (
        <div className="sam-section">
          <div className="sam-section-title">Операционный статус</div>
          <div className="sam-ops-grid">
            <div className="sam-ops-item">
              <div className="sam-ops-label">Активных заказов</div>
              <div className="sam-ops-value">
                {activeOrders}{maxOrders > 0 ? ` / ${maxOrders}` : ''}
              </div>
            </div>
            <div className="sam-ops-item">
              <div className="sam-ops-label">Ожидают ответа</div>
              <div className="sam-ops-value">{seller.pending_requests ?? 0}</div>
            </div>
            <div className="sam-ops-item">
              <div className="sam-ops-label">Дневной лимит</div>
              <div className="sam-ops-value">{seller.default_daily_limit ?? '—'}</div>
            </div>
            {seller.weekly_schedule && Object.keys(seller.weekly_schedule).length > 0 && (
              <div className="sam-ops-item">
                <div className="sam-ops-label">Расписание</div>
                <div className="sam-ops-value" style={{ fontSize: 'var(--text-xs)' }}>
                  {Object.entries(seller.weekly_schedule)
                    .filter(([, v]) => v > 0)
                    .map(([day, limit]) => `${day}: ${limit}`)
                    .join(', ') || '—'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
