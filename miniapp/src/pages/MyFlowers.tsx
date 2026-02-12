import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisitedSeller, BuyerOrder } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, MyFlowersNavBar } from '../components';
import { isBrowser, isTelegram } from '../utils/environment';
import './MyFlowers.css';

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Ожидает подтверждения',
  accepted: '✅ Принят',
  assembling: '📦 Собирается',
  in_transit: '🚚 В пути',
  done: '📬 Доставлен',
  completed: '✅ Получен',
  rejected: '❌ Отклонён',
};

type TabType = 'flowers' | 'orders';

export function MyFlowers() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('flowers');
  
  // Flowers state
  const [sellers, setSellers] = useState<VisitedSeller[]>([]);
  const [flowersLoading, setFlowersLoading] = useState(true);
  
  // Orders state
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Load flowers
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getFavoriteSellers();
        setSellers(data);
      } catch (e) {
        console.error(e);
        setSellers([]);
      } finally {
        setFlowersLoading(false);
      }
    };
    load();
  }, []);

  // Load orders
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getMyOrders();
        setOrders(data);
      } catch (e) {
        console.error(e);
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    };
    load();
  }, []);

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

  const renderFlowersTab = () => {
    if (flowersLoading) {
      return <Loader centered />;
    }

    if (sellers.length === 0) {
      const needsAuth = isBrowser() && !api.isAuthenticated();
      return (
        <>
          <EmptyState
            title="Здесь появятся ваши цветочные"
            description={needsAuth ? 'Войдите, чтобы сохранять любимые магазины' : 'Добавляйте их из каталога — нажимайте «Добавить в мои цветочные» на странице магазина'}
            icon="🌸"
          />
          {needsAuth ? (
            <button
              type="button"
              className="my-flowers-page__catalog-link"
              onClick={() => navigate('/profile')}
            >
              Войти в профиль
            </button>
          ) : (
            <button
              type="button"
              className="my-flowers-page__catalog-link"
              onClick={() => navigate('/catalog')}
            >
              Перейти в каталог
            </button>
          )}
        </>
      );
    }

    return (
      <ul className="my-flowers-list">
        {sellers.map((s) => (
          <li key={s.seller_id}>
            <button
              type="button"
              className="my-flowers-card"
              onClick={() => navigate(`/shop/${s.seller_id}`)}
            >
              <span className="my-flowers-card__name">{s.shop_name}</span>
              {s.owner_fio && (
                <span className="my-flowers-card__owner">{s.owner_fio}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderOrdersTab = () => {
    if (ordersLoading) {
      return <Loader centered />;
    }

    if (orders.length === 0) {
      return (
        <EmptyState
          title="Заказов пока нет"
          description="Оформите заказ в корзине"
          icon="📦"
        />
      );
    }

    return (
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
    );
  };

  const isTelegramEnv = isTelegram();

  return (
    <div 
      className={`my-flowers-page ${isTelegramEnv ? 'my-flowers-page--telegram' : ''}`}
      data-telegram={isTelegramEnv}
    >
      <MyFlowersNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="my-flowers-page__content">
        {activeTab === 'flowers' ? renderFlowersTab() : renderOrdersTab()}
      </div>
    </div>
  );
}
