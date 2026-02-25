import './Map.css';

interface Props {
  height?: number | string;
}

export function MapPlaceholder({ height = 300 }: Props) {
  return (
    <div className="map-placeholder" style={{ height }}>
      <div className="map-placeholder__icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      </div>
      <span className="map-placeholder__text">Загрузка карты...</span>
    </div>
  );
}
