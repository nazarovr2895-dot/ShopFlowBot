import { useYmaps } from './YandexMapProvider';
import type { SellerGeoItem } from '../../types';
import './Map.css';

interface Props {
  seller: SellerGeoItem;
  onClick: (seller: SellerGeoItem) => void;
}

export function SellerMarker({ seller, onClick }: Props) {
  const ymaps = useYmaps();
  if (!ymaps || !seller.geo_lat || !seller.geo_lon) return null;

  const { YMapMarker } = ymaps;
  const color = seller.metro_line_color || '#3390ec';

  return (
    <YMapMarker coordinates={[seller.geo_lon, seller.geo_lat]}>
      <div
        className="seller-marker"
        style={{ background: color }}
        onClick={() => onClick(seller)}
        title={seller.shop_name || ''}
      >
        <div className="seller-marker__inner" />
      </div>
    </YMapMarker>
  );
}
