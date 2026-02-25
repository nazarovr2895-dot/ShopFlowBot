import { useMemo, useRef, useEffect } from 'react';
import type { SellerOrder } from '../../../api/sellerClient';
import './DateStrip.css';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

interface DateStripProps {
  orders: SellerOrder[];
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}

function toDateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function getOrderDate(order: SellerOrder): string | null {
  const raw = order.delivery_slot_date || order.created_at;
  if (!raw) return null;
  return toDateKey(raw);
}

export function DateStrip({ orders, selectedDate, onSelect }: DateStripProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  const todayKey = useMemo(() => toDateKey(new Date().toISOString()), []);
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateKey(d.toISOString());
  }, []);
  const tomorrowKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateKey(d.toISOString());
  }, []);

  const { dates, countByDate } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of orders) {
      const dk = getOrderDate(order);
      if (dk) counts[dk] = (counts[dk] || 0) + 1;
    }
    // Always include today
    if (!counts[todayKey]) counts[todayKey] = 0;
    const sorted = Object.keys(counts).sort();
    return { dates: sorted, countByDate: counts };
  }, [orders, todayKey]);

  // Scroll active date into view
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedDate]);

  const formatDatePill = (dateKey: string) => {
    if (dateKey === todayKey) return { special: 'Сегодня', day: '' };
    if (dateKey === yesterdayKey) return { special: 'Вчера', day: '' };
    if (dateKey === tomorrowKey) return { special: 'Завтра', day: '' };

    const d = new Date(dateKey + 'T00:00:00');
    const dayName = DAY_NAMES[d.getDay()];
    const dayNum = d.getDate();
    const now = new Date();
    const sameMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const month = sameMonth ? '' : ` ${MONTH_NAMES[d.getMonth()]}`;
    return { special: null, day: `${dayName} ${dayNum}${month}` };
  };

  return (
    <div className="date-strip">
      <button
        className={`date-strip__item ${selectedDate === null ? 'date-strip__item--active' : ''}`}
        onClick={() => onSelect(null)}
        ref={selectedDate === null ? activeRef : undefined}
      >
        <span className="date-strip__label">Все</span>
        <span className="date-strip__count">{orders.length}</span>
      </button>
      {dates.map((dk) => {
        const isActive = selectedDate === dk;
        const isToday = dk === todayKey;
        const pill = formatDatePill(dk);
        const count = countByDate[dk] || 0;

        return (
          <button
            key={dk}
            ref={isActive ? activeRef : undefined}
            className={[
              'date-strip__item',
              isActive && 'date-strip__item--active',
              isToday && !isActive && 'date-strip__item--today',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelect(dk)}
          >
            <span className="date-strip__label">{pill.special || pill.day}</span>
            {count > 0 && <span className="date-strip__count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
