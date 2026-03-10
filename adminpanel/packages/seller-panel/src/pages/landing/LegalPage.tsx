import { Link, useNavigate } from 'react-router-dom';
import { LegalOfferContent, PrivacyContent } from '../seller/settings/LegalContent';
import './LandingPage.css';
import './LegalPage.css';

interface LegalPageProps {
  type: 'offer' | 'privacy';
}

export function LegalPage({ type }: LegalPageProps) {
  const navigate = useNavigate();

  return (
    <div className="landing" data-theme="light">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <Link to="/" className="landing-header__brand" style={{ textDecoration: 'none', color: 'inherit' }}>
            <img src="/android-chrome-192x192.png" alt="flurai" width={32} height={32} />
            <span className="landing-header__name">flurai</span>
          </Link>
          <nav className="landing-header__nav">
            <Link to="/pricing" className="landing-header__link">Тарифы</Link>
          </nav>
          <div className="landing-header__actions">
            <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>Войти</button>
            <button className="landing-btn landing-btn--primary" onClick={() => navigate('/')}>На главную</button>
          </div>
        </div>
      </header>

      {/* Document */}
      <main className="legal-page">
        <div className="landing-container">
          <div className="legal-page__document">
            {type === 'offer' ? <LegalOfferContent /> : <PrivacyContent />}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            <div className="landing-footer__col">
              <div className="landing-footer__brand">
                <img src="/android-chrome-192x192.png" alt="flurai" width={24} height={24} />
                <span>flurai</span>
              </div>
              <p className="landing-footer__desc">Платформа для продавцов в Telegram.</p>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Платформа</h4>
              <Link to="/" className="landing-footer__link">Главная</Link>
              <Link to="/pricing" className="landing-footer__link">Тарифы</Link>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Документы</h4>
              <Link to="/legal/offer" className="landing-footer__link">Пользовательское соглашение</Link>
              <Link to="/legal/privacy" className="landing-footer__link">Политика конфиденциальности</Link>
            </div>
          </div>
          <div className="landing-footer__bottom">
            <span className="landing-footer__copy">&copy; {new Date().getFullYear()} flurai</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
