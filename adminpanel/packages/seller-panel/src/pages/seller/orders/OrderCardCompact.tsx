import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { parseItemsInfo, formatAddress, formatPhone, getDaysUntil } from '@shared/utils/formatters';
import { STATUS_LABELS, isPickup } from './constants';
import type { SellerOrder } from '../../../api/sellerClient';
import './OrderCardCompact.css';

export type CardContext =
  | 'pending'
  | 'awaiting_payment'
  | 'active'
  | 'history'
  | 'cancelled'
  | 'preorder_requests'
  | 'preorder_waiting';

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

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--warning)',
  accepted: 'var(--info)',
  assembling: 'var(--warning)',
  in_transit: 'var(--accent)',
  ready_for_pickup: '#f97316',
  done: 'var(--success)',
  completed: 'var(--success)',
  rejected: 'var(--danger)',
  cancelled: 'var(--danger)',
};

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
  const pickup = isPickup(order.delivery_type);
  const showPriceEdit = context === 'pending' || context === 'preorder_requests';
  const statusColor = STATUS_COLORS[order.status] || 'var(--text-tertiary)';
  const [copiedAddr, setCopiedAddr] = useState(false);

  const fmtTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  };

  const handleCopyAddress = () => {
    const text = formatAddress(order.address);
    if (text && text !== '\u2014') {
      navigator.clipboard.writeText(text);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1500);
    }
  };

  const items = parseItemsInfo(order.items_info);

  return (
    <div className={`occ ${pickup ? 'occ--pickup' : 'occ--delivery'}`}>
      {/* Row 1: ID + price + status dot */}
      <div className="occ__top">
        <Link to={`/orders/${order.id}`} className="occ__id">#{order.id}</Link>
        <span className="occ__price">{order.total_price} ₽</span>
        {order.original_price != null && Math.abs((order.original_price ?? 0) - (order.total_price ?? 0)) > 0.01 && (
          <span className="occ__price-old">{order.original_price}</span>
        )}
        <div className="occ__top-right">
          {order.payment_status === 'succeeded' && <span className="occ__paid" title="Оплачено">$</span>}
          <span className="occ__status-dot" style={{ background: statusColor }} title={STATUS_LABELS[order.status] || order.status} />
        </div>
      </div>

      {/* Row 2: Buyer name + phone */}
      {(order.buyer_fio || order.buyer_phone) && (
        <div className="occ__buyer">
          {order.buyer_fio && <span className="occ__name">{order.buyer_fio}</span>}
          {order.buyer_phone && <span className="occ__phone">{formatPhone(order.buyer_phone)}</span>}
        </div>
      )}

      {/* Row 2b: Recipient + gift note indicators */}
      {(order.recipient_name || order.gift_note) && (
        <div className="occ__extras">
          {order.recipient_name && (
            <span className="occ__extra-tag occ__extra-tag--recipient">
              Получатель: {order.recipient_name}
              {order.recipient_phone ? ` (${formatPhone(order.recipient_phone)})` : ''}
            </span>
          )}
          {order.gift_note && (
            <span className="occ__extra-tag occ__extra-tag--note" title={order.gift_note}>
              Записка
            </span>
          )}
        </div>
      )}

      {/* Row 3: Items (clickable product names) */}
      <div className="occ__items">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && ', '}
            {item.id && onProductClick ? (
              <span
                className="occ__item-link"
                onClick={() => onProductClick(item.id!)}
              >
                {item.name}
              </span>
            ) : (
              <span>{item.name}</span>
            )}
            <span className="occ__item-qty"> × {item.qty}</span>
          </Fragment>
        ))}
      </div>

      {/* Row 4: Meta line — delivery type + slot/address + time */}
      <div className="occ__meta">
        <span className={`occ__type ${pickup ? 'occ__type--pickup' : 'occ__type--delivery'}`}>
          {pickup ? 'Самовывоз' : 'Доставка'}
        </span>
        {order.delivery_slot_date && order.delivery_slot_start && (
          <span className="occ__slot">
            {new Date(order.delivery_slot_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} {order.delivery_slot_start}–{order.delivery_slot_end}
          </span>
        )}
        {!pickup && order.address && (
          <span
            className={`occ__addr occ__addr--clickable ${copiedAddr ? 'occ__addr--copied' : ''}`}
            title="Нажмите чтобы скопировать"
            onClick={handleCopyAddress}
          >
            {copiedAddr ? 'Скопировано!' : formatAddress(order.address)}
          </span>
        )}
        {order.is_preorder && order.preorder_delivery_date && (
          <span className="occ__slot">
            Поставка: {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
            {context === 'preorder_waiting' && (() => {
              const cd = getDaysUntil(order.preorder_delivery_date);
              return <span className={cd.className}> {cd.label}</span>;
            })()}
          </span>
        )}
        {(order.points_discount ?? 0) > 0 && (
          <span className="occ__points">−{order.points_discount} ₽ бонус</span>
        )}
        <span className="occ__time">{fmtTime(order.created_at)}</span>
      </div>

      {/* Price edit (inline, only when editing) */}
      {editingPrice === order.id && (
        <div className="occ__price-edit">
          <input
            type="number"
            value={newPrice}
            onChange={(e) => onPriceChange(e.target.value)}
            className="form-input occ__price-input"
          />
          <button className="btn btn-sm btn-primary" onClick={() => onSavePrice(order.id)}>OK</button>
          <button className="btn btn-sm btn-secondary" onClick={onCancelPrice}>✕</button>
        </div>
      )}

      {/* Price edit trigger for pending */}
      {showPriceEdit && editingPrice !== order.id && (
        <button
          className="occ__edit-price-btn"
          onClick={() => onEditPrice(order.id, order.total_price ?? 0)}
        >
          Изменить цену
        </button>
      )}

      {/* Customer profile link */}
      {order.customer_id && (
        <Link to={`/customers/${order.customer_id}`} className="occ__profile-link">Профиль клиента</Link>
      )}

      {/* Actions */}
      {renderActions(order, context, pickup, onAccept, onReject, onStatusChange)}
    </div>
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
    const cd = getDaysUntil(order.preorder_delivery_date);
    if (cd.days <= 0) {
      buttons.push(
        <button key="assemble" className="occ__btn occ__btn--primary" onClick={() => onStatusChange?.(order.id, 'assembling')}>Собирать</button>,
      );
    }
  }

  if (context === 'active') {
    // One button per status — next logical step only
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
