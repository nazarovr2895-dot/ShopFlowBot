import { DataRow } from '@shared/components/ui';
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
  return (
    <div className="account-section-content">
      <DataRow
        label="Лимит доставки"
        value={`${(me.active_delivery_orders ?? 0) + (me.pending_delivery_requests ?? 0)} / ${me.max_delivery_orders ?? 10}`}
      />
      <DataRow
        label="Лимит самовывоза"
        value={`${(me.active_pickup_orders ?? 0) + (me.pending_pickup_requests ?? 0)} / ${me.max_pickup_orders ?? 20}`}
      />
      <DataRow label="Активных заказов" value={me.active_orders ?? 0} />
      <DataRow label="Ожидающих ответа" value={me.pending_requests ?? 0} />
      <DataRow label="Дата окончания размещения" value={formatDate(me.placement_expired_at)} />
    </div>
  );
}
