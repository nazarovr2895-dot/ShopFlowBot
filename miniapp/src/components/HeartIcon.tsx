import './HeartIcon.css';

interface HeartIconProps {
  isFavorite: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  size?: number;
}

export function HeartIcon({ isFavorite, onClick, className = '', size = 24 }: HeartIconProps) {
  return (
    <button
      type="button"
      className={`heart-icon ${isFavorite ? 'heart-icon--filled' : ''} ${className}`}
      onClick={onClick}
      aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
