import './Map.css';

interface DeliveryZone {
  id: number;
  name: string;
  district_ids: number[];
  delivery_price: number;
  free_delivery_from: number | null;
  is_active: boolean;
}

interface Props {
  zones: DeliveryZone[];
}

/**
 * Delivery zone text legend (shown below map).
 * Full polygon visualization requires Yandex Geocoder boundary data
 * which will be added in a future iteration.
 */
export function DeliveryZoneOverlay({ zones }: Props) {
  if (!zones.length) return null;

  return (
    <div style={{ padding: '8px 0' }}>
      {zones.filter(z => z.is_active).map(zone => (
        <div key={zone.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          fontSize: 13,
          color: 'var(--tg-theme-text-color, #000)',
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: zone.delivery_price === 0 ? '#34c759' : '#ff9500',
            flexShrink: 0,
          }} />
          <span style={{ flex: 1 }}>{zone.name}</span>
          <span style={{ color: 'var(--tg-theme-hint-color, #999)' }}>
            {zone.delivery_price === 0
              ? 'Бесплатно'
              : `${zone.delivery_price} ₽`}
          </span>
        </div>
      ))}
    </div>
  );
}
