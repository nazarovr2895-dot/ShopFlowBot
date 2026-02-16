import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubscribers } from '../../api/sellerClient';
import type { Subscriber } from '../../api/sellerClient';
import './SellerSubscribers.css';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatPhone(phone: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return phone;
}

export function SellerSubscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSubscribers();
        setSubscribers(data.subscribers || []);
        setTotal(data.total);
      } catch {
        setSubscribers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const withLoyalty = subscribers.filter(s => s.has_loyalty).length;

  const filtered = search.trim()
    ? subscribers.filter(s => {
        const q = search.trim().toLowerCase();
        return (
          (s.fio && s.fio.toLowerCase().includes(q)) ||
          (s.username && s.username.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q))
        );
      })
    : subscribers;

  if (loading) {
    return (
      <div className="subscribers-page">
        <h1>Подписчики</h1>
        <div className="subscribers-loading">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="subscribers-page">
      <h1>
        Подписчики
        {total > 0 && <span className="badge">{total}</span>}
      </h1>

      <div className="subscribers-stats">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Всего</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{withLoyalty}</div>
          <div className="stat-label">С картой лояльности</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{total - withLoyalty}</div>
          <div className="stat-label">Без карты</div>
        </div>
      </div>

      {subscribers.length > 0 && (
        <div className="subscribers-search">
          <input
            type="text"
            placeholder="Поиск по имени, @username или телефону"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="subscribers-empty">
          {subscribers.length === 0
            ? 'У вас пока нет подписчиков. Покупатели могут подписаться на ваш магазин через каталог.'
            : 'Ничего не найдено'}
        </div>
      ) : (
        <div className="subscribers-list">
          {filtered.map(sub => (
            <div key={sub.buyer_id} className="subscriber-row">
              <div className="user-info">
                <div className="name">{sub.fio || sub.username || `ID ${sub.buyer_id}`}</div>
                {sub.username && <div className="username">@{sub.username}</div>}
              </div>
              <div className="phone">{formatPhone(sub.phone)}</div>
              <div className="date">{formatDate(sub.subscribed_at)}</div>
              <div className="loyalty-info">
                {sub.has_loyalty ? (
                  <>
                    <span className="card">{sub.loyalty_card_number}</span>
                    <span className="points">{sub.loyalty_points} б.</span>
                    {sub.loyalty_customer_id && (
                      <Link to={`/customers/${sub.loyalty_customer_id}`} className="loyalty-link">
                        Карточка
                      </Link>
                    )}
                  </>
                ) : (
                  <span className="no-card">Нет карты</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
