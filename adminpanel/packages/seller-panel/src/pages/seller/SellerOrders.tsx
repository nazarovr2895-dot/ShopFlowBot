import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, TabBar, EmptyState, FormField, useToast, useConfirm } from '@shared/components/ui';
import {
  getOrders,
  acceptOrder,
  rejectOrder,
  updateOrderStatus,
  updateOrderPrice,
  getPreorderSummary,
  getProducts,
} from '../../api/sellerClient';
import type { SellerOrder, PreorderSummary } from '../../api/sellerClient';
import { STATUS_LABELS, STATUS_ACTION_LABELS, isPickup } from './orders/constants';
import { OrderCardCompact } from './orders/OrderCardCompact';
import type { CardContext } from './orders/OrderCardCompact';
import { KanbanBoard } from './orders/KanbanBoard';
import { DateStrip } from './orders/DateStrip';
import { useTabBadge } from '../../hooks/useTabBadge';
import './SellerOrders.css';

const POLL_INTERVAL_MS = 15_000;
const NOTIFICATION_TITLE = 'flurai';

type MainTab = 'pending' | 'awaiting_payment' | 'active' | 'history' | 'cancelled' | 'preorder';
type PreorderSubTab = 'requests' | 'waiting' | 'dashboard';
type DeliveryFilter = 'all' | 'pickup' | 'delivery';

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
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [summaryDate, setSummaryDate] = useState('');
  const [summary, setSummary] = useState<PreorderSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [newPendingCount, setNewPendingCount] = useState(0);
  const lastPendingIdsRef = useRef<Set<number> | null>(null);

  useTabBadge(newPendingCount);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let status: string | undefined;
      let date_from: string | undefined;
      let date_to: string | undefined;
      let preorder: boolean | undefined;

      if (activeTab === 'preorder') {
        preorder = true;
        if (preorderSubTab === 'requests') {
          status = 'pending';
        } else if (preorderSubTab === 'waiting') {
          status = 'accepted';
        } else {
          status = 'pending,accepted,assembling,in_transit,ready_for_pickup,done,completed';
        }
      } else if (activeTab === 'pending') {
        status = 'pending';
        preorder = false;
      } else if (activeTab === 'awaiting_payment') {
        status = 'accepted';
      } else if (activeTab === 'active') {
        // Include done for the kanban "Выполнен" column
        status = 'accepted,assembling,in_transit,ready_for_pickup,done';
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
        data = data.filter(o => o.payment_id && o.payment_status !== 'succeeded');
      } else if (activeTab === 'active') {
        // Exclude accepted orders that are awaiting payment
        data = data.filter(o =>
          o.status !== 'accepted' ||
          !o.payment_id ||
          o.payment_status === 'succeeded'
        );
      }

      // Client-side filtering by delivery type
      if (deliveryFilter !== 'all') {
        data = data.filter(o => {
          const pickup = isPickup(o.delivery_type);
          return deliveryFilter === 'pickup' ? pickup : !pickup;
        });
      }

      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab, preorderSubTab, dateFrom, dateTo, deliveryFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Capture pending order IDs when on the pending tab
  useEffect(() => {
    if (activeTab === 'pending' && !loading) {
      lastPendingIdsRef.current = new Set(orders.map(o => o.id));
      setNewPendingCount(0);
    }
  }, [activeTab, orders, loading]);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Poll for new pending orders every 15s
  useEffect(() => {
    const tick = async () => {
      try {
        const pending = await getOrders({ status: 'pending', preorder: false });
        const freshIds = new Set((pending || []).map(o => o.id));
        const prevIds = lastPendingIdsRef.current;

        // Always update ref to track current state
        lastPendingIdsRef.current = freshIds;

        if (prevIds === null) return; // First poll — just save state

        const newIds = [...freshIds].filter(id => !prevIds.has(id));

        if (newIds.length > 0) {
          if (activeTab === 'pending') {
            // User is looking at pending tab → silently refresh the list (no spinner)
            loadOrders(true);
          } else {
            // User is on another tab → show badge
            setNewPendingCount(prev => prev + newIds.length);
          }

          // Browser notification when tab is hidden
          if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
            const text = newIds.length === 1
              ? 'Новый запрос на покупку'
              : `Новых запросов: ${newIds.length}`;
            new Notification(NOTIFICATION_TITLE, { body: text });
          }
        }
      } catch {
        // ignore poll errors
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeTab, loadOrders]);

  // --- Action handlers ---

  const handleAccept = async (order: SellerOrder) => {
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
    const msg = STATUS_ACTION_LABELS[status] || `Сменить статус на "${STATUS_LABELS[status] || status}"?`;
    if (!await confirm({ message: msg })) return;
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

  // --- Derived state ---

  const isPreorderRequests = activeTab === 'preorder' && preorderSubTab === 'requests';
  const isPreorderWaiting = activeTab === 'preorder' && preorderSubTab === 'waiting';

  const cardContext: CardContext = useMemo(() => {
    if (activeTab === 'pending') return 'pending';
    if (activeTab === 'awaiting_payment') return 'awaiting_payment';
    if (activeTab === 'active') return 'active';
    if (activeTab === 'history') return 'history';
    if (activeTab === 'cancelled') return 'cancelled';
    if (isPreorderRequests) return 'preorder_requests';
    if (isPreorderWaiting) return 'preorder_waiting';
    return 'history';
  }, [activeTab, isPreorderRequests, isPreorderWaiting]);

  // Filter orders for kanban based on selected date + done filtering
  const kanbanOrders = useMemo(() => {
    if (activeTab !== 'active') return orders;

    let filtered = orders;

    // Helper: convert ISO string to local YYYY-MM-DD
    const toLocalDate = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Filter "done" orders: by selected date (completed_at), or last 24h when "Все"
    if (selectedDate) {
      filtered = filtered.filter(o => {
        if (o.status !== 'done') {
          const dateStr = o.delivery_slot_date || o.created_at;
          if (!dateStr) return false;
          return toLocalDate(dateStr) === selectedDate;
        }
        if (!o.completed_at) return false;
        return toLocalDate(o.completed_at) === selectedDate;
      });
    } else {
      // "Все" — limit done orders to last 24 hours
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      filtered = filtered.filter(o => {
        if (o.status !== 'done') return true;
        if (!o.completed_at) return false;
        return new Date(o.completed_at).getTime() >= cutoff;
      });
    }

    return filtered;
  }, [orders, selectedDate, activeTab]);

  // Shared card props
  const cardProps = {
    editingPrice,
    newPrice,
    onAccept: handleAccept,
    onReject: handleReject,
    onStatusChange: handleStatusChange,
    onEditPrice: (id: number, price: number) => { setEditingPrice(id); setNewPrice(String(price)); },
    onSavePrice: handlePriceChange,
    onCancelPrice: () => { setEditingPrice(null); setNewPrice(''); },
    onPriceChange: setNewPrice,
    loadProducts: getProducts,
  };

  return (
    <div className="seller-orders-page">
      <PageHeader title="Заказы" />

      {/* Main tabs */}
      <TabBar
        tabs={[
          { key: 'pending', label: 'Запросы', count: newPendingCount || undefined, countVariant: 'danger' as const },
          { key: 'awaiting_payment', label: '💳 Ожидает оплаты' },
          { key: 'active', label: 'Активные' },
          { key: 'history', label: 'История' },
          { key: 'cancelled', label: 'Отменённые' },
          { key: 'preorder', label: 'Предзаказы' },
        ]}
        activeTab={activeTab}
        onChange={(key) => {
          setActiveTab(key as MainTab);
          setDeliveryFilter('all');
          if (key === 'active') {
            const d = new Date();
            setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          } else {
            setSelectedDate(null);
          }
          if (key === 'pending') setNewPendingCount(0);
        }}
      />

      {/* Delivery type filter (all tabs except preorder and active) */}
      {activeTab !== 'preorder' && activeTab !== 'active' && (
        <TabBar
          size="small"
          tabs={[
            { key: 'all', label: 'Все' },
            { key: 'pickup', label: '📦 Самовывоз' },
            { key: 'delivery', label: '🚚 Доставка' },
          ]}
          activeTab={deliveryFilter}
          onChange={(key) => setDeliveryFilter(key as DeliveryFilter)}
        />
      )}

      {/* Active tab: delivery filter + date strip */}
      {activeTab === 'active' && (
        <>
          <TabBar
            size="small"
            tabs={[
              { key: 'all', label: 'Все' },
              { key: 'pickup', label: '📦 Самовывоз' },
              { key: 'delivery', label: '🚚 Доставка' },
            ]}
            activeTab={deliveryFilter}
            onChange={(key) => setDeliveryFilter(key as DeliveryFilter)}
          />
          {!loading && orders.length > 0 && (
            <DateStrip
              orders={orders}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
            />
          )}
        </>
      )}

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

      {/* Hints */}
      {activeTab === 'awaiting_payment' && orders.length > 0 && (
        <p className="orders-hint">Заказы приняты и ожидают оплаты покупателем. После оплаты заказ переместится в «Активные».</p>
      )}
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

      {/* Content area */}
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
        ) : activeTab === 'active' ? (
          <KanbanBoard orders={kanbanOrders} {...cardProps} />
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <OrderCardCompact
                key={order.id}
                order={order}
                context={cardContext}
                {...cardProps}
              />
            ))}
          </div>
        )
      )}

    </div>
  );
}
