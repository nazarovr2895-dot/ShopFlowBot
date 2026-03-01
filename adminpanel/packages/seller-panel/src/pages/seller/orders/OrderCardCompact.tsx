import { useState, useEffect } from 'react';
import { formatPhone } from '@shared/utils/formatters';
import { STATUS_LABELS, getStatusColor, isPickup } from './constants';
import type { CardContext } from './constants';
import { OrderInfoModal } from './OrderInfoModal';
import type { SellerOrder, SellerProduct } from '../../../api/sellerClient';
import './OrderCardCompact.css';

export type { CardContext };

interface OrderCardCompactProps {
  order: SellerOrder;
  context: CardContext;
  editingPrice: number | null;
  newPrice: string;
  onAccept?: (order: SellerOrder) => void;
  onReject?: (orderId: number) => void;
  onStatusChange?: (orderId: number, status: string) => void;
  onEditPrice: (orderId: number, currentPrice: number) => void;
  onSavePrice: (orderId: number) => void;
  onCancelPrice: () => void;
  onPriceChange: (value: string) => void;
  loadProducts?: () => Promise<SellerProduct[]>;
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit' });
  } catch { return ''; }
};

function formatWaitTime(minutes: number): string {
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} д ${rh} ч` : `${d} д`;
}

function useWaitingMinutes(createdAt?: string | null): number {
  const [minutes, setMinutes] = useState(() => {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  });

  useEffect(() => {
    if (!createdAt) return;
    const update = () => setMinutes(Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [createdAt]);

  return minutes;
}

export function OrderCardCompact({
  order,
  context,
  editingPrice,
  newPrice,
  onAccept,
  onReject,
  onStatusChange,
  onEditPrice,
  onSavePrice,
  onCancelPrice,
  onPriceChange,
  loadProducts,
}: OrderCardCompactProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const pickup = isPickup(order.delivery_type);
  const sc = getStatusColor(order.status);
  const waitMin = useWaitingMinutes(order.created_at);
  const showTimer = order.status === 'pending' || order.status === 'accepted' || order.status === 'assembling';

  return (
    <>
      <div className={`occ ${pickup ? 'occ--pickup' : 'occ--delivery'}`}>
        {/* Row 1: Status badge + timer + date */}
        <div className="occ__header">
          <span
            className="occ__status"
            style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
          >
            {STATUS_LABELS[order.status] || order.status}
          </span>
          <div className="occ__header-right">
            {showTimer && (
              <span className={`occ__timer ${waitMin >= 60 ? 'occ__timer--warn' : ''} ${waitMin >= 180 ? 'occ__timer--critical' : ''}`}>
                {formatWaitTime(waitMin)}
              </span>
            )}
            <span className="occ__date">{fmtDate(order.created_at)}</span>
          </div>
        </div>

        {/* Row 2: ID + price + paid badge */}
        <div className="occ__main">
          <span className="occ__id">#{order.id}</span>
          <span className="occ__price">{order.total_price} ₽</span>
          {order.payment_status === 'succeeded' && (
            <span className="occ__paid">Оплачено</span>
          )}
        </div>

        {/* Row 3: Customer */}
        {(order.buyer_fio || order.buyer_phone) && (
          <div className="occ__customer">
            {order.buyer_fio && <span className="occ__name">{order.buyer_fio}</span>}
            {order.buyer_phone && <span className="occ__phone">{formatPhone(order.buyer_phone)}</span>}
          </div>
        )}

        {/* Row 4: Tags */}
        <div className="occ__tags">
          <span className={`occ__pill ${pickup ? 'occ__pill--pickup' : 'occ__pill--delivery'}`}>
            {pickup ? 'Самовывоз' : 'Доставка'}
          </span>
          {order.payment_method === 'on_pickup' && (
            <span className="occ__pill occ__pill--cash">Наличные</span>
          )}
        </div>

        {/* Footer: Info + actions */}
        <div className="occ__footer">
          <button className="occ__btn occ__btn--info" onClick={() => setInfoOpen(true)}>Инфо</button>
          {renderActions(order, context, pickup, onAccept, onReject, onStatusChange)}
        </div>
      </div>

      {infoOpen && (
        <OrderInfoModal
          order={order}
          context={context}
          editingPrice={editingPrice}
          newPrice={newPrice}
          onEditPrice={onEditPrice}
          onSavePrice={onSavePrice}
          onCancelPrice={onCancelPrice}
          onPriceChange={onPriceChange}
          loadProducts={loadProducts}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </>
  );
}

function renderActions(
  order: SellerOrder,
  context: CardContext,
  pickup: boolean,
  onAccept?: (order: SellerOrder) => void,
  onReject?: (orderId: number) => void,
  onStatusChange?: (orderId: number, status: string) => void,
) {
  const buttons: JSX.Element[] = [];

  if (context === 'pending' || context === 'preorder_requests') {
    buttons.push(
      <button key="accept" className="occ__btn occ__btn--primary" onClick={() => onAccept?.(order)}>Принять</button>,
      <button key="reject" className="occ__btn occ__btn--danger" onClick={() => onReject?.(order.id)}>Отклонить</button>,
    );
  }

  if (context === 'preorder_waiting' && order.preorder_delivery_date) {
    const today = new Date();
    const delivery = new Date(order.preorder_delivery_date);
    if (delivery <= today) {
      buttons.push(
        <button key="assemble" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'assembling')}>Собирать</button>,
      );
    }
  }

  if (context === 'active') {
    if (order.status === 'accepted') {
      buttons.push(<button key="assembling" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'assembling')}>Сборка</button>);
    } else if (order.status === 'assembling') {
      buttons.push(
        !pickup
          ? <button key="in_transit" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'in_transit')}>В пути</button>
          : <button key="ready" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'ready_for_pickup')}>К выдаче</button>,
      );
    } else if (order.status === 'in_transit' || order.status === 'ready_for_pickup') {
      buttons.push(<button key="done" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'done')}>Готово</button>);
    }
  }

  if (buttons.length === 0) return null;
  return <div className="occ__actions">{buttons}</div>;
}
