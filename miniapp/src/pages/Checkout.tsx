import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { EmptyState, ProductImage } from '../components';
import './Checkout.css';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let normalized = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  normalized = normalized.slice(0, 11);
  return normalized;
}

export function Checkout() {
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert, requestContact, user: telegramUser } = useTelegramWebApp();
  const [user, setUser] = useState<{
    tg_id: number;
    fio?: string;
    phone?: string;
    username?: string;
  } | null>(null);
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState<'Доставка' | 'Самовывоз'>('Доставка');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestingContact, setRequestingContact] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [fioInput, setFioInput] = useState('');
  const [commentInput, setCommentInput] = useState('');

  useEffect(() => {
    setBackButton(true, () => navigate('/cart'));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  const loadUserAndCart = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, cartData] = await Promise.all([
        api.getCurrentUser().catch((e) => {
          console.error(e);
          return null;
        }),
        api.getCart().catch((e) => {
          console.error(e);
          return [] as CartSellerGroup[];
        }),
      ]);
      setUser(userData ?? null);
      setCart(Array.isArray(cartData) ? cartData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserAndCart();
  }, [loadUserAndCart]);

  useEffect(() => {
    if (user || telegramUser) {
      const defaultFio = telegramUser?.first_name
        ? `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`.trim()
        : (user?.fio || '');
      setFioInput((prev) => (prev === '' ? defaultFio : prev));
    }
  }, [user?.fio, telegramUser?.first_name, telegramUser?.last_name]);

  const handleSavePhone = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 11 || normalized[0] !== '7') {
      showAlert('Неверный формат телефона');
      return false;
    }

    try {
      const updated = await api.updateProfile({ phone: normalized });
      setUser(updated);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сохранения';
      showAlert(message);
      return false;
    }
  };

  const handleRequestContact = async () => {
    setRequestingContact(true);
    try {
      const phoneNumber = await requestContact();
      if (!phoneNumber) {
        showAlert('Номер телефона не получен');
        return;
      }
      const saved = await handleSavePhone(phoneNumber);
      if (saved) {
        setEditingPhone(false);
        setPhoneInput('');
        showAlert('Номер телефона сохранен');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка запроса контакта';
      showAlert(message);
    } finally {
      setRequestingContact(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.phone) {
      showAlert('Необходимо указать номер телефона');
      return;
    }
    
    if (deliveryType === 'Доставка' && !address.trim()) {
      showAlert('Укажите адрес доставки');
      return;
    }
    
    setSubmitting(true);
    try {
      hapticFeedback('medium');
      const fio = (fioInput || '').trim() || 'Покупатель';

      const { orders } = await api.checkoutCart({
        fio,
        phone: user.phone,
        delivery_type: deliveryType,
        address: deliveryType === 'Самовывоз' ? 'Самовывоз' : address.trim(),
        ...(commentInput.trim() ? { comment: commentInput.trim() } : {}),
      });
      setSubmitting(false);
      const ordersMsg = orders.length > 1
        ? `Заказ оформлен! По одному заказу на каждый магазин — всего ${orders.length}. Статус можно отслеживать во вкладке «Мои заказы».`
        : `Заказ оформлен! Статус можно отслеживать во вкладке «Мои заказы».`;
      showAlert(ordersMsg);
      navigate('/?tab=orders');
    } catch (e) {
      setSubmitting(false);
      showAlert(e instanceof Error ? e.message : 'Ошибка оформления');
    }
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
  const totalGoods = cart.reduce((sum, g) => sum + g.total, 0);
  const totalDelivery = cart.reduce((sum, g) => sum + (g.delivery_price ?? 0), 0);
  const totalToPay = deliveryType === 'Доставка' ? totalGoods + totalDelivery : totalGoods;
  const totalItemCount = cart.reduce((s, g) => s + g.items.length, 0);
  const itemCountLabel = (n: number) => {
    if (n === 1) return '1 товар';
    if (n >= 2 && n <= 4) return `${n} товара`;
    return `${n} товаров`;
  };

  if (loading) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <EmptyState
          title="Корзина пуста"
          description="Добавьте товары в корзину и вернитесь к оформлению"
          icon="🛒"
        />
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

  return (
    <div className="checkout-page">
      <h1 className="checkout-page__title">Оформление заказа</h1>

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
              {(group.delivery_price ?? 0) > 0 && deliveryType === 'Доставка' && (
                <span> + доставка {formatPrice(group.delivery_price!)}</span>
              )}
            </div>
          </div>
        ))}
        <div className="checkout-summary__grand-total">
          К оплате: {formatPrice(totalToPay)}
        </div>
      </div>
      <form className="checkout-form" onSubmit={handleSubmit}>
        {(!user?.phone || editingPhone) && (
          <div className="checkout-form__label" style={{ marginBottom: '1rem' }}>
            <p style={{ marginBottom: '0.5rem', color: user?.phone ? undefined : '#ff6b6b' }}>
              {user?.phone ? 'Изменить номер телефона' : 'Для оформления заказа необходим номер телефона'}
            </p>
            <input
              type="tel"
              className="checkout-form__input"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+7 999 123 45 67"
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="checkout-form__submit"
                onClick={handleRequestContact}
                disabled={requestingContact}
              >
                {requestingContact ? 'Запрос…' : 'Поделиться номером'}
              </button>
              {editingPhone && (
                <>
                  <button
                    type="button"
                    className="checkout-form__submit"
                    onClick={async () => {
                      const ok = await handleSavePhone(phoneInput);
                      if (ok) {
                        setEditingPhone(false);
                        setPhoneInput('');
                      }
                    }}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="checkout-form__submit"
                    onClick={() => {
                      setEditingPhone(false);
                      setPhoneInput('');
                    }}
                    style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}
                  >
                    Отмена
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <label className="checkout-form__label" style={{ marginBottom: '0.5rem' }}>
          Имя получателя
          <input
            type="text"
            className="checkout-form__input"
            value={fioInput}
            onChange={(e) => setFioInput(e.target.value)}
            placeholder="ФИО или имя"
          />
        </label>

        {user?.phone && !editingPhone && (
          <div className="checkout-form__label checkout-form__phone-row">
            <span className="checkout-form__phone-label">Телефон</span>
            <div className="checkout-form__phone-block">
              <span className="checkout-form__phone-value">{user.phone}</span>
              <button
                type="button"
                onClick={() => {
                  setEditingPhone(true);
                  setPhoneInput(user.phone ?? '');
                }}
                className="checkout-form__link-btn"
              >
                Изменить
              </button>
            </div>
          </div>
        )}
        
        {deliveryType === 'Доставка' && (
          <label className="checkout-form__label">
            Адрес доставки
            <input
              type="text"
              className="checkout-form__input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Улица, дом, квартира"
              required={deliveryType === 'Доставка'}
            />
          </label>
        )}
        <label className="checkout-form__label">
          Комментарий к заказу
          <textarea
            className="checkout-form__input checkout-form__textarea"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Код домофона, этаж, удобное время, пожелания"
            rows={3}
          />
        </label>
        <button
          type="submit"
          className="checkout-form__submit"
          disabled={submitting || !user?.phone}
        >
          {submitting ? 'Оформляем…' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
  );
}
