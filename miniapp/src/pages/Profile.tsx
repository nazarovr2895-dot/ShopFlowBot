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
  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const section = searchParams.get('section');
  const { showAlert, requestContact, hapticFeedback, hapticNotification, setBackButton, user: telegramUser } = useTelegramWebApp();
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
  const [phoneInput, setPhoneInput] = useState('');
  const [showManualPhoneInput, setShowManualPhoneInput] = useState(false);
  const [photoError, setPhotoError] = useState(false);

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
      hapticNotification('success');
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

  // Telegram BackButton for section views
  useEffect(() => {
    if (section) {
      setBackButton(true, () => navigate('/profile'));
      return () => setBackButton(false);
    } else {
      setBackButton(false);
    }
  }, [section, setBackButton, navigate]);

  const handleAuthSuccess = useCallback(() => {
    loadUser();
    if (fromParam === REQUIRE_AUTH_FROM_CHECKOUT) {
      navigate('/cart/checkout', { replace: true });
    } else if (fromParam === REQUIRE_AUTH_FROM_ORDERS) {
      navigate('/?tab=orders', { replace: true });
    }
  }, [fromParam, loadUser, navigate]);

  const handleRequestContact = async () => {
    setRequestingContact(true);
    setSaveError(null);
    try {
      const phoneNumber = await requestContact();
      if (!phoneNumber) {
        setShowManualPhoneInput(true);
        showAlert('Введите номер телефона вручную');
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

  // --- Helpers ---

  const getUserDisplayName = (): string => {
    if (telegramUser?.first_name) {
      return `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`.trim();
    }
    return user?.fio || 'Пользователь';
  };

  const getUserInitial = (): string => {
    const name = getUserDisplayName();
    return (name[0] || 'U').toUpperCase();
  };

  // --- Section: Мои данные ---

  const renderPersonalSection = () => (
    <div className="profile-page">
      {isBrowser() && (
        <button
          type="button"
          className="profile-section__back"
          onClick={() => navigate('/profile')}
        >
          ‹ Профиль
        </button>
      )}

      <h1 className="profile-section__title">Мои данные</h1>

      {user ? (
        <section className="profile-data">
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
            {user.username && (
              <div className="profile-data__row">
                <span className="profile-data__label">Username</span>
                <span className="profile-data__value profile-data__value_readonly">@{user.username}</span>
              </div>
            )}
          </div>
          {saveError && <p className="profile-data__error">{saveError}</p>}
          {!user.phone && (
            isBrowser() ? (
              <div className="profile-data__phone-input-block">
                <input
                  type="tel"
                  className="profile-data__input"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+7 999 123 45 67"
                />
                <button
                  type="button"
                  className="profile-data__save"
                  onClick={() => handleSavePhone(phoneInput)}
                  disabled={!phoneInput.trim()}
                >
                  Сохранить номер
                </button>
              </div>
            ) : showManualPhoneInput ? (
              <div className="profile-data__phone-input-block">
                <input
                  type="tel"
                  className="profile-data__input"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+7 999 123 45 67"
                />
                <button
                  type="button"
                  className="profile-data__save"
                  onClick={() => handleSavePhone(phoneInput)}
                  disabled={!phoneInput.trim()}
                >
                  Сохранить номер
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="profile-data__save"
                onClick={handleRequestContact}
                disabled={requestingContact}
              >
                {requestingContact ? 'Запрос…' : 'Поделиться номером телефона'}
              </button>
            )
          )}
        </section>
      ) : (
        <p style={{ color: 'var(--app-text-secondary)' }}>
          Войдите в профиль, чтобы увидеть ваши данные.
        </p>
      )}
    </div>
  );

  // --- Menu View ---

  const renderMenuView = () => {
    const showAuthBlock = isBrowser() && !user;

    return (
      <div className="profile-page">
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
            {/* Centered user header with photo */}
            <div className="profile-header">
              <div className="profile-header__avatar">
                {telegramUser?.photo_url && !photoError ? (
                  <img
                    src={telegramUser.photo_url}
                    alt=""
                    className="profile-header__avatar-img"
                    onError={() => setPhotoError(true)}
                  />
                ) : (
                  <span className="profile-header__avatar-fallback">{getUserInitial()}</span>
                )}
              </div>
              <span className="profile-header__name">{getUserDisplayName()}</span>
              {(user.phone || user.username) && (
                <span className="profile-header__subtitle">
                  {user.phone ? formatPhoneForDisplay(user.phone) : `@${user.username}`}
                </span>
              )}
            </div>

            {/* Grouped navigation */}
            <nav className="profile-nav">
              <div className="profile-nav__group">
                <button
                  type="button"
                  className="profile-nav__item"
                  onClick={() => {
                    hapticFeedback('light');
                    navigate('/?tab=orders');
                  }}
                >
                  <span className="profile-nav__icon">📦</span>
                  <span className="profile-nav__text">Мои заказы</span>
                  <span className="profile-nav__arrow">›</span>
                </button>
                <button
                  type="button"
                  className="profile-nav__item"
                  onClick={() => {
                    hapticFeedback('light');
                    setSearchParams({ section: 'personal' });
                  }}
                >
                  <span className="profile-nav__icon">👤</span>
                  <span className="profile-nav__text">Мои данные</span>
                  <span className="profile-nav__arrow">›</span>
                </button>
              </div>
            </nav>

            {isBrowser() && (
              <div className="profile-nav__group profile-nav__group--standalone">
                <button
                  type="button"
                  className="profile-nav__item profile-nav__item--danger"
                  onClick={() => {
                    api.logout();
                    navigate('/landing', { replace: true });
                  }}
                >
                  <span className="profile-nav__text">Выйти</span>
                </button>
              </div>
            )}
          </>
        )}

        <footer className="profile-legal-footer">
          <div className="profile-nav__group">
            <button
              type="button"
              className="profile-nav__item profile-nav__item--subtle"
              onClick={() => navigate('/terms')}
            >
              <span className="profile-nav__icon">📄</span>
              <span className="profile-nav__text">Пользовательское соглашение</span>
              <span className="profile-nav__arrow">›</span>
            </button>
            <button
              type="button"
              className="profile-nav__item profile-nav__item--subtle"
              onClick={() => navigate('/privacy')}
            >
              <span className="profile-nav__icon">🔒</span>
              <span className="profile-nav__text">Политика конфиденциальности</span>
              <span className="profile-nav__arrow">›</span>
            </button>
          </div>
        </footer>
      </div>
    );
  };

  // --- Main Render ---

  if (loading) return <Loader centered />;

  if (section === 'personal') return renderPersonalSection();

  return renderMenuView();
}
