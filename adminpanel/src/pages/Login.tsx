import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { login as apiAdminLogin } from '../api/adminClient';
import { sellerLogin } from '../api/adminClient';
import './Login.css';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      const { token, seller_id } = await sellerLogin(loginValue, password);
      login({ token, role: 'seller', sellerId: seller_id });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Shop<span className="accent">Flow</span></h1>
          <p>Вход для администраторов и продавцов</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login">Логин</label>
            <input
              id="login"
              type="text"
              className="form-input"
              placeholder="Введите логин"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
