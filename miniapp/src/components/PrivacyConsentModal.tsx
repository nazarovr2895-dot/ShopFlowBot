import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import './PrivacyConsentModal.css';

interface PrivacyConsentModalProps {
  onAccepted: () => void;
}

export function PrivacyConsentModal({ onAccepted }: PrivacyConsentModalProps) {
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(false);

  // Hide overlay when user navigates to legal pages to read them
  if (pathname === '/privacy' || pathname === '/terms') {
    return null;
  }

  const handleAccept = async () => {
    setLoading(true);
    try {
      await api.acceptPrivacy();
      onAccepted();
    } catch (err) {
      console.error('[PrivacyConsent] Failed to accept:', err);
      onAccepted();
    }
  };

  return (
    <div className="privacy-consent-overlay">
      <div className="privacy-consent-modal">
        <h2 className="privacy-consent-modal__title">Согласие на обработку данных</h2>

        <div className="privacy-consent-modal__text">
          <p>
            Для работы платформы Flurai мы обрабатываем ваши данные: Telegram ID, имя,
            номер телефона и адрес доставки в целях:
          </p>
          <ul>
            <li>идентификации на платформе;</li>
            <li>оформления и доставки заказов;</li>
            <li>уведомлений о статусе заказов;</li>
            <li>участия в программе лояльности.</li>
          </ul>
        </div>

        <p className="privacy-consent-modal__legal">
          Нажимая «Принимаю», вы даёте{' '}
          <Link to="/privacy">Согласие на обработку персональных данных</Link>
          {' '}и принимаете условия{' '}
          <Link to="/terms">Публичной оферты</Link>.
        </p>

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
