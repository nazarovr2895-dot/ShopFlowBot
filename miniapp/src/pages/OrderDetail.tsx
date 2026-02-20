import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { BuyerOrder } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, DesktopBackNav } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isTelegram } from '../utils/environment';
import './OrderDetail.css';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  accepted: 'Принят продавцом',
  assembling: 'Собирается',
  in_transit: 'В пути',
  done: 'Доставлен',
  completed: 'Получен',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f39c12',
  accepted: '#27ae60',
  assembling: '#3498db',
  in_transit: '#9b59b6',
  done: '#2ecc71',
  completed: '#95a5a6',
  rejected: '#e74c3c',
  cancelled: '#95a5a6',
};

const CAN_CONFIRM = ['done', 'in_transit', 'assembling', 'accepted'];
const CAN_CANCEL = ['pending', 'accepted', 'assembling'];

// Stepper steps in order
const STEPPER_STEPS = [
  { key: 'pending', label: 'Оформлен' },
  { key: 'accepted', label: 'Принят' },
  { key: 'assembling', label: 'Собирается' },
  { key: 'in_transit', label: 'В пути' },
  { key: 'done', label: 'Доставлен' },
];

function getStepIndex(status: string): number {
  const idx = STEPPER_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

/** Strip product IDs from items_info: "123:Розы x 2" -> "Розы x 2" */
function parseItemsDisplay(itemsInfo: string): string {
  return itemsInfo.replace(/\d+:/g, '');
}

/** Strip phone/name lines from address (they were concatenated during checkout) */
function formatDeliveryAddress(address: string | null): string {
  if (!address) return '—';
  return address
    .split('\n')
    .filter(line => !line.startsWith('📞') && !line.startsWith('👤'))
    .join('\n')
    .trim() || '—';
}

const formatPrice = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

export function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert, showConfirm } = useTelegramWebApp();
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setBackButton(true, () => navigate('/?tab=orders'));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  useEffect(() => {
    const load = async () => {
      if (!orderId) return;
      try {
        const orders = await api.getMyOrders();
        const found = orders.find((o) => o.id === parseInt(orderId, 10));
        setOrder(found ?? null);
      } catch (e) {
        console.error(e);
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  const refreshOrder = async () => {
    if (!orderId) return;
    try {
      const orders = await api.getMyOrders();
      const updated = orders.find((o) => o.id === parseInt(orderId, 10));
      setOrder(updated ?? null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirm = async () => {
    if (!order || !CAN_CONFIRM.includes(order.status)) return;
    setConfirming(true);
    try {
      hapticFeedback('medium');
      await api.confirmOrderReceived(order.id);
      showAlert('Спасибо! Заказ отмечен как полученный.');
      await refreshOrder();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    if (!order || !CAN_CANCEL.includes(order.status)) return;
    showConfirm('Вы уверены, что хотите отменить заказ?', async (confirmed) => {
      if (!confirmed) return;
      setCancelling(true);
      try {
        hapticFeedback('medium');
        const result = await api.cancelOrder(order.id);
        let msg = 'Заказ отменён.';
        if (result.points_refunded && result.points_refunded > 0) {
          msg += ` Возвращено ${result.points_refunded} баллов.`;
        }
        showAlert(msg);
        await refreshOrder();
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        setCancelling(false);
      }
    });
  };

  const handleContactSeller = () => {
    if (!order) return;
    hapticFeedback('light');

    if (order.seller_username) {
      // If seller has a username, use the standard t.me link
      const url = `https://t.me/${order.seller_username}`;
      if (isTelegram()) {
        try {
          const WebApp = (window as any).Telegram?.WebApp;
          WebApp?.openTelegramLink(url);
        } catch {
          window.open(url, '_blank');
        }
      } else {
        window.open(url, '_blank');
      }
    } else {
      // Fallback: use tg://user?id= protocol for sellers without username
      window.open(`tg://user?id=${order.seller_id}`, '_blank');
    }
  };

  const handleOpenMap = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!order?.seller_map_url) return;
    if (isTelegram()) {
      e.preventDefault();
      hapticFeedback('light');
      try {
        const WebApp = (window as any).Telegram?.WebApp;
        WebApp?.openLink(order.seller_map_url);
      } catch {
        window.open(order.seller_map_url, '_blank');
      }
    }
  };

  if (loading) return <Loader centered />;
  if (!order) {
    return (
      <div className="order-detail-page">
        <EmptyState title="Заказ не найден" description="" icon="📦" />
      </div>
    );
  }

  const canConfirm = CAN_CONFIRM.includes(order.status);
  const canCancel = CAN_CANCEL.includes(order.status);
  const stepIndex = getStepIndex(order.status);
  const isTerminal = order.status === 'rejected' || order.status === 'cancelled';
  const isCompleted = order.status === 'completed';
  const showStepper = !isTerminal && !isCompleted;

  return (
    <>
    <DesktopBackNav title={`${order.is_preorder ? 'Предзаказ' : 'Заказ'} #${order.id}`} />
    <div className="order-detail-page">
      <h1 className="order-detail-page__title">
        {order.is_preorder ? 'Предзаказ' : 'Заказ'} #{order.id}
      </h1>

      {/* Status section */}
      {showStepper ? (
        <div className="order-stepper">
          {STEPPER_STEPS.map((step, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={step.key} className="order-stepper__step">
                <div
                  className={`order-stepper__dot ${
                    isDone ? 'order-stepper__dot--done' : ''
                  } ${isCurrent ? 'order-stepper__dot--current' : ''}`}
                />
                {i < STEPPER_STEPS.length - 1 && (
                  <div
                    className={`order-stepper__line ${
                      isDone ? 'order-stepper__line--done' : ''
                    }`}
                  />
                )}
                <span
                  className={`order-stepper__label ${
                    isCurrent ? 'order-stepper__label--current' : ''
                  } ${isDone ? 'order-stepper__label--done' : ''}`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="order-detail__status-badge"
          style={{
            color: STATUS_COLORS[order.status] || '#95a5a6',
            borderColor: STATUS_COLORS[order.status] || '#95a5a6',
          }}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </div>
      )}

      {/* Shop info card */}
      <div className="order-detail__shop-card">
        <div className="order-detail__shop-row">
          <div>
            <span className="order-detail__shop-label">Магазин</span>
            <span className="order-detail__shop-name">{order.shop_name || 'Магазин'}</span>
          </div>
          <button
            type="button"
            className="order-detail__contact-btn"
            onClick={handleContactSeller}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Написать
          </button>
        </div>
      </div>

      {/* Order details card */}
      <div className="order-detail-card">
        {order.is_preorder && order.preorder_delivery_date && (
          <div className="order-detail__row">
            <span className="order-detail__label">Дата доставки</span>
            <span className="order-detail__value" style={{ fontWeight: 600 }}>
              {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
        )}

        <div className="order-detail__row">
          <span className="order-detail__label">Состав заказа</span>
          <span className="order-detail__value order-detail__items">
            {parseItemsDisplay(order.items_info)}
          </span>
        </div>

        <div className="order-detail__row">
          <span className="order-detail__label">Сумма</span>
          <span className="order-detail__value order-detail__price">
            {formatPrice(order.total_price)}
          </span>
        </div>

        <div className="order-detail__row">
          <span className="order-detail__label">{order.delivery_type || 'Доставка'}</span>
          {order.delivery_type === 'Самовывоз' && (order.seller_address_name || order.seller_map_url) ? (
            <div className="order-detail__pickup">
              {order.seller_address_name && (
                <div className="order-detail__pickup-address">
                  {order.seller_address_name}
                </div>
              )}
              {order.seller_map_url && (
                <a
                  href={order.seller_map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="order-detail__pickup-map-btn"
                  onClick={handleOpenMap}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Показать на карте
                </a>
              )}
            </div>
          ) : (
            <span className="order-detail__value order-detail__address">
              {formatDeliveryAddress(order.address)}
            </span>
          )}
        </div>

        {order.created_at && (
          <div className="order-detail__row">
            <span className="order-detail__label">Дата оформления</span>
            <span className="order-detail__value">
              {new Date(order.created_at).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="order-detail__actions">
        {canConfirm && (
          <button
            type="button"
            className="order-detail__action-btn order-detail__action-btn--primary"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? 'Подтверждаем...' : 'Подтвердить получение'}
          </button>
        )}

        {canCancel && (
          <button
            type="button"
            className="order-detail__action-btn order-detail__action-btn--danger"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Отменяем...' : 'Отменить заказ'}
          </button>
        )}
      </div>
    </div>
    </>
  );
}
