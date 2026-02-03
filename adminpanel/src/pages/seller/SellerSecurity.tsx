import { useState } from 'react';
import { changeCredentials } from '../../api/sellerClient';
import './SellerSecurity.css';

export function SellerSecurity() {
  const [oldLogin, setOldLogin] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('Новый пароль и подтверждение не совпадают');
      return;
    }
    if (newLogin.trim().length < 3) {
      setError('Новый логин должен быть не менее 3 символов');
      return;
    }
    if (newPassword.length < 4) {
      setError('Новый пароль должен быть не менее 4 символов');
      return;
    }
    setLoading(true);
    try {
      await changeCredentials({
        old_login: oldLogin,
        old_password: oldPassword,
        new_login: newLogin.trim(),
        new_password: newPassword,
      });
      setSuccess('Логин и пароль успешно изменены. Используйте новые данные для входа.');
      setOldLogin('');
      setOldPassword('');
      setNewLogin('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="seller-security-page">
      <h1 className="page-title">Безопасность</h1>
      <p className="security-hint">Измените логин и пароль для входа в веб-панель. Сначала введите текущие данные для подтверждения.</p>

      <div className="card">
        <form onSubmit={handleSubmit} className="security-form">
          <h3>Подтверждение текущих данных</h3>
          <div className="form-group">
            <label className="form-label">Текущий логин</label>
            <input
              type="text"
              className="form-input"
              value={oldLogin}
              onChange={(e) => setOldLogin(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Текущий пароль</label>
            <input
              type="password"
              className="form-input"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <h3 className="form-section-title">Новые данные</h3>
          <div className="form-group">
            <label className="form-label">Новый логин</label>
            <input
              type="text"
              className="form-input"
              value={newLogin}
              onChange={(e) => setNewLogin(e.target.value)}
              required
              minLength={3}
              autoComplete="new-username"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Новый пароль</label>
            <input
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={4}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Подтвердите новый пароль</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={4}
              autoComplete="new-password"
            />
          </div>

          {error && <div className="security-error">{error}</div>}
          {success && <div className="security-success">{success}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Сохранение...' : 'Изменить'}
          </button>
        </form>
      </div>
    </div>
  );
}
