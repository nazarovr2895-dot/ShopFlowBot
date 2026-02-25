import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, TabBar, EmptyState, FormField, useToast, useConfirm } from '../../components/ui';
import {
  getOrders,
  acceptOrder,
  rejectOrder,
  updateOrderStatus,
  updateOrderPrice,
  getPreorderSummary,
  getProducts,
} from '../../api/sellerClient';
import type { SellerOrder, SellerProduct, PreorderSummary } from '../../api/sellerClient';
import { ProductPreviewModal } from './orders/ProductPreviewModal';
import { STATUS_LABELS, STATUS_ACTION_LABELS, isPickup } from './orders/constants';
import { OrderCardCompact } from './orders/OrderCardCompact';
import type { CardContext } from './orders/OrderCardCompact';
import { KanbanBoard } from './orders/KanbanBoard';
import { DateStrip } from './orders/DateStrip';
import './SellerOrders.css';

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [previewProduct, setPreviewProduct] = useState<SellerProduct | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [activeTab, preorderSubTab, dateFrom, dateTo, deliveryFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // --- Action handlers ---

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

  const handleProductClick = async (productId: number) => {
    try {
      const products = await getProducts();
      const found = products.find(p => p.id === productId);
      if (found) setPreviewProduct(found);
      else toast.warning('Товар не найден');
    } catch {
      toast.error('Не удалось загрузить товар');
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

    // Filter "done" orders: by selected date (completed_at), or last 24h when "Все"
    if (selectedDate) {
      filtered = filtered.filter(o => {
        if (o.status !== 'done') {
          // Non-done orders: filter by delivery_slot_date or created_at
          const dateStr = o.delivery_slot_date || o.created_at;
          if (!dateStr) return false;
          return dateStr.slice(0, 10) === selectedDate;
        }
        // Done orders: filter by completed_at
        if (!o.completed_at) return false;
        return o.completed_at.slice(0, 10) === selectedDate;
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
    onProductClick: handleProductClick,
  };

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
        onChange={(key) => {
          setActiveTab(key as MainTab);
          setDeliveryFilter('all');
          setSelectedDate(null);
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

      {/* Product preview modal */}
      <ProductPreviewModal
        product={previewProduct}
        onClose={() => setPreviewProduct(null)}
      />
    </div>
  );
}
