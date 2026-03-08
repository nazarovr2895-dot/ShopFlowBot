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

/** Local-timezone YYYY-MM-DD key */
function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getOrderDate(order: SellerOrder): string | null {
  const raw = order.delivery_slot_date || order.created_at;
  if (!raw) return null;
  return toLocalDateKey(new Date(raw));
}

export function DateStrip({ orders, selectedDate, onSelect }: DateStripProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  const todayKey = useMemo(() => toLocalDateKey(new Date()), []);

  const { dates, countByDate } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of orders) {
      const dk = getOrderDate(order);
      if (dk) counts[dk] = (counts[dk] || 0) + 1;
    }
    if (!counts[todayKey]) counts[todayKey] = 0;
    const sorted = Object.keys(counts).sort();
    return { dates: sorted, countByDate: counts };
  }, [orders, todayKey]);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedDate]);

  const formatLabel = (dateKey: string): { label: string; isToday: boolean } => {
    const d = new Date(dateKey + 'T00:00:00');
    const dayNum = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];

    if (dateKey === todayKey) {
      return { label: `Сегодня, ${dayNum} ${month}`, isToday: true };
    }
    const dayName = DAY_NAMES[d.getDay()];
    return { label: `${dayName}, ${dayNum} ${month}`, isToday: false };
  };

  return (
    <div className="date-strip">
      <button
        className={`date-strip__item ${selectedDate === null ? 'date-strip__item--active' : ''}`}
        onClick={() => onSelect(null)}
        ref={selectedDate === null ? activeRef : undefined}
      >
        <span className="date-strip__label">Все</span>
        {orders.length > 0 && <span className="date-strip__count">{orders.length}</span>}
      </button>
      {dates.map((dk) => {
        const isActive = selectedDate === dk;
        const { label, isToday } = formatLabel(dk);
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
            <span className="date-strip__label">{label}</span>
            {count > 0 && <span className="date-strip__count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
