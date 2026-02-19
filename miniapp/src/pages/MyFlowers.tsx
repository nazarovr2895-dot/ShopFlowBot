import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { VisitedSeller, PublicSellerListItem } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, MyFlowersNavBar, ShopCard } from '../components';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { isBrowser, isTelegram } from '../utils/environment';
import { OrdersTabContent } from './OrdersTabContent';
import './MyFlowers.css';

type TabType = 'flowers' | 'orders';

export function MyFlowers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: TabType = searchParams.get('tab') === 'orders' ? 'orders' : 'flowers';
  const setActiveTab = (tab: TabType) => setSearchParams({ tab });

  // Flowers state
  const [sellers, setSellers] = useState<VisitedSeller[]>([]);
  const [flowersLoading, setFlowersLoading] = useState(true);

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

  const renderFlowersTab = () => {
    if (flowersLoading) {
      return <Loader centered />;
    }

    if (sellers.length === 0) {
      const needsAuth = isBrowser() && !api.isAuthenticated();
      return (
        <>
          <EmptyState
            title="Здесь появятся ваши подписки"
            description={needsAuth ? 'Войдите, чтобы подписываться на магазины' : 'Подписывайтесь на магазины из каталога — нажимайте «Подписаться» на странице магазина'}
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
      <div className="my-flowers-grid">
        {sellers.map((s) => (
          <ShopCard key={s.seller_id} seller={s as unknown as PublicSellerListItem} />
        ))}
      </div>
    );
  };

  const isTelegramEnv = isTelegram();
  const isDesktop = useDesktopLayout();

  return (
    <div
      className={`my-flowers-page ${isTelegramEnv ? 'my-flowers-page--telegram' : ''} ${isDesktop ? 'my-flowers-page--desktop' : ''}`}
      data-telegram={isTelegramEnv}
    >
      {!isDesktop && <MyFlowersNavBar activeTab={activeTab} onTabChange={setActiveTab} />}

      <div className="my-flowers-page__content">
        {activeTab === 'flowers' ? renderFlowersTab() : <OrdersTabContent />}
      </div>
    </div>
  );
}
