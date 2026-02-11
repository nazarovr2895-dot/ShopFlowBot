import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisitedSeller } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState } from '../components';
import { isBrowser } from '../utils/environment';
import './MyFlowers.css';

export function MyFlowers() {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState<VisitedSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getFavoriteSellers();
        setSellers(data);
      } catch (e) {
        console.error(e);
        setSellers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loader centered />;

  if (sellers.length === 0) {
    const needsAuth = isBrowser() && !api.isAuthenticated();
    return (
      <div className="my-flowers-page">
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
      </div>
    );
  }

  return (
    <div className="my-flowers-page">
      <h1 className="my-flowers-page__title">Мои цветочные</h1>
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
    </div>
  );
}
