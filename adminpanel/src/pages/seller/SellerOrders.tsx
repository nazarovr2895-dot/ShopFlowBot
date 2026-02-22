import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader, TabBar, StatusBadge, DataRow, EmptyState, FormField, useToast, useConfirm } from '../../components/ui';
import {
  getOrders,
  acceptOrder,
  rejectOrder,
  updateOrderStatus,
  updateOrderPrice,
  getPreorderSummary,
} from '../../api/sellerClient';
import type { SellerOrder, PreorderSummary } from '../../api/sellerClient';
import './SellerOrders.css';

const STATUS_LABELS: Record<string, string> = {
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

type MainTab = 'pending' | 'awaiting_payment' | 'active' | 'history' | 'cancelled' | 'preorder';
type PreorderSubTab = 'requests' | 'waiting' | 'dashboard';

function formatItemsInfo(itemsInfo: string): string {
  return itemsInfo.replace(/\d+:/g, '').replace(/x\s*/g, ' × ');
}

function getStatusVariant(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (['done', 'completed'].includes(status)) return 'success';
  if (['rejected', 'cancelled'].includes(status)) return 'danger';
  if (status === 'pending') return 'warning';
  if (['accepted', 'assembling', 'in_transit', 'ready_for_pickup'].includes(status)) return 'info';
  return 'neutral';
}

/** Normalize delivery type: 'самовывоз'/'pickup' → true */
function isPickup(type?: string): boolean {
  if (!type) return false;
  const v = type.trim().toLowerCase();
  return v === 'pickup' || v === 'самовывоз';
}

/** Delivery badge component */
function DeliveryBadge({ type }: { type?: string }) {
  if (isPickup(type)) {
    return <span className="delivery-badge delivery-badge--pickup">📦 Самовывоз</span>;
  }
  if (type) {
    return <span className="delivery-badge delivery-badge--delivery">🚚 Доставка</span>;
  }
  return null;
}

/** Days-until countdown helper */
function getDaysUntil(dateStr: string): { days: number; label: string; className: string } {
  const target = new Date(dateStr);
  const now = new Date();
  // Compare dates only (strip time)
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = targetDate.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) return { days, label: `${Math.abs(days)} дн. назад`, className: 'waiting-countdown waiting-countdown--overdue' };
  if (days === 0) return { days, label: 'Сегодня — готов к сборке!', className: 'waiting-countdown waiting-countdown--today' };
  if (days === 1) return { days, label: 'Завтра!', className: 'waiting-countdown waiting-countdown--tomorrow' };
  return { days, label: `через ${days} дн.`, className: 'waiting-countdown' };
}

