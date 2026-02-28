import { useState } from 'react';
import { updateMe } from '../../../api/sellerClient';
import { useToast } from '@shared/components/ui';
import { CreditCard, CheckCircle, XCircle, Save, Trash2 } from 'lucide-react';
import type { SettingsTabProps } from './types';

export function PaymentSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(me.yookassa_account_id || '');
  const [saving, setSaving] = useState(false);

  const isConnected = !!me.yookassa_account_id;

  const handleSave = async () => {
    const trimmed = accountId.trim();
    if (!trimmed) {
      toast.error('Введите YooKassa Account ID');
      return;
    }
    setSaving(true);
    try {
      await updateMe({ yookassa_account_id: trimmed });
      await reload();
      toast.success('YooKassa Account ID сохранён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await updateMe({ yookassa_account_id: '' });
      setAccountId('');
      await reload();
      toast.success('YooKassa отключена');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      {/* Status Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: isConnected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.06)',
          border: isConnected ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.15)',
        }}
      >
        {isConnected ? (
          <CheckCircle size={20} style={{ color: '#22c55e', flexShrink: 0 }} />
        ) : (
          <XCircle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {isConnected ? 'Онлайн-оплата подключена' : 'Онлайн-оплата не подключена'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {isConnected
              ? `Account ID: ${me.yookassa_account_id}`
              : 'Покупатели не смогут оплачивать заказы онлайн'
            }
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          <CreditCard size={18} /> Настройки ЮКасса
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Укажите ваш YooKassa Account ID для приёма онлайн-оплаты.
          Когда покупатель оформит заказ и вы его примете, ему автоматически придёт ссылка на оплату.
          Деньги поступят на ваш счёт за вычетом комиссии платформы.
        </p>
      </div>

      {/* Input */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.375rem' }}>
          YooKassa Account ID
        </label>
        <input
          type="text"
          className="form-input"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="Введите Account ID"
          style={{ width: '100%' }}
        />
        <small style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Получите ID у администратора платформы или в личном кабинете ЮКасса
        </small>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !accountId.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <Save size={14} /> {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        {isConnected && (
          <button
            className="btn btn-secondary"
            onClick={handleDisconnect}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#ef4444' }}
          >
            <Trash2 size={14} /> Отключить
          </button>
        )}
      </div>
    </div>
  );
}
