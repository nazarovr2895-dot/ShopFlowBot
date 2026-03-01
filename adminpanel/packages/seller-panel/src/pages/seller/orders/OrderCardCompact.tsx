import { useState } from 'react';
import { StatusBadge } from '@shared/components/ui';
import { formatPhone } from '@shared/utils/formatters';
import { STATUS_LABELS, getStatusVariant, isPickup } from './constants';
import type { CardContext } from './constants';
import { OrderInfoModal } from './OrderInfoModal';
import type { SellerOrder } from '../../../api/sellerClient';
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
  onProductClick?: (productId: number) => void;
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
  onProductClick,
}: OrderCardCompactProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const pickup = isPickup(order.delivery_type);

  return (
    <>
      <div className={`occ ${pickup ? 'occ--pickup' : 'occ--delivery'}`}>
        {/* Row 1: ID + Price + Status + Payment */}
        <div className="occ__top">
          <span className="occ__id">#{order.id}</span>
          <span className="occ__price">{order.total_price} ₽</span>
          <div className="occ__badges">
            <StatusBadge variant={getStatusVariant(order.status)} size="sm">
              {STATUS_LABELS[order.status] || order.status}
            </StatusBadge>
            {order.payment_status === 'succeeded' && (
              <StatusBadge variant="success" size="sm">Оплачено</StatusBadge>
            )}
          </div>
        </div>

        {/* Row 2: Customer name + phone */}
        {(order.buyer_fio || order.buyer_phone) && (
          <div className="occ__customer">
            {order.buyer_fio && <span className="occ__name">{order.buyer_fio}</span>}
            {order.buyer_phone && <span className="occ__phone">{formatPhone(order.buyer_phone)}</span>}
          </div>
        )}

        {/* Row 3: Delivery type + payment method */}
        <div className="occ__tags">
          <span className={`occ__type ${pickup ? 'occ__type--pickup' : 'occ__type--delivery'}`}>
            {pickup ? 'Самовывоз' : 'Доставка'}
          </span>
          {order.payment_method === 'on_pickup' && (
            <span className="occ__type occ__type--cash">Наличные</span>
          )}
        </div>

        {/* Row 4: Info button + action buttons */}
        <div className="occ__footer">
          <button className="occ__info-btn" onClick={() => setInfoOpen(true)}>Инфо</button>
          {renderActions(order, context, pickup, onAccept, onReject, onStatusChange)}
        </div>
      </div>

      {/* Info modal */}
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
          onProductClick={onProductClick}
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
      buttons.push(
        <button key="assembling" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'assembling')}>Сборка</button>,
      );
    } else if (order.status === 'assembling') {
      if (!pickup) {
        buttons.push(
          <button key="in_transit" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'in_transit')}>В пути</button>,
        );
      } else {
        buttons.push(
          <button key="ready" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'ready_for_pickup')}>К выдаче</button>,
        );
      }
    } else if (order.status === 'in_transit') {
      buttons.push(
        <button key="done" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'done')}>Готово</button>,
      );
    } else if (order.status === 'ready_for_pickup') {
      buttons.push(
        <button key="done" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'done')}>Готово</button>,
      );
    }
  }

  if (buttons.length === 0) return null;

  return <div className="occ__actions">{buttons}</div>;
}
