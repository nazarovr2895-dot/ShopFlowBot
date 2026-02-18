import { DataRow } from '../../../../components/ui';
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

const DISTRICTS_MSK: { id: number; name: string }[] = [
  { id: 1, name: 'ЦАО' }, { id: 2, name: 'САО' }, { id: 3, name: 'СВАО' },
  { id: 4, name: 'ВАО' }, { id: 5, name: 'ЮВАО' }, { id: 6, name: 'ЮАО' },
  { id: 7, name: 'ЮЗАО' }, { id: 8, name: 'ЗАО' }, { id: 9, name: 'СЗАО' },
  { id: 10, name: 'Зеленоградский' }, { id: 11, name: 'Новомосковский' }, { id: 12, name: 'Троицкий' },
];

export function AccountShopSection({ me }: Props) {
  const districtName = DISTRICTS_MSK.find((d) => d.id === me.district_id)?.name ?? '—';

  return (
    <div className="account-section-content">
      <DataRow label="Название" value={me.shop_name || '—'} />
      <DataRow label="Описание" value={me.description || '—'} />
      <DataRow label="Округ" value={districtName} />
      <DataRow label="Тип доставки" value={DELIVERY_LABELS[me.delivery_type || ''] || me.delivery_type || '—'} />
      <DataRow label="Стоимость доставки" value={me.delivery_price != null ? `${me.delivery_price} ₽` : '—'} />
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
