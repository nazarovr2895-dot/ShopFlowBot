import { useState } from 'react';
import { changeCredentials } from '../../../../api/sellerClient';
import { FormField } from '@shared/components/ui';
import { Eye, EyeOff } from 'lucide-react';
import './AccountSecuritySection.css';

export function AccountSecuritySection() {
  const [oldLogin, setOldLogin] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-security">
      <p className="account-security-hint">
        Измените логин и пароль для входа в веб-панель. Сначала введите текущие данные.
      </p>

      <form onSubmit={handleSubmit} className="account-security-form">
        <h4 className="account-security-subtitle">Текущие данные</h4>

        <FormField label="Текущий логин">
          <input
            type="text"
            className="form-input"
            value={oldLogin}
            onChange={(e) => setOldLogin(e.target.value)}
            required
            autoComplete="username"
          />
        </FormField>

        <FormField label="Текущий пароль">
          <div className="account-security-password">
            <input
              type={showOldPassword ? 'text' : 'password'}
              className="form-input"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="account-security-toggle"
              onClick={() => setShowOldPassword(!showOldPassword)}
              aria-label={showOldPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FormField>

        <h4 className="account-security-subtitle account-security-subtitle--spaced">Новые данные</h4>

        <FormField label="Новый логин">
          <input
            type="text"
            className="form-input"
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            required
            minLength={3}
            autoComplete="new-username"
          />
        </FormField>

        <FormField label="Новый пароль">
          <div className="account-security-password">
            <input
              type={showNewPassword ? 'text' : 'password'}
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={4}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="account-security-toggle"
              onClick={() => setShowNewPassword(!showNewPassword)}
              aria-label={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FormField>

        <FormField label="Подтвердите новый пароль">
          <div className="account-security-password">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={4}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="account-security-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FormField>

        {error && <div className="account-security-error">{error}</div>}
        {success && <div className="account-security-success">{success}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Сохранение...' : 'Изменить'}
        </button>
      </form>
    </div>
  );
}
