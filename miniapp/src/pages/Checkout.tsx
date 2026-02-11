import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
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
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState<'Доставка' | 'Самовывоз'>('Доставка');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestingContact, setRequestingContact] = useState(false);

  useEffect(() => {
    setBackButton(true, () => navigate('/cart'));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  const loadUser = useCallback(async () => {
    try {
      const data = await api.getCurrentUser();
      setUser(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

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
      // Use Telegram first_name as FIO if available, otherwise use user.fio or empty string
      const fio = telegramUser?.first_name 
        ? `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`.trim()
        : (user.fio || '');
      
      const { orders } = await api.checkoutCart({
        fio: fio || 'Покупатель',
        phone: user.phone,
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

  if (loading) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <p>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <h1 className="checkout-page__title">Оформление заказа</h1>
      <form className="checkout-form" onSubmit={handleSubmit}>
        {!user?.phone && (
          <div className="checkout-form__label" style={{ marginBottom: '1rem' }}>
            <p style={{ marginBottom: '0.5rem', color: '#ff6b6b' }}>
              Для оформления заказа необходим номер телефона
            </p>
            <button
              type="button"
              className="checkout-form__submit"
              onClick={handleRequestContact}
              disabled={requestingContact}
              style={{ width: '100%' }}
            >
              {requestingContact ? 'Запрос…' : 'Поделиться номером телефона'}
            </button>
          </div>
        )}
        
        {user?.phone && (
          <div className="checkout-form__label" style={{ marginBottom: '1rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Контактные данные</span>
            <div style={{ padding: '0.75rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Имя:</strong> {telegramUser?.first_name || user.fio || 'Не указано'}
              </div>
              <div>
                <strong>Телефон:</strong> {user.phone}
              </div>
            </div>
          </div>
        )}
        
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
          disabled={submitting || !user?.phone}
        >
          {submitting ? 'Оформляем…' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
  );
}
