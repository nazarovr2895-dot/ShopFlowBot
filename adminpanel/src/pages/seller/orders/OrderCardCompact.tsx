import { Link } from 'react-router-dom';
import { StatusBadge } from '../../../components/ui';
import { formatItemsInfo, formatAddress, formatPhone, getDaysUntil } from '../../../utils/formatters';
import { STATUS_LABELS, getStatusVariant, isPickup } from './constants';
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
}: OrderCardCompactProps) {
  const pickup = isPickup(order.delivery_type);
  const showPriceEdit = context === 'pending' || context === 'preorder_requests';

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className={`occ ${pickup ? 'occ--pickup' : 'occ--delivery'}`}>
      {/* Header */}
      <div className="occ__header">
        <Link to={`/orders/${order.id}`} className="occ__id">#{order.id}</Link>
        <div className="occ__badges">
          <span className={`occ__delivery-badge ${pickup ? 'occ__delivery-badge--pickup' : 'occ__delivery-badge--delivery'}`}>
            {pickup ? '📦 Самовывоз' : '🚚 Доставка'}
          </span>
          <StatusBadge variant={getStatusVariant(order.status)}>
            {STATUS_LABELS[order.status] || order.status}
          </StatusBadge>
          {order.payment_status === 'succeeded' && (
            <StatusBadge variant="success">Оплачено</StatusBadge>
          )}
          {order.payment_id && order.payment_status !== 'succeeded' && context === 'awaiting_payment' && (
            <StatusBadge variant="warning">💳 Ожидает</StatusBadge>
          )}
        </div>
      </div>

      {/* Buyer info */}
      {(order.buyer_fio || order.buyer_phone) && (
        <div className="occ__buyer">
          {order.buyer_fio && <div className="occ__buyer-name">{order.buyer_fio}</div>}
          <div className="occ__buyer-phone-row">
            {order.buyer_phone && <span className="occ__buyer-phone">{formatPhone(order.buyer_phone)}</span>}
            {order.customer_id && (
              <Link to={`/customers/${order.customer_id}`} className="occ__buyer-link">Профиль →</Link>
            )}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="occ__items" title={formatItemsInfo(order.items_info)}>
        {formatItemsInfo(order.items_info)}
      </div>

      {/* Details */}
      <div className="occ__details">
        {/* Price */}
        <div className="occ__price-row">
          {editingPrice === order.id ? (
            <span className="occ__price-edit">
              <input
                type="number"
                value={newPrice}
                onChange={(e) => onPriceChange(e.target.value)}
                className="form-input occ__price-input"
              />
              <button className="btn btn-sm btn-primary" onClick={() => onSavePrice(order.id)}>OK</button>
              <button className="btn btn-sm btn-secondary" onClick={onCancelPrice}>✕</button>
            </span>
          ) : (
            <>
              <span className="occ__price">{order.total_price} ₽</span>
              {order.original_price != null && Math.abs((order.original_price ?? 0) - (order.total_price ?? 0)) > 0.01 && (
                <span className="occ__price-original">было: {order.original_price} ₽</span>
              )}
              {showPriceEdit && (
                <button
                  className="btn btn-sm btn-secondary occ__price-change-btn"
                  onClick={() => onEditPrice(order.id, order.total_price ?? 0)}
                  title="Укажите итоговую цену перед принятием заказа"
                >
                  Изменить
                </button>
              )}
            </>
          )}
        </div>

        {/* Delivery slot */}
        {order.delivery_slot_date && order.delivery_slot_start && (
          <div className="occ__detail-line">
            <span className="occ__detail-label">📅</span>
            <span className="occ__detail-value occ__detail-value--accent">
              {new Date(order.delivery_slot_date).toLocaleDateString('ru-RU')} {order.delivery_slot_start}–{order.delivery_slot_end}
            </span>
          </div>
        )}

        {/* Address — hidden for pickup */}
        {!pickup && order.address && (
          <div className="occ__detail-line">
            <span className="occ__detail-label">📍</span>
            <span className="occ__detail-value">{formatAddress(order.address)}</span>
          </div>
        )}

        {/* Preorder delivery date */}
        {order.is_preorder && order.preorder_delivery_date && (
          <div className="occ__detail-line">
            <span className="occ__detail-label">📦</span>
            <span className="occ__detail-value">
              Поставка: {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU')}
              {context === 'preorder_waiting' && (() => {
                const cd = getDaysUntil(order.preorder_delivery_date);
                return <span className={cd.className}> — {cd.label}</span>;
              })()}
            </span>
          </div>
        )}

        {/* Points */}
        {(order.points_discount ?? 0) > 0 && (
          <div className="occ__detail-line">
            <span className="occ__detail-label">🎁</span>
            <span className="occ__detail-value occ__detail-value--accent">
              −{order.points_discount} ₽ ({order.points_used} баллов)
            </span>
          </div>
        )}

        {/* Preorder label */}
        {order.is_preorder && <span className="occ__preorder-label">Предзаказ</span>}

        {/* Created */}
        <div className="occ__created">{formatDate(order.created_at)}</div>
      </div>

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

  if (context === 'pending') {
    buttons.push(
      <button key="accept" className="btn btn-sm btn-primary" onClick={() => onAccept?.(order)}>✅ Принять</button>,
      <button key="reject" className="btn btn-sm btn-secondary" onClick={() => onReject?.(order.id)}>❌ Отклонить</button>,
    );
  }

  if (context === 'preorder_requests') {
    buttons.push(
      <button key="accept" className="btn btn-sm btn-primary" onClick={() => onAccept?.(order)}>✅ Принять</button>,
      <button key="reject" className="btn btn-sm btn-secondary" onClick={() => onReject?.(order.id)}>❌ Отклонить</button>,
    );
  }

  if (context === 'preorder_waiting' && order.preorder_delivery_date) {
    const cd = getDaysUntil(order.preorder_delivery_date);
    if (cd.days <= 0) {
      buttons.push(
        <button key="assemble" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'assembling')}>📦 Собирать</button>,
      );
    }
  }

  if (context === 'active') {
    if (!pickup) {
      // Delivery flow
      if (order.status === 'accepted') {
        buttons.push(
          <button key="assembling" className="btn btn-sm btn-secondary" onClick={() => onStatusChange?.(order.id, 'assembling')}>📦 Собирается</button>,
          <button key="in_transit" className="btn btn-sm btn-secondary" onClick={() => onStatusChange?.(order.id, 'in_transit')}>🚚 В пути</button>,
          <button key="done" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'done')}>✅ Выполнен</button>,
        );
      } else if (order.status === 'assembling') {
        buttons.push(
          <button key="in_transit" className="btn btn-sm btn-secondary" onClick={() => onStatusChange?.(order.id, 'in_transit')}>🚚 В пути</button>,
          <button key="done" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'done')}>✅ Выполнен</button>,
        );
      } else if (order.status === 'in_transit') {
        buttons.push(
          <button key="done" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'done')}>✅ Выполнен</button>,
        );
      }
    } else {
      // Pickup flow
      if (order.status === 'accepted') {
        buttons.push(
          <button key="assembling" className="btn btn-sm btn-secondary" onClick={() => onStatusChange?.(order.id, 'assembling')}>📦 Собирается</button>,
          <button key="ready" className="btn btn-sm btn-secondary" onClick={() => onStatusChange?.(order.id, 'ready_for_pickup')}>✅ Готов к выдаче</button>,
          <button key="done" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'done')}>✅ Выполнен</button>,
        );
      } else if (order.status === 'assembling') {
        buttons.push(
          <button key="ready" className="btn btn-sm btn-secondary" onClick={() => onStatusChange?.(order.id, 'ready_for_pickup')}>✅ Готов к выдаче</button>,
          <button key="done" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'done')}>✅ Выполнен</button>,
        );
      } else if (order.status === 'ready_for_pickup') {
        buttons.push(
          <button key="done" className="btn btn-sm btn-primary" onClick={() => onStatusChange?.(order.id, 'done')}>✅ Выполнен</button>,
        );
      }
    }
  }

  if (buttons.length === 0) return null;

  return <div className="occ__actions">{buttons}</div>;
}
