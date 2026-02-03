import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getOrders,
  acceptOrder,
  rejectOrder,
  updateOrderStatus,
  updateOrderPrice,
} from '../../api/sellerClient';
import type { SellerOrder } from '../../api/sellerClient';
import './SellerOrders.css';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
};

function formatItemsInfo(itemsInfo: string): string {
  return itemsInfo.replace(/\d+:/g, '').replace(/x\s*/g, ' × ');
}

export function SellerOrders() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'history'>(() => {
    if (initialTab === 'active') return 'active';
    if (initialTab === 'history') return 'history';
    return 'pending';
  });
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      let status: string | undefined;
      let date_from: string | undefined;
      let date_to: string | undefined;
      if (activeTab === 'pending') {
        status = 'pending';
      } else if (activeTab === 'active') {
        status = 'accepted,assembling,in_transit';
      } else {
        status = 'done,completed';
        if (dateFrom) date_from = dateFrom;
        if (dateTo) date_to = dateTo;
      }
      const data = await getOrders({ status, date_from, date_to });
      setOrders(data || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleAccept = async (order: SellerOrder) => {
    const price = order.total_price ?? 0;
    const msg = `Итоговая цена: ${price} ₽.\n\nПодтвердить принятие заказа? Покупатель увидит именно эту сумму.`;
    if (!confirm(msg)) return;
    try {
      await acceptOrder(order.id);
      loadOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleReject = async (orderId: number) => {
    if (!confirm('Отклонить заказ?')) return;
    try {
      await rejectOrder(orderId);
      loadOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      await updateOrderStatus(orderId, status);
      loadOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handlePriceChange = async (orderId: number) => {
    const num = parseFloat(newPrice);
    if (isNaN(num) || num < 0) {
      alert('Введите корректную сумму');
      return;
    }
    try {
      await updateOrderPrice(orderId, num);
      setEditingPrice(null);
      setNewPrice('');
      loadOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
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

  return (
    <div className="seller-orders-page">
      <h1 className="page-title">Заказы</h1>

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
      </div>

      {activeTab === 'pending' && orders.length > 0 && (
        <p className="orders-hint">Укажите итоговую цену для покупателя (при необходимости нажмите «Изменить цену»), затем примите или отклоните заказ.</p>
      )}
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

      {loading ? (
        <div className="orders-loading">
          <div className="loader" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card">
          <p className="empty-text">Нет заказов</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <div key={order.id} className="order-card card">
              <div className="order-header">
                <span className="order-id">Заказ #{order.id}</span>
                <span className={`order-status status-${order.status}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
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
                      {activeTab === 'pending' && (
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
                <p className="order-date">Создан: {formatDate(order.created_at)}</p>
              </div>
              {activeTab === 'pending' && (
                <div className="order-actions">
                  <button className="btn btn-primary" onClick={() => handleAccept(order)}>✅ Принять</button>
                  <button className="btn btn-secondary" onClick={() => handleReject(order.id)}>❌ Отклонить</button>
                </div>
              )}
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
          ))}
        </div>
      )}
    </div>
  );
}
