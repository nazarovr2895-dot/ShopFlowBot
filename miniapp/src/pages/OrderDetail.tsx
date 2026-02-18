import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { BuyerOrder } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './OrderDetail.css';

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Ожидает подтверждения продавца',
  accepted: '✅ Принят продавцом',
  assembling: '📦 Собирается',
  in_transit: '🚚 В пути',
  done: '📬 Доставлен (подтвердите получение)',
  completed: '✅ Получен',
  rejected: '❌ Отклонён',
  cancelled: '🚫 Отменён',
};

const CAN_CONFIRM = ['done', 'in_transit', 'assembling', 'accepted'];
const CAN_CANCEL = ['pending', 'accepted'];

export function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setBackButton(true, () => navigate('/orders'));
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

  const handleConfirm = async () => {
    if (!orderId || !order) return;
    if (!CAN_CONFIRM.includes(order.status)) return;
    setConfirming(true);
    try {
      hapticFeedback('medium');
      await api.confirmOrderReceived(order.id);
      showAlert('Спасибо! Заказ отмечен как полученный.');
      const orders = await api.getMyOrders();
      const updated = orders.find((o) => o.id === order.id);
      setOrder(updated ?? null);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!orderId || !order) return;
    if (!order.is_preorder || !CAN_CANCEL.includes(order.status)) return;
    setCancelling(true);
    try {
      hapticFeedback('medium');
      const result = await api.cancelOrder(order.id);
      let msg = 'Предзаказ отменён.';
      if (result.points_refunded && result.points_refunded > 0) {
        msg += ` Возвращено ${result.points_refunded} баллов.`;
      }
      showAlert(msg);
      const orders = await api.getMyOrders();
      const updated = orders.find((o) => o.id === order.id);
      setOrder(updated ?? null);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setCancelling(false);
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

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
  const canConfirm = CAN_CONFIRM.includes(order.status);
  const canCancel = order.is_preorder && CAN_CANCEL.includes(order.status);

  return (
    <div className="order-detail-page">
      <h1 className="order-detail-page__title">
        {order.is_preorder ? 'Предзаказ' : 'Заказ'} #{order.id}
      </h1>
      <div className="order-detail-card">
        <div className="order-detail__row">
          <span className="order-detail__label">Статус</span>
          <span className="order-detail__value">{STATUS_LABELS[order.status] ?? order.status}</span>
        </div>
        {order.is_preorder && order.preorder_delivery_date && (
          <div className="order-detail__row">
            <span className="order-detail__label">Дата доставки</span>
            <span className="order-detail__value" style={{ fontWeight: 600 }}>
              {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU')}
            </span>
          </div>
        )}
        <div className="order-detail__row">
          <span className="order-detail__label">Товары</span>
          <span className="order-detail__value order-detail__items">{order.items_info}</span>
        </div>
        <div className="order-detail__row">
          <span className="order-detail__label">Сумма</span>
          <span className="order-detail__value">{formatPrice(order.total_price)}</span>
        </div>
        <div className="order-detail__row">
          <span className="order-detail__label">{order.delivery_type}</span>
          <span className="order-detail__value order-detail__address">{order.address || '—'}</span>
        </div>
        {order.created_at && (
          <div className="order-detail__row">
            <span className="order-detail__label">Дата оформления</span>
            <span className="order-detail__value">
              {new Date(order.created_at).toLocaleString('ru-RU')}
            </span>
          </div>
        )}
      </div>
      {canConfirm && (
        <button
          type="button"
          className="order-detail__confirm-btn"
          onClick={handleConfirm}
          disabled={confirming}
        >
          {confirming ? 'Отправляем…' : '✅ Подтвердить получение'}
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          className="order-detail__cancel-btn"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? 'Отменяем…' : '🚫 Отменить предзаказ'}
        </button>
      )}
    </div>
  );
}
