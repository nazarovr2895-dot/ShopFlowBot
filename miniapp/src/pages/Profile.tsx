import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Loader, TelegramAuth } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { REQUIRE_AUTH_FROM_CHECKOUT, REQUIRE_AUTH_FROM_ORDERS } from '../components/ProtectedRoute';
import './Profile.css';

const PHONE_PREFIX = '+7 ';

function formatPhoneForDisplay(phone: string | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  const rest = digits.startsWith('7') ? digits.slice(1) : digits;
  const part1 = rest.slice(0, 3);
  const part2 = rest.slice(3, 6);
  const part3 = rest.slice(6, 8);
  const part4 = rest.slice(8, 10);
  return [part1, part2, part3, part4].filter(Boolean).join(' ').trim()
    ? PHONE_PREFIX + [part1, part2, part3, part4].filter(Boolean).join(' ')
    : '';
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let normalized = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  normalized = normalized.slice(0, 11);
  return normalized;
}

export function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const { showAlert, requestContact, user: telegramUser } = useTelegramWebApp();
  const [user, setUser] = useState<{
    tg_id: number;
    fio?: string;
    phone?: string;
    username?: string;
    city_id?: number;
    district_id?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestingContact, setRequestingContact] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const data = await api.getCurrentUser();
      setUser(data);
    } catch (e) {
      // 401 or other: treat as not authenticated (browser without login)
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSavePhone = useCallback(async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 11 || normalized[0] !== '7') {
      showAlert('Неверный формат телефона');
      return;
    }

    try {
      const updated = await api.updateProfile({ phone: normalized });
      setUser(updated);
      showAlert('Номер телефона сохранен');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сохранения';
      const detail = typeof (err as { detail?: string }).detail === 'string' ? (err as { detail: string }).detail : message;
      setSaveError(detail);
      showAlert(detail);
    }
  }, [showAlert]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Check if phone number is available from Telegram initData
  useEffect(() => {
    const phoneFromTelegram = (telegramUser as any)?.phone_number;
    if (phoneFromTelegram && phoneFromTelegram !== user?.phone) {
      // Auto-save phone from Telegram if available
      handleSavePhone(phoneFromTelegram);
    }
  }, [telegramUser, user?.phone, handleSavePhone]);

  const handleAuthSuccess = useCallback(() => {
    loadUser();
    if (fromParam === REQUIRE_AUTH_FROM_CHECKOUT) {
      navigate('/cart/checkout', { replace: true });
    } else if (fromParam === REQUIRE_AUTH_FROM_ORDERS) {
      navigate('/orders', { replace: true });
    }
  }, [fromParam, loadUser, navigate]);

  const handleRequestContact = async () => {
    setRequestingContact(true);
    setSaveError(null);
    try {
      const phoneNumber = await requestContact();
      if (!phoneNumber) {
        showAlert('Номер телефона не получен');
        return;
      }
      await handleSavePhone(phoneNumber);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка запроса контакта';
      setSaveError(message);
      showAlert(message);
    } finally {
      setRequestingContact(false);
    }
  };

  if (loading) return <Loader centered />;

  const showAuthBlock = isBrowser() && !user;

  return (
    <div className="profile-page">
      <h1 className="profile-page__title">Профиль</h1>

      {showAuthBlock && (
        <section className="profile-auth-block">
          <p className="profile-auth-block__text">
            Войдите через Telegram, чтобы сохранять избранные магазины, оформлять заказы и видеть историю.
          </p>
          <TelegramAuth onAuthSuccess={handleAuthSuccess} onAuthError={(err) => showAlert(err)} />
        </section>
      )}

      {user && (
        <>
          <section className="profile-data">
            <h2 className="profile-data__heading">Мои данные</h2>
            <div className="profile-data__card">
              <div className="profile-data__row">
                <span className="profile-data__label">Telegram ID</span>
                <span className="profile-data__value profile-data__value_readonly">{user.tg_id}</span>
              </div>
              {telegramUser?.first_name && (
                <div className="profile-data__row">
                  <span className="profile-data__label">Имя</span>
                  <span className="profile-data__value profile-data__value_readonly">
                    {telegramUser.first_name} {telegramUser.last_name || ''}
                  </span>
                </div>
              )}
              <div className="profile-data__row">
                <span className="profile-data__label">Номер телефона</span>
                {user.phone ? (
                  <span className="profile-data__value profile-data__value_readonly">
                    {formatPhoneForDisplay(user.phone)}
                  </span>
                ) : (
                  <span className="profile-data__value profile-data__value_readonly" style={{ color: '#999' }}>
                    Не указан
                  </span>
                )}
              </div>
            </div>
            {saveError && <p className="profile-data__error">{saveError}</p>}
            {!user.phone && (
              <button
                type="button"
                className="profile-data__save"
                onClick={handleRequestContact}
                disabled={requestingContact}
              >
                {requestingContact ? 'Запрос…' : 'Поделиться номером телефона'}
              </button>
            )}
          </section>

          <div className="profile-card">
            {user.username && (
              <div className="profile-card__row">
                <span className="profile-card__label">Username</span>
                <span className="profile-card__value">@{user.username}</span>
              </div>
            )}
          </div>
        </>
      )}

      {user && (
        <nav className="profile-nav">
          <button
            type="button"
            className="profile-nav__item"
            onClick={() => navigate('/orders')}
          >
            <span className="profile-nav__icon">📦</span>
            <span>Мои заказы</span>
            <span className="profile-nav__arrow">›</span>
          </button>
        </nav>
      )}
    </div>
  );
}
