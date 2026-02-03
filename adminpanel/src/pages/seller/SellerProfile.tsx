import { useEffect, useState } from 'react';
import { getMe } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
import './SellerProfile.css';

const DELIVERY_LABELS: Record<string, string> = {
  pickup: 'Самовывоз',
  delivery: 'Доставка',
  both: 'Оба',
};

const DISTRICTS_MSK: { id: number; name: string }[] = [
  { id: 1, name: 'ЦАО' }, { id: 2, name: 'САО' }, { id: 3, name: 'СВАО' },
  { id: 4, name: 'ВАО' }, { id: 5, name: 'ЮВАО' }, { id: 6, name: 'ЮАО' },
  { id: 7, name: 'ЮЗАО' }, { id: 8, name: 'ЗАО' }, { id: 9, name: 'СЗАО' },
  { id: 10, name: 'Зеленоградский' }, { id: 11, name: 'Новомосковский' }, { id: 12, name: 'Троицкий' },
];

function formatDate(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru');
  } catch {
    return iso;
  }
}

export function SellerProfile() {
  const [profile, setProfile] = useState<SellerMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="seller-profile-loading">
        <div className="loader" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="seller-profile-page">
        <h1 className="page-title">Профиль</h1>
        <div className="card">
          <p className="empty-text">Не удалось загрузить данные</p>
        </div>
      </div>
    );
  }

  const districtName = DISTRICTS_MSK.find((d) => d.id === profile.district_id)?.name ?? profile.district_id ?? '—';

  return (
    <div className="seller-profile-page">
      <h1 className="page-title">Профиль</h1>

      <div className="card profile-card">
        <h3>Личные данные</h3>
        <div className="profile-grid">
          <div className="profile-row">
            <span className="profile-label">Telegram ID</span>
            <span className="profile-value"><code>{profile.seller_id}</code></span>
          </div>
          <div className="profile-row">
            <span className="profile-label">ФИО</span>
            <span className="profile-value">{profile.fio || '—'}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Телефон</span>
            <span className="profile-value">{profile.phone || '—'}</span>
          </div>
        </div>
      </div>

      <div className="card profile-card">
        <h3>Магазин</h3>
        <div className="profile-grid">
          <div className="profile-row">
            <span className="profile-label">Название</span>
            <span className="profile-value">{profile.shop_name || '—'}</span>
          </div>
          <div className="profile-row full-width">
            <span className="profile-label">Описание</span>
            <span className="profile-value">{profile.description || '—'}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Округ</span>
            <span className="profile-value">{districtName}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Тип доставки</span>
            <span className="profile-value">{DELIVERY_LABELS[profile.delivery_type || ''] || profile.delivery_type || '—'}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Стоимость доставки</span>
            <span className="profile-value">{profile.delivery_price ?? 0} ₽</span>
          </div>
          <div className="profile-row full-width">
            <span className="profile-label">Адрес (карта)</span>
            <span className="profile-value">
              {profile.map_url ? (
                <a href={profile.map_url} target="_blank" rel="noopener noreferrer">Открыть на карте</a>
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Ссылка на магазин</span>
            <span className="profile-value">
              {profile.shop_link ? (
                <code className="profile-link">{profile.shop_link}</code>
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="card profile-card">
        <h3>Лимиты и статистика</h3>
        <div className="profile-grid">
          <div className="profile-row">
            <span className="profile-label">Лимит на сегодня</span>
            <span className="profile-value">
              {profile.limit_set_for_today ? `${profile.orders_used_today ?? 0} / ${profile.max_orders ?? 0}` : 'Не задан'}
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Активных заказов</span>
            <span className="profile-value">{profile.active_orders ?? 0}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Ожидающих ответа</span>
            <span className="profile-value">{profile.pending_requests ?? 0}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Дата окончания размещения</span>
            <span className="profile-value">{formatDate(profile.placement_expired_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
