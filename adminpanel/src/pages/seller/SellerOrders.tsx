import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader, useToast, useConfirm } from '../../components/ui';
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
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

type MainTab = 'pending' | 'active' | 'history' | 'preorder';
type PreorderSubTab = 'requests' | 'waiting' | 'dashboard';

function formatItemsInfo(itemsInfo: string): string {
  return itemsInfo.replace(/\d+:/g, '').replace(/x\s*/g, ' × ');
}

/** Delivery badge component */
function DeliveryBadge({ type }: { type?: string }) {
  if (type === 'delivery') {
    return <span className="delivery-badge delivery-badge--delivery">🚚 Доставка</span>;
  }
  if (type === 'pickup') {
    return <span className="delivery-badge delivery-badge--pickup">📦 Самовывоз</span>;
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
    if (initialTab === 'active') return 'active';
    if (initialTab === 'history') return 'history';
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
          status = 'pending,accepted,assembling,in_transit,done,completed';
        }
      } else if (activeTab === 'pending') {
        status = 'pending';
        preorder = false; // Exclude preorders from regular pending
      } else if (activeTab === 'active') {
        status = 'accepted,assembling,in_transit';
      } else {
        status = 'done,completed';
        if (dateFrom) date_from = dateFrom;
        if (dateTo) date_to = dateTo;
      }
      const data = await getOrders({ status, date_from, date_to, preorder });
      setOrders(data || []);
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
          <span className={`order-status status-${order.status}`}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
      </div>
      {(order.buyer_fio || order.buyer_phone) && (
        <div className="order-buyer" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color, #eee)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {order.buyer_fio && <span>{order.buyer_fio}</span>}
          {order.buyer_phone && <span>{order.buyer_phone}</span>}
          {order.customer_id && (
            <Link to={`/customers/${order.customer_id}`} style={{ fontSize: '0.85rem' }}>Профиль клиента →</Link>
          )}
        </div>
      )}
      <div className="order-body">
        <p><strong>Товары:</strong> {formatItemsInfo(order.items_info)}</p>
        <p>
          <strong>Сумма:</strong>{' '}
          {editingPrice === order.id ? (
            <span className="price-edit">
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="form-input"
                style={{ width: '100px', display: 'inline-block' }}
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
                  className="btn btn-sm btn-secondary"
                  style={{ marginLeft: 8 }}
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
          )}
        </p>
        <p><strong>Доставка:</strong> {order.delivery_type === 'delivery' ? 'Доставка' : 'Самовывоз'}</p>
        {order.address && <p><strong>Адрес:</strong> {order.address}</p>}
        {order.is_preorder && order.preorder_delivery_date && (
          <p>
            <strong>Дата поставки:</strong> {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU')}
            {isPreorderWaiting && (() => {
              const cd = getDaysUntil(order.preorder_delivery_date);
              return <span className={cd.className}> — {cd.label}</span>;
            })()}
          </p>
        )}
        {(order.points_discount ?? 0) > 0 && (
          <p style={{ color: 'var(--accent, #e74c3c)' }}>
            <strong>Оплата баллами:</strong> −{order.points_discount} ₽ ({order.points_used} баллов)
          </p>
        )}
        {order.is_preorder && <span className="preorder-label">📅 Предзаказ</span>}
        <p className="order-date">Создан: {formatDate(order.created_at)}</p>
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

      {/* Actions for active orders */}
      {activeTab === 'active' && order.status === 'accepted' && (
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'assembling')}>📦 Собирается</button>
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'in_transit')}>🚚 В пути</button>
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
      {activeTab === 'active' && order.status === 'assembling' && (
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={() => handleStatusChange(order.id, 'in_transit')}>🚚 В пути</button>
          <button className="btn btn-primary" onClick={() => handleStatusChange(order.id, 'done')}>✅ Выполнен</button>
        </div>
      )}
      {activeTab === 'active' && order.status === 'in_transit' && (
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
      <div className="orders-tabs">
        <button
          className={`orders-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          📩 Запросы на покупку
        </button>
        <button
          className={`orders-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          ⚡ Активные заказы
        </button>
        <button
          className={`orders-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📋 История заказов
        </button>
        <button
          className={`orders-tab ${activeTab === 'preorder' ? 'active' : ''}`}
          onClick={() => setActiveTab('preorder')}
        >
          📅 Предзаказы
        </button>
      </div>

      {/* Preorder sub-tabs */}
      {activeTab === 'preorder' && (
        <div className="preorder-subtabs">
          <button
            className={`preorder-subtab ${preorderSubTab === 'requests' ? 'active' : ''}`}
            onClick={() => setPreorderSubTab('requests')}
          >
            📩 Запросы
          </button>
          <button
            className={`preorder-subtab ${preorderSubTab === 'waiting' ? 'active' : ''}`}
            onClick={() => setPreorderSubTab('waiting')}
          >
            ⏳ Ожидание
          </button>
          <button
            className={`preorder-subtab ${preorderSubTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setPreorderSubTab('dashboard')}
          >
            📊 Дашборд закупок
          </button>
        </div>
      )}

      {/* Dashboard for preorders */}
      {activeTab === 'preorder' && preorderSubTab === 'dashboard' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>📦 Дашборд закупок на дату</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Дата:</strong> {new Date(summary.date).toLocaleDateString('ru-RU')} &nbsp;|&nbsp;
                <strong>Заказов:</strong> {summary.total_orders} &nbsp;|&nbsp;
                <strong>Сумма:</strong> {summary.total_amount.toFixed(0)} ₽
              </p>
              {summary.items.length > 0 ? (
                <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
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

      {/* History date filter */}
      {activeTab === 'history' && (
        <div className="orders-date-filter card">
          <label>Период:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="form-input"
          />
          <span>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="form-input"
          />
        </div>
      )}

      {/* Orders list */}
      {activeTab === 'preorder' && preorderSubTab === 'dashboard' ? null : (
        loading ? (
          <div className="orders-loading">
            <div className="loader" />
          </div>
        ) : orders.length === 0 ? (
          <div className="card">
            <p className="empty-text">
              {isPreorderRequests ? 'Нет запросов на предзаказ' :
               isPreorderWaiting ? 'Нет ожидающих предзаказов' :
               'Нет заказов'}
            </p>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map(renderOrderCard)}
          </div>
        )
      )}
    </div>
  );
}
