import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { login as apiAdminLogin } from '../api/adminClient';
import { sellerLogin } from '../api/adminClient';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import './Login.css';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try admin login first
      try {
        const { token } = await apiAdminLogin(loginValue, password);
        login({ token, role: 'admin' });
        navigate('/', { replace: true });
        return;
      } catch {
        // Not admin, try seller
      }

      // Try seller login
      const { token, seller_id, branches } = await sellerLogin(loginValue, password);
      login({ token, role: 'seller', sellerId: seller_id, branches });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__bg-glow login-page__bg-glow--1" />
      <div className="login-page__bg-glow login-page__bg-glow--2" />

      <div className="login-card">
        <div className="login-header">
          <img
            src="/android-chrome-192x192.png"
            alt="flurai"
            className="login-header__logo"
            width={56}
            height={56}
          />
          <h1 className="login-header__title">flurai</h1>
          <p className="login-header__subtitle">Панель управления</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-field__label" htmlFor="login">Логин</label>
            <input
              id="login"
              type="text"
              className="login-field__input"
              placeholder="Введите логин"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label className="login-field__label" htmlFor="password">Пароль</label>
            <div className="login-field__password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="login-field__input"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-field__eye"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <span className="login-submit__spinner" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Войти</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
