import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminOrders, getAdminOrderDetail, getProductImageUrl, getAllSellers, type AdminOrdersParams } from '../../api/adminClient';
import type { AdminOrder, AdminOrderDetail, AdminOrdersResponse, Seller } from '../../types';
import { PageHeader, StatusBadge, SearchInput, SlidePanel, DataRow, EmptyState } from '@shared/components/ui';
import { useDebounce } from '@shared/hooks/useDebounce';
import { formatDateTime, formatCurrency, formatPhone, formatAddress } from '@shared/utils/formatters';
import { Filter, ChevronLeft, ChevronRight, Eye, Package, Send, MessageCircle, Clock, Truck, MapPin, CreditCard, Gift, User, Store } from 'lucide-react';
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

const PAYMENT_LABEL: Record<string, string> = {
  online: 'Онлайн',
  on_pickup: 'При получении',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  succeeded: 'Оплачен',
  pending: 'Ожидает',
  canceled: 'Отменён',
  waiting_for_capture: 'Ожидает подтверждения',
};

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ── Order Detail Panel Content ── */
function OrderDetailPanel({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAdminOrderDetail(orderId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return <div className="ao-panel-loading"><div className="loader" /></div>;
  }

  if (!detail) {
    return <div className="ao-panel-error">Не удалось загрузить заказ</div>;
  }

  const deliverySlot = detail.delivery_slot_date
    ? `${detail.delivery_slot_date}${detail.delivery_slot_start ? `, ${detail.delivery_slot_start}` : ''}${detail.delivery_slot_end ? ` — ${detail.delivery_slot_end}` : ''}`
    : null;

  return (
    <div className="ao-panel-content">
      {/* Status */}
      <div className="ao-panel-status-row">
        <StatusBadge variant={STATUS_VARIANT[detail.status] || 'neutral'}>
          {STATUS_LABEL[detail.status] || detail.status}
        </StatusBadge>
        <span className="ao-panel-price">{formatCurrency(detail.total_price)}</span>
      </div>

      {detail.original_price && detail.original_price !== detail.total_price && (
        <div className="ao-panel-original-price">
          <span className="ao-panel-original-strike">{formatCurrency(detail.original_price)}</span>
          {detail.points_discount > 0 && (
            <span className="ao-panel-discount">-{formatCurrency(detail.points_discount)} баллами</span>
          )}
        </div>
      )}

      {/* Items */}
      <div className="ao-panel-section">
        <div className="ao-panel-section-title">
          <Package size={14} />
          Товары
        </div>
        <div className="ao-items-list">
          {detail.items.map((item, i) => {
            const imgUrl = getProductImageUrl(item.photo);
            return (
              <div key={i} className="ao-item-row">
                <div className="ao-item-photo">
                  {imgUrl ? (
                    <img src={imgUrl} alt={item.name} />
                  ) : (
                    <Package size={20} />
                  )}
                </div>
                <div className="ao-item-info">
                  <span className="ao-item-name">{item.name}</span>
                  <span className="ao-item-meta">
                    {formatCurrency(item.price)} × {item.quantity}
                  </span>
                </div>
                <span className="ao-item-total">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            );
          })}
        </div>
        {detail.delivery_fee != null && detail.delivery_fee > 0 && (
          <div className="ao-item-row ao-item-row--fee">
            <div className="ao-item-photo ao-item-photo--icon">
              <Truck size={20} />
            </div>
            <div className="ao-item-info">
              <span className="ao-item-name">Доставка</span>
            </div>
            <span className="ao-item-total">{formatCurrency(detail.delivery_fee)}</span>
          </div>
        )}
      </div>

      {/* Buyer */}
      <div className="ao-panel-section">
        <div className="ao-panel-section-title">
          <User size={14} />
          Покупатель
        </div>
        <DataRow label="Имя" value={detail.buyer_fio || `#${detail.buyer_id}`} />
        <DataRow label="Телефон" value={detail.buyer_phone ? formatPhone(detail.buyer_phone) : null} />
      </div>

      {/* Recipient (if different) */}
      {detail.recipient_name && (
        <div className="ao-panel-section">
          <div className="ao-panel-section-title">
            <Gift size={14} />
            Получатель
          </div>
          <DataRow label="Имя" value={detail.recipient_name} />
          <DataRow label="Телефон" value={detail.recipient_phone ? formatPhone(detail.recipient_phone) : null} />
        </div>
      )}

      {/* Delivery */}
      <div className="ao-panel-section">
        <div className="ao-panel-section-title">
          <MapPin size={14} />
          Доставка
        </div>
        <DataRow label="Тип" value={detail.delivery_type} />
        <DataRow label="Адрес" value={detail.address ? formatAddress(detail.address) : null} />
        <DataRow label="Слот" value={deliverySlot} />
        {detail.is_preorder && detail.preorder_delivery_date && (
          <DataRow label="Дата предзаказа" value={detail.preorder_delivery_date} />
        )}
      </div>

      {/* Payment */}
      <div className="ao-panel-section">
        <div className="ao-panel-section-title">
          <CreditCard size={14} />
          Оплата
        </div>
        <DataRow label="Способ" value={detail.payment_method ? (PAYMENT_LABEL[detail.payment_method] || detail.payment_method) : null} />
        <DataRow label="Статус" value={detail.payment_status ? (PAYMENT_STATUS_LABEL[detail.payment_status] || detail.payment_status) : null} />
      </div>

      {/* Gift note */}
      {detail.gift_note && (
        <div className="ao-panel-section">
          <div className="ao-panel-section-title">
            <Gift size={14} />
            Записка к заказу
          </div>
          <div className="ao-gift-note">{detail.gift_note}</div>
        </div>
      )}

      {/* Comment */}
      {detail.comment && (
        <div className="ao-panel-section">
          <div className="ao-panel-section-title">
            <MessageCircle size={14} />
            Комментарий
          </div>
          <div className="ao-comment">{detail.comment}</div>
        </div>
      )}

      {/* Seller */}
      <div className="ao-panel-section">
        <div className="ao-panel-section-title">
          <Store size={14} />
          Продавец
        </div>
        <DataRow label="Магазин" value={detail.seller_name} />
        <a
          href={`tg://user?id=${detail.seller_tg_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ao-tg-btn"
        >
          <Send size={14} />
          Написать в Telegram
        </a>
      </div>

      {/* Dates */}
      <div className="ao-panel-section ao-panel-section--last">
        <div className="ao-panel-section-title">
          <Clock size={14} />
          Даты
        </div>
        <DataRow label="Создан" value={formatDateTime(detail.created_at)} />
        <DataRow label="Завершён" value={detail.completed_at ? formatDateTime(detail.completed_at) : null} />
      </div>
    </div>
  );
}

/* ── Main Page ── */
export function AdminOrders() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Search
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  // Filters
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
      if (debouncedSearch) params.search = debouncedSearch;
      const result = await getAdminOrders(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [status, sellerId, dateFrom, dateTo, debouncedSearch, page]);

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
      <PageHeader
        title="Заказы"
        subtitle="Мониторинг всех заказов платформы"
        actions={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ID, имя, телефон..."
            className="ao-header-search"
          />
        }
      />

      {/* ── Summary ── */}
      {data && (
        <div className="ao-summary">
          <div className="ao-summary-item">
            <span className="ao-summary-label">Всего</span>
            <span className="ao-summary-value">{data.total}</span>
          </div>
          <div className="ao-summary-item">
            <span className="ao-summary-label">На сумму</span>
            <span className="ao-summary-value">{formatCurrency(data.total_amount)}</span>
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
        <span className="ao-sep">\u2014</span>
        <input type="date" className="ao-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button className="ao-btn" onClick={handleFilter}>Применить</button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="ao-loading"><div className="loader" /></div>
      ) : !data || data.orders.length === 0 ? (
        <EmptyState
          title="Нет заказов"
          message={search ? `По запросу «${search}» ничего не найдено` : 'Нет заказов по выбранным фильтрам'}
        />
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
                  <tr key={o.id} className={`ao-row ${selectedOrderId === o.id ? 'ao-row--active' : ''}`} onClick={() => setSelectedOrderId(o.id)}>
                    <td className="ao-cell-id">{o.id}</td>
                    <td className="ao-cell-date">{formatDateTime(o.created_at)}</td>
                    <td className="ao-cell-seller">{o.seller_name}</td>
                    <td className="ao-cell-buyer">
                      {o.buyer_fio || `#${o.buyer_id}`}
                      {o.buyer_phone && <span className="ao-phone">{o.buyer_phone}</span>}
                    </td>
                    <td className="ao-cell-price">{formatCurrency(o.total_price)}</td>
                    <td>
                      <StatusBadge variant={STATUS_VARIANT[o.status] || 'neutral'}>{STATUS_LABEL[o.status] || o.status}</StatusBadge>
                    </td>
                    <td className="ao-cell-type">
                      {o.is_preorder && <span className="ao-preorder-badge">Предзаказ</span>}
                      {o.delivery_type === 'Доставка' || o.delivery_type === 'delivery' ? '\uD83D\uDE9A' : '\uD83C\uDFEA'}
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

      {/* ── Order Detail SlidePanel ── */}
      <SlidePanel
        isOpen={selectedOrderId !== null}
        onClose={() => setSelectedOrderId(null)}
        title={selectedOrderId ? `Заказ #${selectedOrderId}` : ''}
      >
        {selectedOrderId && (
          <OrderDetailPanel orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
        )}
      </SlidePanel>
    </div>
  );
}
