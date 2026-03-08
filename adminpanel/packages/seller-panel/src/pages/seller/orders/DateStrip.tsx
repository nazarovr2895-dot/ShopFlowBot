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

interface DateItemInfo {
  dayNum: number;
  dayName: string;
  month: string | null;
  isToday: boolean;
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

  const formatDateItem = (dateKey: string): DateItemInfo => {
    const d = new Date(dateKey + 'T00:00:00');
    const now = new Date();
    const isToday = dateKey === todayKey;
    const sameMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

    return {
      dayNum: d.getDate(),
      dayName: isToday ? 'Сегодня' : DAY_NAMES[d.getDay()],
      month: sameMonth ? null : MONTH_NAMES[d.getMonth()],
      isToday,
    };
  };

  return (
    <div className="date-strip">
      <button
        className={`date-strip__item date-strip__item--all ${selectedDate === null ? 'date-strip__item--active' : ''}`}
        onClick={() => onSelect(null)}
        ref={selectedDate === null ? activeRef : undefined}
      >
        <span className="date-strip__all-label">Все</span>
        <span className="date-strip__count">{orders.length}</span>
      </button>
      {dates.map((dk) => {
        const isActive = selectedDate === dk;
        const info = formatDateItem(dk);
        const count = countByDate[dk] || 0;

        return (
          <button
            key={dk}
            ref={isActive ? activeRef : undefined}
            className={[
              'date-strip__item',
              isActive && 'date-strip__item--active',
              info.isToday && !isActive && 'date-strip__item--today',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelect(dk)}
          >
            <span className="date-strip__day-num">{info.dayNum}</span>
            <span className="date-strip__day-name">{info.dayName}</span>
            {info.month && <span className="date-strip__month">{info.month}</span>}
            <span className="date-strip__count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
