import { useState } from 'react';
import { getYookassaConnectUrl, disconnectYookassa } from '../../../api/sellerClient';
import { useToast } from '@shared/components/ui';
import { CreditCard, CheckCircle, XCircle, Link2, Unlink } from 'lucide-react';
import type { SettingsTabProps } from './types';

export function PaymentSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const isConnected = !!me.yookassa_oauth_token;

  const handleConnect = async () => {
    setLoading(true);
    try {
      const data = await getYookassaConnectUrl();
      window.location.href = data.oauth_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка подключения');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectYookassa();
      await reload();
      toast.success('ЮКасса отключена');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
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
            {isConnected ? 'ЮКасса подключена' : 'ЮКасса не подключена'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {isConnected
              ? `Shop ID: ${me.yookassa_shop_id || '—'}${me.yookassa_connected_at ? ` • Подключено ${new Date(me.yookassa_connected_at).toLocaleDateString('ru')}` : ''}`
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
          {isConnected
            ? 'Ваш аккаунт ЮКассы подключён. Платежи от покупателей поступают напрямую на ваш счёт.'
            : 'Подключите свой аккаунт ЮКассы для приёма онлайн-оплаты. Деньги от покупателей поступают напрямую на ваш счёт.'
          }
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!isConnected ? (
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <Link2 size={14} /> {loading ? 'Подключение...' : 'Подключить ЮКассу'}
          </button>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={handleDisconnect}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#ef4444' }}
          >
            <Unlink size={14} /> Отключить
          </button>
        )}
      </div>
    </div>
  );
}
