import { useState, useRef, useCallback, useEffect } from 'react';
import { X, CheckCircle2, Loader2, AlertCircle, Building2 } from 'lucide-react';
import { getApiBase } from '../../api/sellerClient';
import './ApplicationModal.css';

interface OrgData {
  inn: string;
  ogrn: string | null;
  name: string | null;
  short_name: string | null;
  type: string | null;
  management_name: string | null;
  address: string | null;
  state: string | null;
}

interface ApplicationModalProps {
  onClose: () => void;
}

// Алгоритм контрольной суммы ИНН (ФНС)
function validateInnChecksum(inn: string): boolean {
  const d = inn.split('').map(Number);
  if (inn.length === 10) {
    const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
    const check = weights.reduce((s, w, i) => s + w * d[i], 0) % 11 % 10;
    return check === d[9];
  }
  if (inn.length === 12) {
    const w11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const w12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const c11 = w11.reduce((s, w, i) => s + w * d[i], 0) % 11 % 10;
    const c12 = w12.reduce((s, w, i) => s + w * d[i], 0) % 11 % 10;
    return c11 === d[10] && c12 === d[11];
  }
  return false;
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);

  let result = '+7';
  if (d.length > 1) result += ' ' + d.slice(1, 4);
  if (d.length > 4) result += ' ' + d.slice(4, 7);
  if (d.length > 7) result += ' ' + d.slice(7, 9);
  if (d.length > 9) result += ' ' + d.slice(9, 11);
  return result;
}

export function ApplicationModal({ onClose }: ApplicationModalProps) {
  const [shopName, setShopName] = useState('');
  const [inn, setInn] = useState('');
  const [phone, setPhone] = useState('+7');

  // ИНН verification state
  const [innStatus, setInnStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'error'>('idle');
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [innError, setInnError] = useState('');
  const innTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Cleanup
  useEffect(() => {
    return () => {
      if (innTimerRef.current) clearTimeout(innTimerRef.current);
    };
  }, []);

  const verifyInn = useCallback(async (innValue: string) => {
    setInnStatus('checking');
    setInnError('');
    setOrgData(null);

    try {
      const res = await fetch(`${getApiBase()}/public/verify-inn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inn: innValue }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setInnStatus('invalid');
        setInnError(err.detail || 'Ошибка проверки ИНН');
        return;
      }

      const data: OrgData = await res.json();
      setOrgData(data);
      setInnStatus('valid');
    } catch {
      setInnStatus('error');
      setInnError('Ошибка сети. Попробуйте позже.');
    }
  }, []);

  const handleInnChange = (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 12);
    setInn(clean);
    setInnStatus('idle');
    setInnError('');
    setOrgData(null);

    if (innTimerRef.current) clearTimeout(innTimerRef.current);

    if (clean.length === 10 || clean.length === 12) {
      if (!validateInnChecksum(clean)) {
        setInnStatus('invalid');
        setInnError('Неверная контрольная сумма ИНН');
        return;
      }
      innTimerRef.current = setTimeout(() => verifyInn(clean), 300);
    }
  };

  const handlePhoneChange = (value: string) => {
    setPhone(formatPhoneInput(value));
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const isFormValid =
    shopName.trim().length >= 2 &&
    innStatus === 'valid' &&
    phoneDigits.length === 11;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`${getApiBase()}/public/seller-application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_name: shopName.trim(),
          inn: inn,
          phone: phoneDigits,
          org_name: orgData?.name || orgData?.short_name || null,
          org_type: orgData?.type || null,
          ogrn: orgData?.ogrn || null,
          management_name: orgData?.management_name || null,
          org_address: orgData?.address || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Ошибка отправки');
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal">
        <div className="app-modal__header">
          <h2>{submitted ? 'Заявка отправлена' : 'Открыть магазин'}</h2>
          <button className="app-modal__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {submitted ? (
          <div className="app-modal__success">
            <CheckCircle2 size={48} className="app-modal__success-icon" />
            <h3>Заявка принята!</h3>
            <p>Мы проверим данные и свяжемся с вами в ближайшее время для настройки магазина.</p>
            <button className="landing-btn landing-btn--primary" onClick={onClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="app-modal__form">
            {/* Название магазина */}
            <div className="app-field">
              <label className="app-field__label">Название магазина</label>
              <input
                type="text"
                className="app-field__input"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Например: Цветочная лавка"
                maxLength={255}
                required
              />
            </div>

            {/* ИНН */}
            <div className="app-field">
              <label className="app-field__label">ИНН</label>
              <div className="app-field__input-wrap">
                <input
                  type="text"
                  className={`app-field__input ${innStatus === 'valid' ? 'app-field__input--valid' : ''} ${innStatus === 'invalid' || innStatus === 'error' ? 'app-field__input--error' : ''}`}
                  value={inn}
                  onChange={(e) => handleInnChange(e.target.value)}
                  placeholder="10 или 12 цифр"
                  inputMode="numeric"
                  maxLength={12}
                  required
                />
                {innStatus === 'checking' && (
                  <Loader2 size={18} className="app-field__status-icon app-field__status-icon--spin" />
                )}
                {innStatus === 'valid' && (
                  <CheckCircle2 size={18} className="app-field__status-icon app-field__status-icon--valid" />
                )}
                {(innStatus === 'invalid' || innStatus === 'error') && (
                  <AlertCircle size={18} className="app-field__status-icon app-field__status-icon--error" />
                )}
              </div>
              {innError && (
                <p className="app-field__error">{innError}</p>
              )}
              {innStatus === 'valid' && orgData && (
                <div className="app-field__org-info">
                  <Building2 size={16} />
                  <span>{orgData.short_name || orgData.name}</span>
                </div>
              )}
              <p className="app-field__hint">
                ИНН юридического лица (10 цифр) или ИП (12 цифр)
              </p>
            </div>

            {/* Телефон */}
            <div className="app-field">
              <label className="app-field__label">Номер телефона</label>
              <input
                type="tel"
                className="app-field__input"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="+7 000 000 00 00"
                maxLength={16}
                required
              />
              <p className="app-field__hint">Для связи по вашей заявке</p>
            </div>

            {submitError && (
              <div className="app-modal__error">{submitError}</div>
            )}

            <button
              type="submit"
              className="landing-btn landing-btn--primary landing-btn--lg app-modal__submit"
              disabled={!isFormValid || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="app-field__status-icon--spin" />
                  Отправка...
                </>
              ) : (
                'Отправить заявку'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
