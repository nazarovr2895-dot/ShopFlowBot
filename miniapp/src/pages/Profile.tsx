import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Loader } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './Profile.css';

const PHONE_PREFIX = '+7 ';
const PHONE_DIGITS_LEN = 10;

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

function normalizePhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  const normalized = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  return normalized.slice(0, 11);
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  const n = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  return n.length === 11 && n[0] === '7';
}

function parseFio(fio: string | undefined): { lastName: string; firstName: string; patronymic: string } {
  if (!fio || !fio.trim()) return { lastName: '', firstName: '', patronymic: '' };
  const parts = fio.trim().split(/\s+/);
  return {
    lastName: parts[0] ?? '',
    firstName: parts[1] ?? '',
    patronymic: parts[2] ?? '',
  };
}

export function Profile() {
  const navigate = useNavigate();
  const { showAlert } = useTelegramWebApp();
  const [user, setUser] = useState<{
    tg_id: number;
    fio?: string;
    phone?: string;
    username?: string;
    city_id?: number;
    district_id?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [patronymic, setPatronymic] = useState('');
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const data = await api.getCurrentUser();
      setUser(data);
      const { lastName: l, firstName: f, patronymic: p } = parseFio(data.fio);
      setLastName(l);
      setFirstName(f);
      setPatronymic(p);
      setPhoneDisplay(formatPhoneForDisplay(data.phone));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    let digits = raw.startsWith('8') ? '7' + raw.slice(1) : raw.startsWith('7') ? raw : raw ? '7' + raw : '';
    digits = digits.slice(0, 11);
    const rest = digits.startsWith('7') ? digits.slice(1) : digits;
    const part1 = rest.slice(0, 3);
    const part2 = rest.slice(3, 6);
    const part3 = rest.slice(6, 8);
    const part4 = rest.slice(8, 10);
    const formatted = rest.length === 0 ? '' : PHONE_PREFIX + [part1, part2, part3, part4].filter(Boolean).join(' ');
    setPhoneDisplay(formatted);
  };

  const handleSave = async () => {
    setSaveError(null);
    const fio = [lastName, firstName, patronymic].map((s) => s.trim()).filter(Boolean).join(' ');
    const phoneNorm = normalizePhoneInput(phoneDisplay);
    if (phoneNorm && !validatePhone(phoneDisplay)) {
      setSaveError('Неверный формат телефона. Ожидается +7 000 000 00 00');
      return;
    }
    setSaving(true);
    try {
      const payload: { fio?: string; phone?: string } = {};
      if (fio !== (user?.fio ?? '')) payload.fio = fio;
      if (phoneNorm) {
        const normalized = phoneNorm.startsWith('7') ? phoneNorm : '7' + phoneNorm;
        if (normalized.length === 11) payload.phone = normalized;
      }
      if (Object.keys(payload).length === 0) {
        showAlert('Нет изменений для сохранения');
        return;
      }
      const updated = await api.updateProfile(payload);
      setUser(updated);
      setPhoneDisplay(formatPhoneForDisplay(updated.phone));
      showAlert('Данные сохранены');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сохранения';
      const detail = typeof (err as { detail?: string }).detail === 'string' ? (err as { detail: string }).detail : message;
      setSaveError(detail);
      showAlert(detail);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader centered />;

  return (
    <div className="profile-page">
      <h1 className="profile-page__title">Профиль</h1>

      {user && (
        <>
          <section className="profile-data">
            <h2 className="profile-data__heading">Мои данные</h2>
            <div className="profile-data__card">
              <div className="profile-data__row">
                <span className="profile-data__label">Telegram ID</span>
                <span className="profile-data__value profile-data__value_readonly">{user.tg_id}</span>
              </div>
              <div className="profile-data__row">
                <label className="profile-data__label" htmlFor="profile-lastname">Фамилия</label>
                <input
                  id="profile-lastname"
                  type="text"
                  className="profile-data__input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Фамилия"
                  autoComplete="family-name"
                />
              </div>
              <div className="profile-data__row">
                <label className="profile-data__label" htmlFor="profile-firstname">Имя</label>
                <input
                  id="profile-firstname"
                  type="text"
                  className="profile-data__input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Имя"
                  autoComplete="given-name"
                />
              </div>
              <div className="profile-data__row">
                <label className="profile-data__label" htmlFor="profile-patronymic">Отчество</label>
                <input
                  id="profile-patronymic"
                  type="text"
                  className="profile-data__input"
                  value={patronymic}
                  onChange={(e) => setPatronymic(e.target.value)}
                  placeholder="Отчество"
                  autoComplete="additional-name"
                />
              </div>
              <div className="profile-data__row">
                <label className="profile-data__label" htmlFor="profile-phone">Номер телефона</label>
                <input
                  id="profile-phone"
                  type="tel"
                  className="profile-data__input"
                  value={phoneDisplay}
                  onChange={handlePhoneChange}
                  placeholder="+7 000 000 00 00"
                  maxLength={PHONE_PREFIX.length + 3 + 1 + 3 + 1 + 2 + 1 + 2}
                />
              </div>
            </div>
            {saveError && <p className="profile-data__error">{saveError}</p>}
            <button
              type="button"
              className="profile-data__save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
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
    </div>
  );
}
