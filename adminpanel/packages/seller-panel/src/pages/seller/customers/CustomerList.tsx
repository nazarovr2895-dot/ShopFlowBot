import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllCustomers,
  getCustomerTags,
  exportCustomersCSV,
} from '../../../api/sellerClient';
import type { UnifiedCustomerBrief } from '../../../api/sellerClient';
import {
  useToast,
  StatCard,
  StatusBadge,
  EmptyState,
  SearchInput,
  Skeleton,
} from '@shared/components/ui';
import { Users, Download, ChevronRight, User } from 'lucide-react';
import './shared.css';
import './CustomerList.css';

const SEGMENT_BADGE_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  'VIP': 'warning',
  'Постоянный': 'success',
  'Новый': 'info',
  'Уходящий': 'danger',
  'Потерянный': 'neutral',
  'Случайный': 'neutral',
};

function getInitials(firstName?: string | null, lastName?: string | null, fio?: string | null, username?: string | null): string {
  if (firstName && lastName) {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  if (firstName) return firstName.slice(0, 2).toUpperCase();
  if (lastName) return lastName.slice(0, 2).toUpperCase();
  if (fio) {
    const parts = fio.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return fio.slice(0, 2).toUpperCase();
  }
  if (username) return username.slice(0, 2).toUpperCase();
  return '';
}

interface CustomerListProps {
  branch?: string;
}

export function CustomerList({ branch }: CustomerListProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<UnifiedCustomerBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({});
  const [segmentFilter, setSegmentFilter] = useState('');

  const loadList = useCallback(async () => {
    try {
      const [list, tags] = await Promise.all([
        getAllCustomers(branch),
        getCustomerTags(),
      ]);
      setCustomers(list || []);
      setAllTags(tags || []);
      const counts: Record<string, number> = {};
      (list || []).forEach((c) => {
        if (c.segment) {
          counts[c.segment] = (counts[c.segment] || 0) + 1;
        }
      });
      setSegmentCounts(counts);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const filteredCustomers = customers.filter((c) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const match =
        (c.fio && c.fio.toLowerCase().includes(q)) ||
        (c.username && c.username.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(search.trim())) ||
        (c.first_name && c.first_name.toLowerCase().includes(q)) ||
        (c.last_name && c.last_name.toLowerCase().includes(q)) ||
        (c.loyalty_card_number && c.loyalty_card_number.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (tagFilter && !(c.tags || []).includes(tagFilter)) return false;
    if (segmentFilter && c.segment !== segmentFilter) return false;
    return true;
  });

  const handleExportCustomers = async () => {
    try {
      const blob = await exportCustomersCSV(branch);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка экспорта');
    }
  };

  return (
    <div className="clist-page">
      {/* Stats */}
      <div className="clist-stats">
        <StatCard label="Всего" value={customers.length} />
        <StatCard label="С картой" value={customers.filter(c => c.has_loyalty).length} />
        <StatCard label="Без карты" value={customers.filter(c => !c.has_loyalty).length} />
      </div>

      {/* Search + filters toolbar */}
      <div className="clist-toolbar">
        <div className="clist-toolbar__search">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Поиск по имени, @username, телефону или карте"
          />
        </div>
        <div className="clist-toolbar__filters">
          {allTags.length > 0 && (
            <select
              className="clist-filter-select"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">Все теги</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <select
            className="clist-filter-select"
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
          >
            <option value="">Все сегменты</option>
            {Object.keys(segmentCounts).map((s) => (
              <option key={s} value={s}>{s} ({segmentCounts[s]})</option>
            ))}
          </select>
          <button type="button" className="clist-export-btn" onClick={handleExportCustomers}>
            <Download size={15} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Segment filter chips */}
      {Object.keys(segmentCounts).length > 0 && (
        <div className="clist-segments">
          {Object.entries(segmentCounts).map(([seg, count]) => (
            <button
              key={seg}
              type="button"
              className={`clist-segment-chip ${segmentFilter === seg ? 'clist-segment-chip--active' : ''}`}
              onClick={() => setSegmentFilter(segmentFilter === seg ? '' : seg)}
            >
              {seg}: {count}
            </button>
          ))}
        </div>
      )}

      {/* Customer list */}
      {loading ? (
        <div className="clist-skeletons">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} height="72px" borderRadius="var(--radius-lg)" />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon={<Users size={40} />}
          title={customers.length === 0 ? 'Нет клиентов' : 'Ничего не найдено'}
          message={
            customers.length === 0
              ? 'Покупатели могут подписаться на ваш магазин через каталог.'
              : 'Попробуйте изменить параметры поиска'
          }
        />
      ) : (
        <div className="clist-rows">
          {filteredCustomers.map((c, idx) => {
            const displayName = c.fio
              || (c.first_name || c.last_name ? `${c.last_name || ''} ${c.first_name || ''}`.trim() : null)
              || (c.username ? `@${c.username}` : null)
              || (c.buyer_id ? `ID ${c.buyer_id}` : `Клиент #${idx + 1}`);
            const hasCard = c.has_loyalty && c.loyalty_customer_id;
            const initials = getInitials(c.first_name, c.last_name, c.fio, c.username);

            return (
              <div
                key={c.buyer_id || `sc-${c.loyalty_customer_id || idx}`}
                className={`clist-row ${hasCard ? 'clist-row--clickable' : ''}`}
                onClick={() => hasCard && navigate(`/customers/${c.loyalty_customer_id}`)}
              >
                {/* Avatar */}
                <div className="crm-avatar">
                  {initials || <User size={18} />}
                </div>

                {/* Info */}
                <div className="clist-row__info">
                  <div className="clist-row__name-line">
                    <span className="clist-row__name">{displayName}</span>
                    {c.username && c.fio && (
                      <span className="clist-row__username">@{c.username}</span>
                    )}
                    {c.segment && (
                      <StatusBadge variant={SEGMENT_BADGE_VARIANT[c.segment] || 'neutral'} size="sm">
                        {c.segment}
                      </StatusBadge>
                    )}
                    {c.branch_name && (
                      <span className="clist-row__branch">{c.branch_name}</span>
                    )}
                  </div>
                  <div className="clist-row__meta">
                    {c.phone || '—'}
                    {c.loyalty_card_number && <> · {c.loyalty_card_number}</>}
                    {Array.isArray(c.tags) && c.tags.length > 0 && c.tags.map((tag, i) => (
                      <span key={i} className="clist-row__tag">{tag}</span>
                    ))}
                  </div>
                </div>

                {/* Right */}
                <div className="clist-row__right">
                  {c.has_loyalty ? (
                    <span className="clist-row__points">{c.loyalty_points} б.</span>
                  ) : (
                    <span className="clist-row__no-card">Нет карты</span>
                  )}
                  {hasCard && <ChevronRight size={16} className="clist-row__chevron" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
