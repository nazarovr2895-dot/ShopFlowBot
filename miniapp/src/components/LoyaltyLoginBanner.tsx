import './LoyaltyLoginBanner.css';

interface LoyaltyLoginBannerProps {
  onDismiss: () => void;
  onLogin: () => void;
}

export function LoyaltyLoginBanner({ onDismiss, onLogin }: LoyaltyLoginBannerProps) {
  return (
    <div className="loyalty-banner">
      <div className="loyalty-banner__body">
        <span className="loyalty-banner__icon">🎁</span>
        <p className="loyalty-banner__text">
          Авторизуйтесь через Telegram, чтобы копить и использовать бонусные баллы
        </p>
      </div>
      <div className="loyalty-banner__actions">
        <button type="button" className="loyalty-banner__login-btn" onClick={onLogin}>
          Войти через Telegram
        </button>
        <button type="button" className="loyalty-banner__dismiss" onClick={onDismiss}>
          Продолжить без входа
        </button>
      </div>
    </div>
  );
}
