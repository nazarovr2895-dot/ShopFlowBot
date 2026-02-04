import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisitedSeller } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState } from '../components';
import './VisitedSellers.css';

export function VisitedSellers() {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState<VisitedSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getVisitedSellers();
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
    return (
      <div className="visited-page">
        <EmptyState
          title="Вы пока не смотрели магазины"
          description="Откройте каталог и зайдите в любой магазин"
          icon="🕐"
        />
      </div>
    );
  }

  return (
    <div className="visited-page">
      <h1 className="visited-page__title">Вы смотрели</h1>
      <ul className="visited-list">
        {sellers.map((s) => (
          <li key={s.seller_id}>
            <button
              type="button"
              className="visited-card"
              onClick={() => navigate(`/shop/${s.seller_id}`)}
            >
              <span className="visited-card__name">{s.shop_name}</span>
              {s.owner_fio && (
                <span className="visited-card__owner">{s.owner_fio}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
