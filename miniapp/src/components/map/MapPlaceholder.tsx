import './Map.css';

interface Props {
  height?: number | string;
  error?: boolean;
  onRetry?: () => void;
}

export function MapPlaceholder({ height = 300, error, onRetry }: Props) {
  return (
    <div className="map-placeholder" style={{ height }}>
      {error ? (
        <>
          <div className="map-placeholder__icon map-placeholder__icon--error">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <span className="map-placeholder__text">Не удалось загрузить карту</span>
          {onRetry && (
            <button className="map-placeholder__retry" onClick={onRetry}>
              Попробовать снова
            </button>
          )}
        </>
      ) : (
        <>
          <div className="map-placeholder__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </div>
          <span className="map-placeholder__text">Загрузка карты...</span>
        </>
      )}
    </div>
  );
}
