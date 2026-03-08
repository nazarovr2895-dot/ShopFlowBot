import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubscribers } from '../../../api/sellerClient';
import type { Subscriber } from '../../../api/sellerClient';
import { StatCard, SearchInput, EmptyState, Skeleton } from '@shared/components/ui';
import { User, UserCheck } from 'lucide-react';
import './shared.css';
import './SubscribersTab.css';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

function getInitials(fio?: string | null, username?: string | null): string {
  if (fio) {
    const parts = fio.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return fio.slice(0, 2).toUpperCase();
  }
  if (username) return username.slice(0, 2).toUpperCase();
  return '';
}

interface SubscribersTabProps {
  branch?: string;
}

export function SubscribersTab({ branch }: SubscribersTabProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getSubscribers(branch);
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
  }, [branch]);

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

  return (
    <div className="subs-page">
      {/* Stats */}
      <div className="subs-stats">
        <StatCard label="Всего" value={total} />
        <StatCard label="С картой лояльности" value={withLoyalty} />
        <StatCard label="Без карты" value={total - withLoyalty} />
      </div>

      {/* Search */}
      {subscribers.length > 0 && (
        <div className="subs-search">
          <SearchInput
            placeholder="Поиск по имени, @username или телефону"
            value={search}
            onChange={setSearch}
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="subs-skeletons">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} height="64px" borderRadius="var(--radius-lg)" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserCheck size={40} />}
          title={subscribers.length === 0 ? 'Нет подписчиков' : 'Ничего не найдено'}
          message={subscribers.length === 0
            ? 'Покупатели могут подписаться на ваш магазин через каталог.'
            : undefined
          }
        />
      ) : (
        <div className="subs-rows">
          {filtered.map(sub => {
            const initials = getInitials(sub.fio, sub.username);
            return (
              <div key={sub.buyer_id} className="subs-row">
                <div className="crm-avatar crm-avatar--sm">
                  {initials || <User size={16} />}
                </div>

                <div className="subs-row__info">
                  <div className="subs-row__name-line">
                    <span className="subs-row__name">{sub.fio || sub.username || `ID ${sub.buyer_id}`}</span>
                    {sub.branch_name && <span className="subs-row__branch">{sub.branch_name}</span>}
                  </div>
                  {sub.username && sub.fio && (
                    <span className="subs-row__username">@{sub.username}</span>
                  )}
                </div>

                <div className="subs-row__phone">{formatPhone(sub.phone)}</div>
                <div className="subs-row__date">{formatDate(sub.subscribed_at)}</div>

                <div className="subs-row__loyalty">
                  {sub.has_loyalty ? (
                    <>
                      <span className="subs-row__card">{sub.loyalty_card_number}</span>
                      <span className="subs-row__points">{sub.loyalty_points} б.</span>
                      {sub.loyalty_customer_id && (
                        <Link to={`/customers/${sub.loyalty_customer_id}`} className="subs-row__link">
                          Карточка
                        </Link>
                      )}
                    </>
                  ) : (
                    <span className="subs-row__no-card">Нет карты</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
