import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Loader } from '../components';
import './Profile.css';

export function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{
    tg_id: number;
    fio?: string;
    username?: string;
    city_id?: number;
    district_id?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getCurrentUser();
        setUser(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loader centered />;

  return (
    <div className="profile-page">
      <h1 className="profile-page__title">Профиль</h1>
      {user && (
        <div className="profile-card">
          <div className="profile-card__row">
            <span className="profile-card__label">Имя</span>
            <span className="profile-card__value">{user.fio || '—'}</span>
          </div>
          {user.username && (
            <div className="profile-card__row">
              <span className="profile-card__label">Username</span>
              <span className="profile-card__value">@{user.username}</span>
            </div>
          )}
        </div>
      )}
      <nav className="profile-nav">
        <button
          type="button"
          className="profile-nav__item"
          onClick={() => navigate('/orders')}
        >
          <span className="profile-nav__icon">📦</span>
          <span>Мои заказы</span>
          <span className="profile-nav__arrow">›</span>
        </button>
      </nav>
    </div>
  );
}
