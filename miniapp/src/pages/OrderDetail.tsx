import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { BuyerOrder } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, DesktopBackNav, OrderProductInfoModal, showBrowserToast } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isTelegram } from '../utils/environment';
import { parseItemsStructured, formatDeliveryAddress, formatPrice } from '../utils/formatters';
import { STATUS_LABELS_DETAIL as STATUS_LABELS, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '../utils/orderConstants';
import './OrderDetail.css';

const CAN_CONFIRM = ['done', 'in_transit', 'ready_for_pickup', 'assembling', 'accepted'];
const CAN_CANCEL = ['pending', 'accepted', 'assembling'];

// Stepper steps — different for delivery vs pickup
const STEPPER_STEPS_DELIVERY = [
  { key: 'pending', label: 'Оформлен' },
  { key: 'accepted', label: 'Принят' },
  { key: 'assembling', label: 'Собирается' },
  { key: 'in_transit', label: 'В пути' },
  { key: 'done', label: 'Доставлен' },
];

const STEPPER_STEPS_PICKUP = [
  { key: 'pending', label: 'Оформлен' },
  { key: 'accepted', label: 'Принят' },
  { key: 'assembling', label: 'Собирается' },
  { key: 'ready_for_pickup', label: 'Готов к выдаче' },
  { key: 'done', label: 'Забран' },
];

function isPickup(type?: string): boolean {
  if (!type) return false;
  const v = type.trim().toLowerCase();
  return v === 'pickup' || v === 'самовывоз';
}

function getStepperSteps(deliveryType: string) {
  return isPickup(deliveryType) ? STEPPER_STEPS_PICKUP : STEPPER_STEPS_DELIVERY;
}

function getStepIndex(status: string, deliveryType: string): number {
  const steps = getStepperSteps(deliveryType);
  const idx = steps.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

export function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert, showConfirm } = useTelegramWebApp();
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

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

  const handlePay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      hapticFeedback('medium');
      const returnUrl = window.location.origin + `/order/${order.id}`;
      const result = await api.createPayment(order.id, returnUrl);
      if (result.confirmation_url) {
        // Redirect to YuKassa payment page
        if (isTelegram()) {
          try {
            const WebApp = (window as any).Telegram?.WebApp;
            WebApp?.openLink(result.confirmation_url);
          } catch {
            window.location.href = result.confirmation_url;
          }
        } else {
          window.location.href = result.confirmation_url;
        }
      } else {
        showAlert('Не удалось получить ссылку для оплаты. Попробуйте позже.');
      }
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка создания платежа');
    } finally {
      setPaying(false);
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
  const stepperSteps = getStepperSteps(order.delivery_type);
  const stepIndex = getStepIndex(order.status, order.delivery_type);
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
          {stepperSteps.map((step, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={step.key} className="order-stepper__step">
                <div
                  className={`order-stepper__dot ${
                    isDone ? 'order-stepper__dot--done' : ''
                  } ${isCurrent ? 'order-stepper__dot--current' : ''}`}
                />
                {i < stepperSteps.length - 1 && (
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
          <div className="order-detail__shop-actions">
            <button
              type="button"
              className="order-detail__shop-btn"
              onClick={() => navigate(`/shop/${order.seller_id}`)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              В магазин
            </button>
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
          <div className="order-detail__items-list">
            {parseItemsStructured(order.items_info).map((item, i) => (
              <div key={i} className="order-detail__item-row">
                <div className="order-detail__item-info">
                  <span className="order-detail__item-name">{item.name}</span>
                  <span className="order-detail__item-qty">
                    {item.quantity > 1 ? ` x ${item.quantity}` : ''}
                    {item.price > 0 ? ` — ${formatPrice(item.price * item.quantity)}` : ''}
                  </span>
                </div>
                {item.productId > 0 && (
                  <button
                    type="button"
                    className="order-detail__item-info-btn"
                    onClick={() => setSelectedProductId(item.productId)}
                  >
                    О товаре
                  </button>
                )}
              </div>
            ))}
          </div>
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
                <div className="order-detail__pickup-address-row">
                  <div className="order-detail__pickup-address">
                    {order.seller_address_name}
                  </div>
                  <button
                    type="button"
                    className="order-detail__copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(order.seller_address_name!).then(
                        () => showBrowserToast('Адрес скопирован'),
                        () => showBrowserToast('Не удалось скопировать'),
                      );
                      hapticFeedback('light');
                    }}
                    aria-label="Скопировать адрес"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
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

      {/* Payment status / method */}
      {order.payment_method === 'on_pickup' ? (
        <div className="order-detail__row" style={{ marginTop: 8, marginBottom: 4 }}>
          <span className="order-detail__label">Оплата</span>
          <span className="order-detail__value" style={{ fontWeight: 600, color: '#f39c12' }}>
            При получении
          </span>
        </div>
      ) : order.payment_id && order.payment_status ? (
        <div className="order-detail__row" style={{ marginTop: 8, marginBottom: 4 }}>
          <span className="order-detail__label">Оплата</span>
          <span
            className="order-detail__value"
            style={{
              fontWeight: 600,
              color: PAYMENT_STATUS_COLORS[order.payment_status] || '#95a5a6',
            }}
          >
            {PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}
          </span>
        </div>
      ) : null}

      {/* Gift note */}
      {order.gift_note && (
        <div className="order-detail__row" style={{ marginTop: 8, marginBottom: 4 }}>
          <span className="order-detail__label">Записка к цветам</span>
          <span className="order-detail__value" style={{ whiteSpace: 'pre-wrap' }}>
            {order.gift_note}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="order-detail__actions">
        {/* Pay button — show for accepted orders with online payment that are not yet paid */}
        {order.status === 'accepted' &&
          order.payment_method !== 'on_pickup' &&
          order.payment_status !== 'succeeded' &&
          order.payment_status !== 'waiting_for_capture' && (
            <button
              type="button"
              className="order-detail__action-btn order-detail__action-btn--primary"
              onClick={handlePay}
              disabled={paying}
              style={{ background: '#6c5ce7' }}
            >
              {paying ? 'Создаём платёж...' : `💳 Оплатить ${formatPrice(order.total_price)}`}
            </button>
          )}

        {canConfirm && (order.payment_method === 'on_pickup' || !order.payment_id || order.payment_status === 'succeeded') && (
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

    <OrderProductInfoModal
      productId={selectedProductId ?? 0}
      isOpen={selectedProductId !== null}
      onClose={() => setSelectedProductId(null)}
    />
    </>
  );
}
