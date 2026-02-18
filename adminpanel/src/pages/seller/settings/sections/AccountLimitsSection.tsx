import { DataRow } from '../../../../components/ui';
import type { SellerMe } from '../../../../api/sellerClient';

interface Props {
  me: SellerMe;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ru');
  } catch {
    return iso;
  }
}

export function AccountLimitsSection({ me }: Props) {
  const planLabel = me.subscription_plan
    ? `${me.subscription_plan === 'free' ? 'Free' : me.subscription_plan === 'pro' ? 'Pro' : 'Premium'} (макс. ${me.plan_limit_cap ?? '?'} заказов/день)`
    : undefined;

  return (
    <div className="account-section-content">
      <DataRow
        label="Стандартный лимит"
        value={me.default_daily_limit ? `${me.default_daily_limit} заказов/день` : 'Не задан'}
      />
      <DataRow
        label="Действующий лимит"
        value={me.limit_set_for_today ? `${me.orders_used_today ?? 0} / ${me.max_orders ?? 0}` : 'Не активен'}
      />
      <DataRow label="Активных заказов" value={me.active_orders ?? 0} />
      <DataRow label="Ожидающих ответа" value={me.pending_requests ?? 0} />
      <DataRow label="Дата окончания размещения" value={formatDate(me.placement_expired_at)} />
      {planLabel && <DataRow label="Тариф" value={planLabel} />}
    </div>
  );
}
