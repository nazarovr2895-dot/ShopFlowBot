import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { EmptyState, ProductImage, LoyaltyLoginBanner } from '../components';
import { getGuestCart, guestCartToGroups, clearGuestCart } from '../utils/guestCart';
import './Checkout.css';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let normalized = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  normalized = normalized.slice(0, 11);
  return normalized;
}

export function GuestCheckout() {
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'Доставка' | 'Самовывоз'>('Доставка');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartSellerGroup[]>([]);

  useEffect(() => {
    const items = getGuestCart();
    if (items.length === 0) {
      navigate('/cart', { replace: true });
      return;
    }
    setCart(guestCartToGroups(items));
  }, [navigate]);

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

  const totalGoods = cart.reduce((sum, g) => sum + g.total, 0);
  const totalItemCount = cart.reduce((s, g) => s + g.items.length, 0);

  const itemCountLabel = (n: number) => {
    if (n === 1) return '1 товар';
    if (n >= 2 && n <= 4) return `${n} товара`;
    return `${n} товаров`;
  };

  const canSubmit = guestPhone.trim().length > 0 &&
    guestName.trim().length > 0 &&
    (deliveryType === 'Самовывоз' || address.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalized = normalizePhone(guestPhone);
    if (normalized.length !== 11 || normalized[0] !== '7') {
      alert('Неверный формат телефона. Введите номер в формате +7...');
      return;
    }
    if (deliveryType === 'Доставка' && !address.trim()) {
      alert('Укажите адрес доставки');
      return;
    }

    setSubmitting(true);
    try {
      const allItems = getGuestCart().map((i) => ({
        product_id: i.product_id,
        seller_id: i.seller_id,
        quantity: i.quantity,
        name: i.name,
        price: i.price,
      }));

      const { orders } = await api.guestCheckout({
        guest_name: guestName.trim() || 'Покупатель',
        guest_phone: normalized,
        delivery_type: deliveryType,
        address: deliveryType === 'Самовывоз' ? 'Самовывоз' : address.trim(),
        comment: comment.trim() || undefined,
        items: allItems,
      });

      clearGuestCart();
      navigate('/order/guest-confirm', {
        state: { orders, guest_phone: normalized },
        replace: true,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка оформления заказа');
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <EmptyState
          title="Корзина пуста"
          description="Добавьте товары в корзину и вернитесь к оформлению"
          icon="🛒"
        />
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <h1 className="checkout-page__title">Оформление заказа</h1>

      {!bannerDismissed && (
        <LoyaltyLoginBanner
          onDismiss={() => setBannerDismissed(true)}
          onLogin={() => navigate('/profile?from=checkout')}
        />
      )}

      {/* Delivery type selector */}
      <div className="checkout-delivery-segment">
        <span className="checkout-delivery-segment__label">Способ получения</span>
        <div className="checkout-delivery-segment__buttons">
          <button
            type="button"
            className={`checkout-delivery-segment__btn ${deliveryType === 'Самовывоз' ? 'checkout-delivery-segment__btn--active' : ''}`}
            onClick={() => setDeliveryType('Самовывоз')}
          >
            Самовывоз
          </button>
          <button
            type="button"
            className={`checkout-delivery-segment__btn ${deliveryType === 'Доставка' ? 'checkout-delivery-segment__btn--active' : ''}`}
            onClick={() => setDeliveryType('Доставка')}
          >
            Курьером
          </button>
        </div>
      </div>

      {/* Order summary */}
      <div className="checkout-summary">
        <div className="checkout-summary__header">
          <h2 className="checkout-summary__title">Ваш заказ</h2>
          <span className="checkout-summary__count">{itemCountLabel(totalItemCount)}</span>
        </div>
        {cart.map((group) => (
          <div key={group.seller_id} className="checkout-summary__group">
            <div className="checkout-summary__shop">{group.shop_name}</div>
            <ul className="checkout-summary__list">
              {group.items.map((item) => (
                <li key={item.product_id} className="checkout-summary__item">
                  <div className="checkout-summary__item-image-wrap">
                    <ProductImage
                      src={api.getProductImageUrl(item.photo_id ?? null)}
                      alt={item.name}
                      className="checkout-summary__item-image"
                      placeholderClassName="checkout-summary__item-image-placeholder"
                      placeholderIconClassName="checkout-summary__item-image-placeholder-icon"
                    />
                  </div>
                  <div className="checkout-summary__item-body">
                    <span className="checkout-summary__item-name">{item.name}</span>
                    <div className="checkout-summary__item-meta">
                      <span className="checkout-summary__item-qty">{item.quantity} шт</span>
                      <span className="checkout-summary__item-price">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="checkout-summary__group-total">
              Итого: {formatPrice(group.total)}
            </div>
          </div>
        ))}
        <div className="checkout-summary__grand-total">
          К оплате: {formatPrice(totalGoods)}
        </div>
      </div>

      {/* Checkout form */}
      <form className="checkout-form" onSubmit={handleSubmit}>
        <label className="checkout-form__label">
          Имя получателя *
          <input
            type="text"
            className="checkout-form__input"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="ФИО или имя"
            required
          />
        </label>

        <label className="checkout-form__label">
          Телефон *
          <input
            type="tel"
            className="checkout-form__input"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="+7 999 123 45 67"
            required
          />
        </label>

        {deliveryType === 'Доставка' && (
          <label className="checkout-form__label">
            Адрес доставки *
            <input
              type="text"
              className="checkout-form__input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Улица, дом, квартира"
              required
            />
          </label>
        )}

        <label className="checkout-form__label">
          Комментарий к заказу
          <textarea
            className="checkout-form__input checkout-form__textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Код домофона, этаж, удобное время, пожелания"
            rows={3}
          />
        </label>

        <button
          type="submit"
          className="checkout-form__submit"
          disabled={submitting || !canSubmit}
        >
          {submitting ? 'Оформляем...' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
  );
}
