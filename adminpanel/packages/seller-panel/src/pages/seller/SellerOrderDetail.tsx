import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getOrder } from '../../api/sellerClient';
import type { SellerOrderDetail as SellerOrderDetailType } from '../../api/sellerClient';
import { formatItemsInfo, formatAddress } from '@shared/utils/formatters';
import './SellerOrders.css';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  ready_for_pickup: 'Готов к выдаче',
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
};

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru');
  } catch {
    return iso;
  }
}

export function SellerOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<SellerOrderDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = orderId ? parseInt(orderId, 10) : NaN;
    if (isNaN(id)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getOrder(id)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch(() => {
        if (!cancelled) setOrder(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) {
    return (
      <div className="seller-orders-page">
        <div className="orders-loading"><div className="loader" /></div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="seller-orders-page">
        <button type="button" className="back" onClick={() => navigate('/orders')}>
          ← К списку заказов
        </button>
        <p>Заказ не найден.</p>
      </div>
    );
  }

  const deliveryLabel = order.delivery_type === 'delivery' ? 'Доставка' : 'Самовывоз';

  return (
    <div className="seller-orders-page seller-order-detail">
      <button type="button" className="back no-print" onClick={() => navigate('/orders')}>
        ← К списку заказов
      </button>
      <div className="order-card card order-detail-card">
        <div className="order-print-area">
          <div className="print-label-header">
            <span className="print-order-id">Заказ #{order.id}</span>
          </div>
          {order.address && (
            <div className="print-address">
              <strong>Адрес:</strong> {formatAddress(order.address)}
            </div>
          )}
          <div className="print-items">
            <strong>Состав:</strong> {formatItemsInfo(order.items_info)}
          </div>
          <div className="print-delivery">
            <strong>Доставка:</strong> {deliveryLabel}
          </div>
          {order.recipient_name && (
            <div className="print-recipient">
              <strong>Получатель:</strong> {order.recipient_name}
              {order.recipient_phone ? ` (${order.recipient_phone})` : ''}
            </div>
          )}
          {order.gift_note && (
            <div className="print-gift-note">
              <strong>Записка:</strong> {order.gift_note}
            </div>
          )}
          <div className="print-meta">
            <span>Сумма: {order.total_price} ₽</span>
            <span>Создан: {formatDate(order.created_at)}</span>
          </div>
          <div className="print-label-footer">
            <span className="print-order-id">Заказ #{order.id}</span>
          </div>
        </div>

        <div className="order-header">
          <span className="order-id">Заказ #{order.id}</span>
          <span className={`order-status status-${order.status}`}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
        <div className="order-body">
          <h3>Покупатель</h3>
          <p><strong>ФИО:</strong> {order.buyer_fio ?? '—'}</p>
          <p><strong>Телефон:</strong> {order.buyer_phone ?? '—'}</p>
          {order.customer_id != null && (
            <p>
              <Link to={`/customers/${order.customer_id}`}>Клиент по программе лояльности →</Link>
            </p>
          )}
          {order.recipient_name && (
            <>
              <h3>Получатель</h3>
              <p><strong>Имя:</strong> {order.recipient_name}</p>
              {order.recipient_phone && (
                <p><strong>Телефон:</strong> {order.recipient_phone}</p>
              )}
            </>
          )}
          {order.gift_note && (
            <>
              <h3>Записка к цветам</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{order.gift_note}</p>
            </>
          )}
          <h3>Состав</h3>
          <p>{formatItemsInfo(order.items_info)}</p>
          <p><strong>Сумма:</strong> {order.total_price} ₽</p>
          {order.original_price != null && Math.abs((order.original_price ?? 0) - (order.total_price ?? 0)) > 0.01 && (
            <p className="original-price">Было: {order.original_price} ₽</p>
          )}
          {order.is_preorder && (
            <>
              <h3>Предзаказ</h3>
              <p><strong>Дата поставки (предзаказ):</strong> {order.preorder_delivery_date ? new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU') : '—'}</p>
            </>
          )}
          <h3>Доставка</h3>
          <p><strong>Способ:</strong> {deliveryLabel}</p>
          {order.address && <p><strong>Адрес:</strong> {formatAddress(order.address)}</p>}
          <p className="order-date"><strong>Создан:</strong> {formatDate(order.created_at)}</p>
          {order.completed_at && (
            <p className="order-date"><strong>Завершён:</strong> {formatDate(order.completed_at)}</p>
          )}
        </div>
        <div className="order-detail-actions no-print">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.print()}
          >
            Печать / этикетка
          </button>
        </div>
      </div>
    </div>
  );
}
