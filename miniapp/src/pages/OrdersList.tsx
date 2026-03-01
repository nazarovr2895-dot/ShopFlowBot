import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BuyerOrder } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, ProductImage } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { parseItemsDisplay, formatPrice } from '../utils/formatters';
import { ACTIVE_STATUSES, COMPLETED_STATUSES, STATUS_LABELS, STATUS_COLORS } from '../utils/orderConstants';
import './OrdersList.css';

type OrderTab = 'active' | 'completed';

export function OrdersList() {
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback } = useTelegramWebApp();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderTab>('active');

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

  const filteredOrders = useMemo(() => {
    const statusSet = activeTab === 'active' ? ACTIVE_STATUSES : COMPLETED_STATUSES;
    return orders.filter((o) => statusSet.has(o.status));
  }, [orders, activeTab]);

  const handleTabChange = (tab: OrderTab) => {
    hapticFeedback('light');
    setActiveTab(tab);
  };

  if (loading) return <Loader centered />;

  if (orders.length === 0) {
    return (
      <div className="orders-page">
        <EmptyState
          title="Заказов пока нет"
          description="Оформите заказ в каталоге"
          icon="📦"
        />
      </div>
    );
  }

  return (
    <div className="orders-page">
      <h1 className="orders-page__title">Мои заказы</h1>

      <div className="orders-page__tabs">
        <button
          type="button"
          className={`orders-page__tab ${activeTab === 'active' ? 'orders-page__tab--active' : ''}`}
          onClick={() => handleTabChange('active')}
        >
          Актуальные
        </button>
        <button
          type="button"
          className={`orders-page__tab ${activeTab === 'completed' ? 'orders-page__tab--active' : ''}`}
          onClick={() => handleTabChange('completed')}
        >
          Завершённые
        </button>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="orders-page__empty-tab">
          <span className="orders-page__empty-icon">
            {activeTab === 'active' ? '📋' : '📁'}
          </span>
          <p className="orders-page__empty-text">
            {activeTab === 'active' ? 'Нет активных заказов' : 'Нет завершённых заказов'}
          </p>
        </div>
      ) : (
        <ul className="orders-list">
          {filteredOrders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                className="order-card"
                onClick={() => navigate(`/order/${order.id}`)}
              >
                <div className="order-card__photo">
                  <ProductImage
                    src={api.getProductImageUrl(order.first_product_photo)}
                    alt={order.shop_name || 'Заказ'}
                    className="order-card__photo-img"
                    placeholderClassName="order-card__photo-placeholder"
                  />
                </div>
                <div className="order-card__content">
                  <div className="order-card__header">
                    <span className="order-card__shop">
                      {order.shop_name || 'Магазин'}
                    </span>
                    <span
                      className="order-card__status-badge"
                      style={{ color: STATUS_COLORS[order.status] || '#95a5a6' }}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="order-card__items">
                    {parseItemsDisplay(order.items_info)}
                  </p>
                  <div className="order-card__footer">
                    <span className="order-card__price">
                      {formatPrice(order.total_price)}
                    </span>
                    {/* Payment badge */}
                    {order.status === 'accepted' && order.payment_id && order.payment_status !== 'succeeded' && (
                      <span style={{ color: '#6c5ce7', fontWeight: 600, fontSize: '0.75rem' }}>
                        💳 Оплатить
                      </span>
                    )}
                    {order.payment_status === 'succeeded' && (
                      <span style={{ color: '#27ae60', fontWeight: 600, fontSize: '0.75rem' }}>
                        ✅ Оплачено
                      </span>
                    )}
                    {order.created_at && (
                      <span className="order-card__date">
                        {new Date(order.created_at).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