export function SellerOrders() {
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    if (initialTab === 'awaiting_payment') return 'awaiting_payment';
    if (initialTab === 'active') return 'active';
    if (initialTab === 'history') return 'history';
    if (initialTab === 'cancelled') return 'cancelled';
    if (initialTab === 'preorder') return 'preorder';
    return 'pending';
  });
  const [preorderSubTab, setPreorderSubTab] = useState<PreorderSubTab>('requests');
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [summaryDate, setSummaryDate] = useState('');
  const [summary, setSummary] = useState<PreorderSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      let status: string | undefined;
      let date_from: string | undefined;
      let date_to: string | undefined;
      let preorder: boolean | undefined;

      if (activeTab === 'preorder') {
        preorder = true;
        // Load based on sub-tab
        if (preorderSubTab === 'requests') {
          status = 'pending';
        } else if (preorderSubTab === 'waiting') {
          status = 'accepted';
        } else {
          // dashboard — load all preorder statuses for context
          status = 'pending,accepted,assembling,in_transit,ready_for_pickup,done,completed';
        }
      } else if (activeTab === 'pending') {
        status = 'pending';
        preorder = false; // Exclude preorders from regular pending
      } else if (activeTab === 'awaiting_payment') {
        status = 'accepted';
      } else if (activeTab === 'active') {
        status = 'accepted,assembling,in_transit,ready_for_pickup';
      } else if (activeTab === 'cancelled') {
        status = 'cancelled';
        if (dateFrom) date_from = dateFrom;
        if (dateTo) date_to = dateTo;
      } else {
        status = 'done,completed';
        if (dateFrom) date_from = dateFrom;
        if (dateTo) date_to = dateTo;
      }
      let data = await getOrders({ status, date_from, date_to, preorder });
      data = data || [];

      // Client-side filtering for payment-related tabs
      if (activeTab === 'awaiting_payment') {
        // Show only accepted orders that have a payment pending (not yet paid)
        data = data.filter(o => o.payment_id && o.payment_status !== 'succeeded');
      } else if (activeTab === 'active') {
        // Exclude accepted orders that are awaiting payment
        data = data.filter(o =>
          o.status !== 'accepted' ||
          !o.payment_id ||
          o.payment_status === 'succeeded'
        );
      }

      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, preorderSubTab, dateFrom, dateTo]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleAccept = async (order: SellerOrder) => {
    const price = order.total_price ?? 0;
    const msg = `Итоговая цена: ${price} ₽.\n\nПодтвердить принятие заказа? Покупатель увидит именно эту сумму.`;
    if (!await confirm({ message: msg })) return;
    try {
      await acceptOrder(order.id);
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleReject = async (orderId: number) => {
    if (!await confirm({ message: 'Отклонить заказ?' })) return;
    try {
      await rejectOrder(orderId);
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      await updateOrderStatus(orderId, status);
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handlePriceChange = async (orderId: number) => {
    const num = parseFloat(newPrice);
    if (isNaN(num) || num < 0) {
      toast.warning('Введите корректную сумму');
      return;
    }
    try {
      await updateOrderPrice(orderId, num);
      setEditingPrice(null);
      setNewPrice('');
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('ru');
    } catch {
      return iso;
    }
  };

  const loadSummary = async (date: string) => {
    if (!date) return;
    setSummaryLoading(true);
    try {
      const data = await getPreorderSummary(date);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  /** Determine if order card should show accept/reject for preorder requests sub-tab */
  const isPreorderRequests = activeTab === 'preorder' && preorderSubTab === 'requests';
  const isPreorderWaiting = activeTab === 'preorder' && preorderSubTab === 'waiting';

  /** Render order card (shared between all tabs) */
  const renderOrderCard = (order: SellerOrder) => (
    <div key={order.id} className="order-card card">
      <div className="order-header">
        <span className="order-id">Заказ #{order.id}</span>
        <div className="order-header__badges">
          <DeliveryBadge type={order.delivery_type} />
          <StatusBadge variant={getStatusVariant(order.status)}>
            {STATUS_LABELS[order.status] || order.status}
          </StatusBadge>
          {order.payment_status === 'succeeded' && (
            <StatusBadge variant="success">✅ Оплачено</StatusBadge>
          )}
          {order.payment_id && order.payment_status !== 'succeeded' && activeTab === 'awaiting_payment' && (
            <StatusBadge variant="warning">💳 Ожидает оплаты</StatusBadge>
          )}
        </div>
      </div>
      {(order.buyer_fio || order.buyer_phone) && (
        <div className="order-buyer-info">
          {order.buyer_fio && <span>{order.buyer_fio}</span>}
          {order.buyer_phone && <span>{order.buyer_phone}</span>}
          {order.customer_id && (
            <Link to={`/customers/${order.customer_id}`} className="order-buyer-link">Профиль клиента →</Link>
          )}
        </div>
      )}
      <div className="order-data-rows">
        <DataRow label="Товары" value={formatItemsInfo(order.items_info)} />
        <DataRow
          label="Сумма"
          accent
          value={
            editingPrice === order.id ? (
              <span className="price-edit">
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="form-input price-edit-input"
                />
                <button className="btn btn-sm btn-primary" onClick={() => handlePriceChange(order.id)}>OK</button>
                <button className="btn btn-sm btn-secondary" onClick={() => { setEditingPrice(null); setNewPrice(''); }}>Отмена</button>
              </span>
            ) : (
              <>
                {order.total_price} ₽
                {order.original_price != null && Math.abs((order.original_price ?? 0) - (order.total_price ?? 0)) > 0.01 && (
                  <span className="original-price"> (было: {order.original_price} ₽)</span>
                )}
                {(activeTab === 'pending' || isPreorderRequests) && (
                  <button
                    className="btn btn-sm btn-secondary price-change-btn"
                    onClick={() => {
                      setEditingPrice(order.id);
                      setNewPrice(String(order.total_price ?? ''));
                    }}
                    title="Укажите итоговую цену перед принятием заказа"
                  >
                    Изменить цену
                  </button>
                )}
              </>
            )
          }
        />
        <DataRow label="Доставка" value={isPickup(order.delivery_type) ? 'Самовывоз' : 'Доставка'} />
        <DataRow label="Адрес" value={order.address} />
        {order.is_preorder && order.preorder_delivery_date && (
          <DataRow
            label="Дата поставки"
            value={
              <>
                {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU')}
                {isPreorderWaiting && (() => {
                  const cd = getDaysUntil(order.preorder_delivery_date);
                  return <span className={cd.className}> — {cd.label}</span>;
                })()}
              </>
            }
          />
        )}
        {(order.points_discount ?? 0) > 0 && (
          <DataRow
            label="Оплата баллами"
            value={<span className="points-discount">−{order.points_discount} ₽ ({order.points_used} баллов)</span>}
          />
        )}
        {order.is_preorder && <span className="preorder-label">Предзаказ</span>}
        <DataRow label="Создан" value={formatDate(order.created_at)} muted />
      </div>

      {/* Actions for regular pending */}
      {activeTab === 'pending' && (
        <div className="order-actions">
          <button className="btn btn-primary" onClick={() => handleAccept(order)}>✅ Принять</button>
          <button className="btn btn-secondary" onClick={() => handleReject(order.id)}>❌ Отклонить</button>
        </div>
      )}

      {/* Actions for preorder requests */}
      {isPreorderRequests && (
        <div className="order-actions">
          <button className="btn btn-primary" onClick={() => handleAccept(order)}>✅ Принять предзаказ</button>
          <button className="btn btn-secondary" onClick={() => handleReject(order.id)}>❌ Отклонить</button>
        </div>
      )}

      {/* Actions for preorder waiting — "Собирать" when date arrived */}
      {isPreorderWaiting && order.preorder_delivery_date && (() => {
        const cd = getDaysUntil(order.preorder_delivery_date);
        if (cd.days <= 0) {
          return (
            <div className="order-actions">
              <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'assembling')}>📦 Собирать</button>
            </div>
          );
        }
        return null;
      })()}

      {/* Actions for active orders — delivery */}
      {activeTab === 'active' && !isPickup(order.delivery_type) && order.status === 'accepted' && (
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'assembling')}>📦 Собирается</button>
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'in_transit')}>🚚 В пути</button>
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
      {activeTab === 'active' && !isPickup(order.delivery_type) && order.status === 'assembling' && (
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'in_transit')}>🚚 В пути</button>
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
      {activeTab === 'active' && !isPickup(order.delivery_type) && order.status === 'in_transit' && (
        <div className="order-actions">
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}

      {/* Actions for active orders — pickup (самовывоз) */}
      {activeTab === 'active' && isPickup(order.delivery_type) && order.status === 'accepted' && (
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'assembling')}>📦 Собирается</button>
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'ready_for_pickup')}>✅ Готов к выдаче</button>
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
      {activeTab === 'active' && isPickup(order.delivery_type) && order.status === 'assembling' && (
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'ready_for_pickup')}>✅ Готов к выдаче</button>
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
      {activeTab === 'active' && isPickup(order.delivery_type) && order.status === 'ready_for_pickup' && (
        <div className="order-actions">
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="seller-orders-page">
      <PageHeader title="Заказы" />

      {/* Main tabs */}
      <TabBar
        tabs={[
          { key: 'pending', label: 'Запросы' },
          { key: 'awaiting_payment', label: '💳 Ожидает оплаты' },
          { key: 'active', label: 'Активные' },
          { key: 'history', label: 'История' },
          { key: 'cancelled', label: 'Отменённые' },
          { key: 'preorder', label: 'Предзаказы' },
        ]}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as MainTab)}
      />

      {/* Preorder sub-tabs */}
      {activeTab === 'preorder' && (
        <TabBar
          size="small"
          tabs={[
            { key: 'requests', label: 'Запросы' },
            { key: 'waiting', label: 'Ожидание' },
            { key: 'dashboard', label: 'Дашборд закупок' },
          ]}
          activeTab={preorderSubTab}
          onChange={(key) => setPreorderSubTab(key as PreorderSubTab)}
        />
      )}

      {/* Dashboard for preorders */}
      {activeTab === 'preorder' && preorderSubTab === 'dashboard' && (
        <div className="card preorder-dashboard-card">
          <h3 className="preorder-dashboard-title">📦 Дашборд закупок на дату</h3>
          <div className="preorder-dashboard-controls">
            <input
              type="date"
              value={summaryDate}
              onChange={(e) => setSummaryDate(e.target.value)}
              className="form-input"
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!summaryDate || summaryLoading}
              onClick={() => loadSummary(summaryDate)}
            >
              {summaryLoading ? 'Загрузка...' : 'Показать'}
            </button>
          </div>
          {summary && (
            <div className="preorder-dashboard-result">
              <p className="preorder-dashboard-summary">
                <strong>Дата:</strong> {new Date(summary.date).toLocaleDateString('ru-RU')} &nbsp;|&nbsp;
                <strong>Заказов:</strong> {summary.total_orders} &nbsp;|&nbsp;
                <strong>Сумма:</strong> {summary.total_amount.toFixed(0)} ₽
              </p>
              {summary.items.length > 0 ? (
                <div className="table-wrap preorder-dashboard-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Кол-во</th>
                        <th>Заказов</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.items.map((item) => (
                        <tr key={item.product_id}>
                          <td>{item.product_name}</td>
                          <td>{item.total_quantity}</td>
                          <td>{item.orders_count}</td>
                          <td>{item.total_amount.toFixed(0)} ₽</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-text">Нет принятых предзаказов на эту дату</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hint for awaiting payment */}
      {activeTab === 'awaiting_payment' && orders.length > 0 && (
        <p className="orders-hint">Заказы приняты и ожидают оплаты покупателем. После оплаты заказ переместится в «Активные».</p>
      )}

      {/* Hint for pending requests */}
      {activeTab === 'pending' && orders.length > 0 && (
        <p className="orders-hint">Укажите итоговую цену для покупателя (при необходимости нажмите «Изменить цену»), затем примите или отклоните заказ.</p>
      )}
      {isPreorderRequests && orders.length > 0 && (
        <p className="orders-hint">Новые запросы на предзаказ. Примите или отклоните заказ.</p>
      )}
      {isPreorderWaiting && orders.length > 0 && (
        <p className="orders-hint">Принятые предзаказы ожидают дату поставки. Когда дата наступит — нажмите «Собирать» для перевода в активные.</p>
      )}
      {activeTab === 'cancelled' && orders.length > 0 && (
        <p className="orders-hint">Заказы, отменённые покупателями до отправки. Товар и баллы лояльности были возвращены автоматически.</p>
      )}

      {/* History / Cancelled date filter */}
      {(activeTab === 'history' || activeTab === 'cancelled') && (
        <div className="orders-date-filter card">
          <FormField label="С">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="form-input"
            />
          </FormField>
          <FormField label="По">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="form-input"
            />
          </FormField>
        </div>
      )}

      {/* Orders list */}
      {activeTab === 'preorder' && preorderSubTab === 'dashboard' ? null : (
        loading ? (
          <div className="orders-loading">
            <div className="loader" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title={isPreorderRequests ? 'Нет запросов на предзаказ' :
                   isPreorderWaiting ? 'Нет ожидающих предзаказов' :
                   activeTab === 'awaiting_payment' ? 'Нет заказов, ожидающих оплаты' :
                   activeTab === 'cancelled' ? 'Нет отменённых заказов' :
                   'Нет заказов'}
            message={activeTab === 'awaiting_payment'
              ? 'Здесь будут заказы, которые приняты, но ещё не оплачены покупателем'
              : activeTab === 'cancelled'
              ? 'Здесь будут заказы, которые покупатели отменили до отправки'
              : 'Заказы появятся здесь, когда покупатели оформят покупку'}
          />
        ) : (
          <div className="orders-list">
            {orders.map(renderOrderCard)}
          </div>
        )
      )}
    </div>
  );
}
