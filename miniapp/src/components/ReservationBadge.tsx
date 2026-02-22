import { useEffect, useRef } from 'react';
import type { CartItemEntry } from '../types';
import { useReservationTimer } from '../hooks/useReservationTimer';

interface ReservationBadgeProps {
  item: CartItemEntry;
  onExpired: () => void;
  onExtend: (productId: number) => void;
}

export function ReservationBadge({ item, onExpired, onExtend }: ReservationBadgeProps) {
  const { formattedTime, hasExpired, isWarning } = useReservationTimer(item.reserved_at);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (hasExpired && !expiredRef.current) {
      expiredRef.current = true;
      onExpired();
    }
  }, [hasExpired, onExpired]);

  if (!item.reserved_at || item.is_preorder) return null;
  if (hasExpired) return null;

  return (
    <div className={`cart-item__reservation ${isWarning ? 'cart-item__reservation--warning' : ''}`}>
      <span className="cart-item__reservation-icon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
      <span className="cart-item__reservation-time">{formattedTime}</span>
      <button
        type="button"
        className="cart-item__reservation-extend"
        onClick={(e) => { e.stopPropagation(); onExtend(item.product_id); }}
      >
        Продлить
      </button>
    </div>
  );
}
