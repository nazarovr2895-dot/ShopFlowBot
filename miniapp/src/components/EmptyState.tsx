import './EmptyState.css';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  /** Use 'shops' for the flower shop + vase illustration */
  illustration?: 'shops' | 'default';
}

function ShopsEmptyIllustration() {
  return (
    <svg
      className="empty-state__illustration empty-state__illustration--shops"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Shop outline (storefront) */}
      <path
        d="M20 80 L20 140 L180 140 L180 80 L160 60 L160 40 L40 40 L40 60 Z"
        stroke="var(--empty-shop-stroke, #5b4d7a)"
        strokeWidth="2"
        fill="none"
      />
      <path d="M70 40 L70 60 M130 40 L130 60" stroke="var(--empty-shop-stroke, #5b4d7a)" strokeWidth="1.5" />
      {/* Awning */}
      <path d="M30 60 L100 35 L170 60" stroke="var(--empty-shop-stroke, #5b4d7a)" strokeWidth="1.5" fill="none" />
      {/* Vase */}
      <path
        d="M85 95 L75 130 L125 130 L115 95 Z"
        stroke="var(--empty-vase-stroke, #6b7fb5)"
        strokeWidth="1.5"
        fill="rgba(107, 127, 181, 0.2)"
      />
      {/* Reflection on vase */}
      <path d="M90 100 L90 125" stroke="rgba(150, 180, 220, 0.5)" strokeWidth="1" strokeLinecap="round" />
      {/* Flowers */}
      <ellipse cx="100" cy="75" rx="18" ry="22" fill="#7c5cbf" opacity="0.9" />
      <ellipse cx="88" cy="72" rx="10" ry="14" fill="#5b4d7a" />
      <ellipse cx="112" cy="78" rx="9" ry="12" fill="#6d5b8a" />
      <ellipse cx="95" cy="65" rx="8" ry="10" fill="#8b6cb5" />
      <ellipse cx="100" cy="88" rx="6" ry="8" fill="#4a7c59" />
      <ellipse cx="92" cy="85" rx="5" ry="6" fill="#5b8a6a" />
      <circle cx="105" cy="70" r="4" fill="#3d5a7a" />
      <circle cx="98" cy="82" r="3" fill="#4a6b7a" />
    </svg>
  );
}

export function EmptyState({ title, description, icon = '🔍', illustration }: EmptyStateProps) {
  const showShopsIllustration = illustration === 'shops';

  return (
    <div className="empty-state">
      {showShopsIllustration ? (
        <ShopsEmptyIllustration />
      ) : (
        <span className="empty-state__icon">{icon}</span>
      )}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__description">{description}</p>}
    </div>
  );
}
