import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BuyerOrder } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './OrdersList.css';

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Ожидает подтверждения',
  accepted: '✅ Принят',
  assembling: '📦 Собирается',
  in_transit: '🚚 В пути',
  done: '📬 Доставлен',
  completed: '✅ Получен',
  rejected: '❌ Отклонён',
};

export function OrdersList() {
  const navigate = useNavigate();
  const { setBackButton } = useTelegramWebApp();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBackButton(true, () => navigate('/profile'));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getMyOrders();
        setOrders(data);
      } catch (e) {
        console.error(e);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loader centered />;

  if (orders.length === 0) {
    return (
      <div className="orders-page">
        <EmptyState
          title="Заказов пока нет"
          description="Оформите заказ в корзине"
          icon="📦"
        />
      </div>
    );
  }

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="orders-page">
      <h1 className="orders-page__title">Мои заказы</h1>
      <ul className="orders-list">
        {orders.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              className="order-card"
              onClick={() => navigate(`/order/${order.id}`)}
            >
              <div className="order-card__header">
                <span className="order-card__id">Заказ #{order.id}</span>
                <span className="order-card__status">
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
              <p className="order-card__items">{order.items_info}</p>
              <div className="order-card__footer">
                {formatPrice(order.total_price)}
                {order.created_at && (
                  <span className="order-card__date">
                    {new Date(order.created_at).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
