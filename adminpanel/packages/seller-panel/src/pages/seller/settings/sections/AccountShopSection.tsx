import { DataRow } from '@shared/components/ui';
import type { SellerMe } from '../../../../api/sellerClient';

interface Props {
  me: SellerMe;
}

const DELIVERY_LABELS: Record<string, string> = {
  pickup: 'Самовывоз',
  delivery: 'Доставка',
  both: 'Оба',
  'доставка': 'Доставка',
  'самовывоз': 'Самовывоз',
  'доставка и самовывоз': 'Доставка и самовывоз',
};

export function AccountShopSection({ me }: Props) {
  const districtName = me.district_name || '—';

  return (
    <div className="account-section-content">
      <DataRow label="Название" value={me.shop_name || '—'} />
      <DataRow label="Описание" value={me.description || '—'} />
      <DataRow label="Район" value={districtName} />
      <DataRow label="Тип доставки" value={DELIVERY_LABELS[me.delivery_type || ''] || me.delivery_type || '—'} />
      <DataRow label="Стоимость доставки" value="Настраивается в зонах доставки" />
      <DataRow
        label="Адрес (карта)"
        value={me.map_url ? (
          <a href={me.map_url} target="_blank" rel="noopener noreferrer" className="account-link">
            Открыть на карте
          </a>
        ) : '—'}
      />
      <DataRow
        label="Ссылка на магазин"
        value={me.shop_link ? <code className="account-code">{me.shop_link}</code> : '—'}
      />
    </div>
  );
}
