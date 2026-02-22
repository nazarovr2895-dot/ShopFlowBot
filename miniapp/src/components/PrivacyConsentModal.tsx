import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import './PrivacyConsentModal.css';

interface PrivacyConsentModalProps {
  onAccepted: () => void;
}

export function PrivacyConsentModal({ onAccepted }: PrivacyConsentModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await api.acceptPrivacy();
      onAccepted();
    } catch (err) {
      console.error('[PrivacyConsent] Failed to accept:', err);
      // Still allow proceeding — backend might be temporarily unavailable
      onAccepted();
    }
  };

  return (
    <div className="privacy-consent-overlay">
      <div className="privacy-consent-modal">
        <h2 className="privacy-consent-modal__title">Согласие на обработку данных</h2>

        <div className="privacy-consent-modal__text">
          <p>
            Для работы платформы Flurai мы обрабатываем ваши персональные данные:
          </p>
          <ul>
            <li>Telegram ID и имя профиля</li>
            <li>Номер телефона (при добровольном предоставлении)</li>
            <li>Адрес доставки (при оформлении заказа)</li>
          </ul>
          <p>
            Данные используются для идентификации, оформления заказов и связи с вами.
            Мы не передаём данные третьим лицам, кроме продавца для выполнения заказа.
          </p>
        </div>

        <button
          type="button"
          className="privacy-consent-modal__link"
          onClick={() => navigate('/privacy')}
        >
          Подробнее — Политика конфиденциальности
        </button>

        <button
          type="button"
          className="privacy-consent-modal__accept"
          onClick={handleAccept}
          disabled={loading}
        >
          {loading ? 'Сохраняем…' : 'Принимаю'}
        </button>
      </div>
    </div>
  );
}
