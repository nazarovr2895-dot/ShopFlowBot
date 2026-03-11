import { useState, useEffect } from 'react';
import {
  getSubscriptionPrices,
  getSubscriptionStatus,
  getMySubscriptionPrice,
  createSubscription,
  getBranchesSubscriptionStatus,
} from '../../../api/sellerClient';
import type {
  SubscriptionStatusResponse,
  SubscriptionDynamicPrice,
  BranchSubscriptionInfo,
} from '../../../api/sellerClient';
import { useSellerAuth } from '../../../contexts/SellerAuthContext';
import { useToast } from '@shared/components/ui';
import { CheckCircle, XCircle, CreditCard, Clock, Store, MapPin, Info } from 'lucide-react';
import type { SettingsTabProps } from './types';

const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  pending: 'Ожидает оплаты',
  expired: 'Истекла',
  cancelled: 'Отменена',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatPrice(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' \u20BD';
}

/* ── Network Owner: per-branch subscription management ─────── */

function NetworkSubscriptionView(_props: SettingsTabProps) {
  const toast = useToast();
  const [branches, setBranches] = useState<BranchSubscriptionInfo[]>([]);
  const [basePrice, setBasePrice] = useState<number>(2000);
  const [loading, setLoading] = useState(true);
  const [payingFor, setPayingFor] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getBranchesSubscriptionStatus(), getSubscriptionPrices()])
      .then(([b, p]) => {
        setBranches(b);
        setBasePrice(p.base_price);
      })
      .catch(() => toast.error('Не удалось загрузить данные подписок'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async (sellerId: number) => {
    setPayingFor(sellerId);
    try {
      const result = await createSubscription(1, sellerId);
      if (result.confirmation_url) {
        window.open(result.confirmation_url, '_blank');
        toast.success('Перенаправление на страницу оплаты...');
      } else {
        toast.error('Не удалось получить ссылку на оплату');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка создания подписки');
    } finally {
      setPayingFor(null);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <div className="loader" />
      </div>
    );
  }

  const activeCount = branches.filter(b => b.subscription_plan === 'active').length;

  return (
    <div>
      {/* Summary */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Store size={20} style={{ color: 'var(--primary, #6366f1)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Подписки филиалов: {activeCount} / {branches.length} активны
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              от {formatPrice(basePrice)}/мес за филиал
            </div>
          </div>
        </div>
      </div>

      {/* Branch cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {branches.map(branch => {
          const isActive = branch.subscription_plan === 'active';

          return (
            <div key={branch.seller_id} className="card" style={{ padding: '1.25rem' }}>
              {/* Branch info + status */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {branch.shop_name || `#${branch.seller_id}`}
                    {branch.is_owner && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--primary, #6366f1)', marginLeft: '0.5rem', fontWeight: 500 }}>
                        (основной)
                      </span>
                    )}
                  </div>
                  {branch.address_name && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin size={12} /> {branch.address_name}
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                  background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                  color: isActive ? '#22c55e' : '#ef4444',
                }}>
                  {isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {isActive ? 'Активна' : 'Не активна'}
                </div>
              </div>

              {/* Expiry info */}
              {isActive && branch.expires_at && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Действует до {formatDate(branch.expires_at)} ({branch.days_remaining} дн.)
                </div>
              )}

              {/* Pay button */}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handlePay(branch.seller_id)}
                disabled={payingFor === branch.seller_id}
                style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                {payingFor === branch.seller_id
                  ? 'Оплата...'
                  : isActive
                    ? 'Продлить на 1 месяц'
                    : 'Оплатить на 1 месяц'
                }
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Regular Seller: single subscription management ────────── */

function RegularSubscriptionView({ me }: SettingsTabProps) {
  const toast = useToast();
  const [pricing, setPricing] = useState<SubscriptionDynamicPrice | null>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const isActive = me.subscription_plan === 'active';

  useEffect(() => {
    Promise.all([getMySubscriptionPrice(), getSubscriptionStatus()])
      .then(([p, s]) => {
        setPricing(p);
        setSubStatus(s);
      })
      .catch(() => toast.error('Не удалось загрузить данные подписки'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async () => {
    setPaying(true);
    try {
      const result = await createSubscription(1);
      if (result.confirmation_url) {
        window.open(result.confirmation_url, '_blank');
        toast.success('Перенаправление на страницу оплаты...');
      } else {
        toast.error('Не удалось получить ссылку на оплату');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка создания подписки');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <div className="loader" />
      </div>
    );
  }

  const current = subStatus?.current;
  const history = (subStatus?.history ?? []).filter(h => h.status === 'active' || h.status === 'expired');
  const hasAdditional = pricing && pricing.additional_amount > 0;
  const showPayButton = !isActive || (current?.days_remaining ?? 0) <= 7;

  // Overdue counter: find last expired subscription
  const lastExpired = (subStatus?.history ?? []).find(h => h.status === 'expired');
  const overdueDays = !isActive && lastExpired?.expires_at
    ? Math.max(0, Math.floor((Date.now() - new Date(lastExpired.expires_at).getTime()) / 86400000))
    : 0;

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
          background: isActive ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.06)',
          border: isActive ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.15)',
        }}
      >
        {isActive ? (
          <CheckCircle size={20} style={{ color: '#22c55e', flexShrink: 0 }} />
        ) : (
          <XCircle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {isActive ? 'Подписка активна' : overdueDays > 0 ? 'Подписка просрочена' : 'Подписка не активна'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {current
              ? `Действует до ${formatDate(current.expires_at)} (${current.days_remaining ?? 0} дн.)`
              : overdueDays > 0
                ? `Просрочка: ${overdueDays} дн. Оплатите подписку, чтобы магазин продолжал работать.`
                : 'Оформите подписку, чтобы принимать заказы'
            }
          </div>
        </div>
      </div>

      {/* Pricing Breakdown */}
      {pricing && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            <CreditCard size={18} /> Стоимость подписки на 1 месяц
          </h3>

          <div style={{
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid var(--border, #e5e7eb)',
            fontSize: '0.9rem',
            lineHeight: 1.8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Базовая подписка</span>
              <span style={{ fontWeight: 600 }}>{formatPrice(pricing.base_price)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Оборот за период {new Date(pricing.period_start).toLocaleDateString('ru')} — {new Date(pricing.period_end).toLocaleDateString('ru')}</span>
              <span>{formatPrice(pricing.turnover_30d)}</span>
            </div>

            {hasAdditional ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary, #6366f1)' }}>
                <span>+ {pricing.additional_percent}% от оборота</span>
                <span style={{ fontWeight: 600 }}>+ {formatPrice(pricing.additional_amount)}</span>
              </div>
            ) : (
              <div style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                padding: '0.25rem 0',
                fontStyle: 'italic',
              }}>
                Оборот ниже {formatPrice(pricing.threshold)} — только базовая подписка
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: '1.05rem',
              borderTop: '1px solid var(--border, #e5e7eb)',
              paddingTop: '0.5rem',
              marginTop: '0.25rem',
            }}>
              <span>Итого</span>
              <span>{formatPrice(pricing.total_price)}</span>
            </div>
          </div>

          {/* Info note */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '0.75rem',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.05)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: '0.1rem', color: 'var(--primary, #6366f1)' }} />
            <span>
              Все деньги от покупателей поступают напрямую на ваш счёт через ЮKassa.
              Платформа не удерживает средства из вашей выручки.
            </span>
          </div>
        </div>
      )}

      {/* Pay Button — only show when subscription is not active or expiring soon (≤ 7 days) */}
      {showPayButton && (
        <button
          className="btn btn-primary"
          onClick={handlePay}
          disabled={paying}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '1rem',
            marginBottom: '1.5rem',
            ...(overdueDays > 0 ? { background: '#ef4444', borderColor: '#ef4444' } : {}),
          }}
        >
          {paying
            ? 'Создание платежа...'
            : isActive
              ? `Продлить за ${formatPrice(pricing?.total_price ?? 0)}`
              : `Оплатить ${formatPrice(pricing?.total_price ?? 0)}`
          }
        </button>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            <Clock size={18} /> История платежей
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Дата</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Сумма</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                    <td style={{ padding: '0.5rem' }}>{formatDate(item.created_at ?? null)}</td>
                    <td style={{ padding: '0.5rem' }}>{formatPrice(item.amount_paid)}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: item.status === 'active' ? 'rgba(34, 197, 94, 0.1)' : item.status === 'pending' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                        color: item.status === 'active' ? '#22c55e' : item.status === 'pending' ? '#eab308' : '#6b7280',
                      }}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main export ───────────────────────────────────────────── */

export function SubscriptionSettingsTab({ me, reload }: SettingsTabProps) {
  const { isNetworkOwner } = useSellerAuth();

  if (isNetworkOwner) {
    return <NetworkSubscriptionView me={me} reload={reload} />;
  }

  return <RegularSubscriptionView me={me} reload={reload} />;
}
