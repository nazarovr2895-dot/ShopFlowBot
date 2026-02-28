import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubscribers } from '../../api/sellerClient';
import type { Subscriber } from '../../api/sellerClient';
import { PageHeader, StatCard, SearchInput, EmptyState } from '@shared/components/ui';
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
        <PageHeader title="Подписчики" />
        <div className="subscribers-loading">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="subscribers-page">
      <PageHeader
        title="Подписчики"
        subtitle={total > 0 ? `Всего: ${total}` : undefined}
      />

      <div className="subscribers-stats">
        <StatCard label="Всего" value={total} />
        <StatCard label="С картой лояльности" value={withLoyalty} />
        <StatCard label="Без карты" value={total - withLoyalty} />
      </div>

      {subscribers.length > 0 && (
        <div className="subscribers-search">
          <SearchInput
            placeholder="Поиск по имени, @username или телефону"
            value={search}
            onChange={setSearch}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={subscribers.length === 0 ? 'Нет подписчиков' : 'Ничего не найдено'}
          message={subscribers.length === 0
            ? 'Покупатели могут подписаться на ваш магазин через каталог.'
            : undefined
          }
        />
      ) : (
        <div className="subscribers-list">
          {filtered.map(sub => (
            <div key={sub.buyer_id} className="subscriber-row">
              <div className="subscriber-user-info">
                <div className="subscriber-name">{sub.fio || sub.username || `ID ${sub.buyer_id}`}</div>
                {sub.username && <div className="subscriber-username">@{sub.username}</div>}
              </div>
              <div className="subscriber-phone">{formatPhone(sub.phone)}</div>
              <div className="subscriber-date">{formatDate(sub.subscribed_at)}</div>
              <div className="subscriber-loyalty-info">
                {sub.has_loyalty ? (
                  <>
                    <span className="subscriber-loyalty-card">{sub.loyalty_card_number}</span>
                    <span className="subscriber-loyalty-points">{sub.loyalty_points} б.</span>
                    {sub.loyalty_customer_id && (
                      <Link to={`/customers/${sub.loyalty_customer_id}`} className="subscriber-loyalty-link">
                        Карточка
                      </Link>
                    )}
                  </>
                ) : (
                  <span className="subscriber-no-card">Нет карты</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
