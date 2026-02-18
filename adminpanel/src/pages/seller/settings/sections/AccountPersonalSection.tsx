import { DataRow } from '../../../../components/ui';
import type { SellerMe } from '../../../../api/sellerClient';

interface Props {
  me: SellerMe;
}

export function AccountPersonalSection({ me }: Props) {
  return (
    <div className="account-section-content">
      <DataRow label="Telegram ID" value={<code className="account-code">{me.seller_id}</code>} />
      <DataRow label="ФИО" value={me.fio || '—'} />
      <DataRow label="Телефон" value={me.phone || '—'} />
    </div>
  );
}
