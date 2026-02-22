import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminOrders, getAllSellers, type AdminOrdersParams } from '../../api/adminClient';
import type { AdminOrder, AdminOrdersResponse, Seller } from '../../types';
import { PageHeader, StatusBadge } from '../../components/ui';
import { Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import './AdminOrders.css';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'pending', label: 'Ожидает' },
  { value: 'accepted', label: 'Принят' },
  { value: 'assembling', label: 'Сборка' },
  { value: 'in_transit', label: 'Доставка' },
  { value: 'ready_for_pickup', label: 'Готов к выдаче' },
  { value: 'done', label: 'Готов' },
  { value: 'completed', label: 'Завершён' },
  { value: 'rejected', label: 'Отклонён' },
  { value: 'cancelled', label: 'Отменён' },
];

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  pending: 'warning',
  accepted: 'info',
  assembling: 'info',
  in_transit: 'info',
  ready_for_pickup: 'info',
  done: 'success',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Сборка',
  in_transit: 'Доставка',
  ready_for_pickup: 'Готов к выдаче',
  done: 'Готов',
  completed: 'Завершён',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AdminOrders() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  // Filters (initialize from URL search params if present)
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [sellerId, setSellerId] = useState(() => searchParams.get('seller_id') || '');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return toYYYYMMDD(d);
  });
  const [dateTo, setDateTo] = useState(() => toYYYYMMDD(new Date()));
  const [page, setPage] = useState(1);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: AdminOrdersParams = { page, per_page: 30 };
      if (status) params.status = status;
      if (sellerId) params.seller_id = Number(sellerId);
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await getAdminOrders(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [status, sellerId, dateFrom, dateTo, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    getAllSellers().then(setSellers).catch(() => setSellers([]));
  }, []);

  const handleFilter = () => {
    setPage(1);
    loadOrders();
  };

  return (
    <div className="admin-orders">
      <PageHeader title="Заказы" subtitle="Мониторинг всех заказов платформы" />

      {/* ── Summary ── */}
      {data && (
        <div className="ao-summary">
          <div className="ao-summary-item">
            <span className="ao-summary-label">Всего</span>
            <span className="ao-summary-value">{data.total}</span>
          </div>
          <div className="ao-summary-item">
            <span className="ao-summary-label">На сумму</span>
            <span className="ao-summary-value">{fmtCurrency(data.total_amount)}</span>
          </div>
          {Object.entries(data.status_breakdown).map(([s, count]) => (
            <div key={s} className="ao-summary-item">
              <StatusBadge variant={STATUS_VARIANT[s] || 'neutral'}>{STATUS_LABEL[s] || s}</StatusBadge>
              <span className="ao-summary-count">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="ao-filters">
        <Filter size={16} className="ao-filter-icon" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="ao-select">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sellerId} onChange={(e) => { setSellerId(e.target.value); setPage(1); }} className="ao-select ao-select--wide">
          <option value="">Все продавцы</option>
          {sellers.map((s) => <option key={s.tg_id} value={s.tg_id}>{s.shop_name || s.fio}</option>)}
        </select>
        <input type="date" className="ao-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="ao-sep">—</span>
        <input type="date" className="ao-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button className="ao-btn" onClick={handleFilter}>Применить</button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="ao-loading"><div className="loader" /></div>
      ) : !data || data.orders.length === 0 ? (
        <div className="ao-empty">Нет заказов по выбранным фильтрам</div>
      ) : (
        <>
          <div className="ao-table-wrap">
            <table className="ao-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Дата</th>
                  <th>Продавец</th>
                  <th>Покупатель</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Тип</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="ao-row" onClick={() => setSelectedOrder(o)}>
                    <td className="ao-cell-id">{o.id}</td>
                    <td className="ao-cell-date">{fmtDate(o.created_at)}</td>
                    <td className="ao-cell-seller">{o.seller_name}</td>
                    <td className="ao-cell-buyer">
                      {o.buyer_fio || `#${o.buyer_id}`}
                      {o.buyer_phone && <span className="ao-phone">{o.buyer_phone}</span>}
                    </td>
                    <td className="ao-cell-price">{fmtCurrency(o.total_price)}</td>
                    <td>
                      <StatusBadge variant={STATUS_VARIANT[o.status] || 'neutral'}>{STATUS_LABEL[o.status] || o.status}</StatusBadge>
                    </td>
                    <td className="ao-cell-type">
                      {o.is_preorder && <span className="ao-preorder-badge">Предзаказ</span>}
                      {o.delivery_type === 'Доставка' || o.delivery_type === 'delivery' ? '🚚' : '🏪'}
                    </td>
                    <td><Eye size={14} className="ao-eye" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="ao-pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="ao-page-btn">
                <ChevronLeft size={16} />
              </button>
              <span className="ao-page-info">
                {page} из {data.pages}
              </span>
              <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="ao-page-btn">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Order Detail Modal ── */}
      {selectedOrder && (
        <div className="ao-modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="ao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ao-modal-header">
              <h3>Заказ #{selectedOrder.id}</h3>
              <button className="ao-modal-close" onClick={() => setSelectedOrder(null)}>&times;</button>
            </div>
            <div className="ao-modal-body">
              <div className="ao-detail-grid">
                <div className="ao-detail-row">
                  <span className="ao-detail-label">Статус</span>
                  <StatusBadge variant={STATUS_VARIANT[selectedOrder.status] || 'neutral'}>{STATUS_LABEL[selectedOrder.status] || selectedOrder.status}</StatusBadge>
                </div>
                <div className="ao-detail-row">
                  <span className="ao-detail-label">Дата</span>
                  <span>{fmtDate(selectedOrder.created_at)}</span>
                </div>
                <div className="ao-detail-row">
                  <span className="ao-detail-label">Продавец</span>
                  <span>{selectedOrder.seller_name}</span>
                </div>
                <div className="ao-detail-row">
                  <span className="ao-detail-label">Покупатель</span>
                  <span>{selectedOrder.buyer_fio || `#${selectedOrder.buyer_id}`} {selectedOrder.buyer_phone && `(${selectedOrder.buyer_phone})`}</span>
                </div>
                <div className="ao-detail-row">
                  <span className="ao-detail-label">Сумма</span>
                  <span className="ao-detail-price">{fmtCurrency(selectedOrder.total_price)}</span>
                </div>
                {selectedOrder.original_price && selectedOrder.original_price !== selectedOrder.total_price && (
                  <div className="ao-detail-row">
                    <span className="ao-detail-label">Исходная цена</span>
                    <span className="ao-detail-original">{fmtCurrency(selectedOrder.original_price)}</span>
                  </div>
                )}
                {selectedOrder.points_discount > 0 && (
                  <div className="ao-detail-row">
                    <span className="ao-detail-label">Скидка баллами</span>
                    <span>-{fmtCurrency(selectedOrder.points_discount)}</span>
                  </div>
                )}
                <div className="ao-detail-row">
                  <span className="ao-detail-label">Тип доставки</span>
                  <span>{selectedOrder.delivery_type || '—'}</span>
                </div>
                {selectedOrder.address && (
                  <div className="ao-detail-row">
                    <span className="ao-detail-label">Адрес</span>
                    <span>{selectedOrder.address}</span>
                  </div>
                )}
                {selectedOrder.comment && (
                  <div className="ao-detail-row">
                    <span className="ao-detail-label">Комментарий</span>
                    <span>{selectedOrder.comment}</span>
                  </div>
                )}
                {selectedOrder.is_preorder && selectedOrder.preorder_delivery_date && (
                  <div className="ao-detail-row">
                    <span className="ao-detail-label">Дата предзаказа</span>
                    <span>{selectedOrder.preorder_delivery_date}</span>
                  </div>
                )}
                {selectedOrder.completed_at && (
                  <div className="ao-detail-row">
                    <span className="ao-detail-label">Завершён</span>
                    <span>{fmtDate(selectedOrder.completed_at)}</span>
                  </div>
                )}
              </div>
              <div className="ao-detail-items">
                <div className="ao-detail-label">Товары</div>
                <pre className="ao-items-pre">{selectedOrder.items_info}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
