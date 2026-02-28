import { useState, useEffect } from 'react';
import {
  getSubscriptionPrices,
  getSubscriptionStatus,
  createSubscription,
  getBranchesSubscriptionStatus,
} from '../../../api/sellerClient';
import type {
  SubscriptionPricesResponse,
  SubscriptionStatusResponse,
  BranchSubscriptionInfo,
} from '../../../api/sellerClient';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ui';
import { CheckCircle, XCircle, CreditCard, Clock, Store, MapPin } from 'lucide-react';
import type { SettingsTabProps } from './types';

const PERIOD_LABELS: Record<number, string> = {
  1: '1 месяц',
  3: '3 месяца',
  6: '6 месяцев',
  12: '12 месяцев',
};

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
  const [prices, setPrices] = useState<SubscriptionPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingFor, setPayingFor] = useState<number | null>(null); // seller_id being paid for
  const [selectedPeriods, setSelectedPeriods] = useState<Record<number, number>>({}); // seller_id -> period

  useEffect(() => {
    Promise.all([getBranchesSubscriptionStatus(), getSubscriptionPrices()])
      .then(([b, p]) => {
        setBranches(b);
        setPrices(p);
      })
      .catch(() => toast.error('Не удалось загрузить данные подписок'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPeriod = (sellerId: number) => selectedPeriods[sellerId] ?? 1;

  const handlePay = async (sellerId: number) => {
    setPayingFor(sellerId);
    try {
      const result = await createSubscription(getPeriod(sellerId), sellerId);
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
            {prices && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {formatPrice(prices.base_price)}/мес за филиал
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Branch cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {branches.map(branch => {
          const isActive = branch.subscription_plan === 'active';
          const period = getPeriod(branch.seller_id);
          const price = prices?.prices[period] ?? 0;

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

              {/* Period selector + pay button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  className="form-input"
                  style={{ width: 'auto', fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                  value={period}
                  onChange={e => setSelectedPeriods(prev => ({ ...prev, [branch.seller_id]: Number(e.target.value) }))}
                >
                  {([1, 3, 6, 12] as number[]).map(p => {
                    const pPrice = prices?.prices[p] ?? 0;
                    const disc = prices?.discounts[p] ?? 0;
                    return (
                      <option key={p} value={p}>
                        {PERIOD_LABELS[p]} — {formatPrice(pPrice)}{disc > 0 ? ` (-${disc}%)` : ''}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handlePay(branch.seller_id)}
                  disabled={payingFor === branch.seller_id}
                  style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                >
                  {payingFor === branch.seller_id
                    ? 'Оплата...'
                    : isActive
                      ? `Продлить ${formatPrice(price)}`
                      : `Оплатить ${formatPrice(price)}`
                  }
                </button>
              </div>
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
  const [prices, setPrices] = useState<SubscriptionPricesResponse | null>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const isActive = me.subscription_plan === 'active';

  useEffect(() => {
    Promise.all([getSubscriptionPrices(), getSubscriptionStatus()])
      .then(([p, s]) => {
        setPrices(p);
        setSubStatus(s);
      })
      .catch(() => toast.error('Не удалось загрузить данные подписки'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async () => {
    setPaying(true);
    try {
      const result = await createSubscription(selectedPeriod);
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
  const history = subStatus?.history ?? [];

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
            {isActive ? 'Подписка активна' : 'Подписка не активна'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {current
              ? `Действует до ${formatDate(current.expires_at)} (${current.days_remaining ?? 0} дн.)`
              : 'Оформите подписку, чтобы принимать заказы'
            }
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          <CreditCard size={18} /> Выберите период
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {prices && ([1, 3, 6, 12] as number[]).map((period) => {
            const price = prices.prices[period] ?? 0;
            const discount = prices.discounts[period] ?? 0;
            const isSelected = selectedPeriod === period;
            return (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid var(--primary, #6366f1)' : '1px solid var(--border, #e5e7eb)',
                  background: isSelected ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                  {PERIOD_LABELS[period]}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {formatPrice(price)}
                </div>
                {discount > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600, marginTop: '0.25rem' }}>
                    -{discount}%
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pay Button */}
      <button
        className="btn btn-primary"
        onClick={handlePay}
        disabled={paying}
        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginBottom: '1.5rem' }}
      >
        {paying
          ? 'Создание платежа...'
          : isActive
            ? `Продлить за ${formatPrice(prices?.prices[selectedPeriod] ?? 0)}`
            : `Оплатить ${formatPrice(prices?.prices[selectedPeriod] ?? 0)}`
        }
      </button>

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
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Период</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Сумма</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                    <td style={{ padding: '0.5rem' }}>{formatDate(item.created_at ?? null)}</td>
                    <td style={{ padding: '0.5rem' }}>{PERIOD_LABELS[item.period_months] ?? `${item.period_months} мес.`}</td>
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
  const { isNetworkOwner } = useAuth();

  if (isNetworkOwner) {
    return <NetworkSubscriptionView me={me} reload={reload} />;
  }

  return <RegularSubscriptionView me={me} reload={reload} />;
}
