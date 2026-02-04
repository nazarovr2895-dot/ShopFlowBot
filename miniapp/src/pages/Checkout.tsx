import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './Checkout.css';

export function Checkout() {
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [fio, setFio] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'Доставка' | 'Самовывоз'>('Доставка');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setBackButton(true, () => navigate('/cart'));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fio.trim() || !phone.trim()) {
      showAlert('Заполните ФИО и телефон');
      return;
    }
    if (deliveryType === 'Доставка' && !address.trim()) {
      showAlert('Укажите адрес доставки');
      return;
    }
    setSubmitting(true);
    try {
      hapticFeedback('medium');
      const { orders } = await api.checkoutCart({
        fio: fio.trim(),
        phone: phone.trim(),
        delivery_type: deliveryType,
        address: deliveryType === 'Самовывоз' ? 'Самовывоз' : address.trim(),
      });
      setSubmitting(false);
      showAlert(`Заказ оформлен! Создано заказов: ${orders.length}. Статус можно отслеживать в разделе «Мои заказы».`);
      navigate('/orders');
    } catch (e) {
      setSubmitting(false);
      showAlert(e instanceof Error ? e.message : 'Ошибка оформления');
    }
  };

  return (
    <div className="checkout-page">
      <h1 className="checkout-page__title">Оформление заказа</h1>
      <form className="checkout-form" onSubmit={handleSubmit}>
        <label className="checkout-form__label">
          ФИО
          <input
            type="text"
            className="checkout-form__input"
            value={fio}
            onChange={(e) => setFio(e.target.value)}
            placeholder="Имя Фамилия"
            required
          />
        </label>
        <label className="checkout-form__label">
          Телефон
          <input
            type="tel"
            className="checkout-form__input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 ..."
            required
          />
        </label>
        <div className="checkout-form__label">
          Способ получения
          <div className="checkout-form__radio-group">
            <label className="checkout-form__radio">
              <input
                type="radio"
                name="delivery"
                checked={deliveryType === 'Доставка'}
                onChange={() => setDeliveryType('Доставка')}
              />
              <span>Доставка</span>
            </label>
            <label className="checkout-form__radio">
              <input
                type="radio"
                name="delivery"
                checked={deliveryType === 'Самовывоз'}
                onChange={() => setDeliveryType('Самовывоз')}
              />
              <span>Самовывоз</span>
            </label>
          </div>
        </div>
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
        <button
          type="submit"
          className="checkout-form__submit"
          disabled={submitting}
        >
          {submitting ? 'Оформляем…' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
  );
}
