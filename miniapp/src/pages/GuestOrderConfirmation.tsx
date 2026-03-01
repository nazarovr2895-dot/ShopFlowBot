import { useLocation, useNavigate } from 'react-router-dom';
import { DesktopBackNav } from '../components';
import { formatPrice } from '../utils/formatters';
import './Checkout.css';

interface OrderInfo {
  order_id: number;
  seller_id: number;
  total_price: number;
}

export function GuestOrderConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { orders?: OrderInfo[]; guest_phone?: string } | null;

  const orders = state?.orders ?? [];
  const guestPhone = state?.guest_phone ?? '';

  if (orders.length === 0) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Заказ</h1>
        <p style={{ color: 'var(--tg-theme-hint-color, #999)', textAlign: 'center', marginTop: 40 }}>
          Нет данных о заказе
        </p>
        <button
          type="button"
          className="checkout-form__submit"
          onClick={() => navigate('/catalog')}
          style={{ marginTop: 16 }}
        >
          В каталог
        </button>
      </div>
    );
  }

  const totalSum = orders.reduce((s, o) => s + o.total_price, 0);

  return (
    <>
    <DesktopBackNav title="Подтверждение заказа" />
    <div className="checkout-page">
      <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 24 }}>
        <span style={{ fontSize: 48 }}>✅</span>
      </div>

      <h1 className="checkout-page__title" style={{ textAlign: 'center' }}>
        {orders.length > 1 ? 'Заказы оформлены!' : 'Заказ оформлен!'}
      </h1>

      <div className="checkout-summary" style={{ marginBottom: 24 }}>
        {orders.map((o) => (
          <div key={o.order_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--tg-theme-hint-color, rgba(0,0,0,0.08))' }}>
            <span style={{ fontWeight: 600 }}>Заказ #{o.order_id}</span>
            <span>{formatPrice(o.total_price)}</span>
          </div>
        ))}
        {orders.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontWeight: 700, fontSize: 16 }}>
            <span>Итого</span>
            <span>{formatPrice(totalSum)}</span>
          </div>
        )}
      </div>

      {guestPhone && (
        <p style={{ textAlign: 'center', color: 'var(--tg-theme-text-color)', fontSize: 15, lineHeight: 1.5 }}>
          Продавец свяжется с вами по номеру <strong>{guestPhone}</strong>
        </p>
      )}

      <button
        type="button"
        className="checkout-form__submit"
        onClick={() => navigate('/catalog')}
        style={{ marginTop: 24 }}
      >
        Продолжить покупки
      </button>
    </div>
    </>
  );
}
