import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TelegramAuth } from '../components/TelegramAuth';
import { api } from '../api/client';
import { isTelegram } from '../utils/environment';
import './Landing.css';

/**
 * Landing page for browser authentication
 * 
 * Shows welcome screen with Telegram login widget.
 * Redirects authenticated users to main app.
 */
export function Landing() {
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (api.isAuthenticated()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Redirect if in Telegram (should use initData auth instead)
  useEffect(() => {
    if (isTelegram()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const handleAuthSuccess = () => {
    // Redirect to main app after successful authentication
    navigate('/', { replace: true });
  };

  const handleAuthError = (error: string) => {
    console.error('[Landing] Auth error:', error);
    // Error is displayed by TelegramAuth component
  };

  return (
    <div className="landing">
      <div className="landing__container">
        <div className="landing__content">
          <div className="landing__header">
            <img
              src="/android-chrome-192x192.png"
              alt="flurai"
              className="landing__logo"
            />
            <h1 className="landing__title">flurai</h1>
            <p className="landing__subtitle">Ваш магазин цветов в Telegram</p>
          </div>

          <div className="landing__description">
            <p>
              Добро пожаловать в flurai! Здесь вы найдете лучшие цветочные магазины с доставкой по городу.
            </p>
            <p>
              Для продолжения необходимо войти через Telegram.
            </p>
          </div>

          <div className="landing__auth">
            <TelegramAuth
              onAuthSuccess={handleAuthSuccess}
              onAuthError={handleAuthError}
            />
          </div>

          <div className="landing__features">
            <div className="landing__feature">
              <span className="landing__feature-icon">🌹</span>
              <span className="landing__feature-text">Широкий выбор цветов</span>
            </div>
            <div className="landing__feature">
              <span className="landing__feature-icon">🚚</span>
              <span className="landing__feature-text">Быстрая доставка</span>
            </div>
            <div className="landing__feature">
              <span className="landing__feature-icon">💳</span>
              <span className="landing__feature-text">Удобная оплата</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
