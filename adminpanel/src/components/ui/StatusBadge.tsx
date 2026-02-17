import './StatusBadge.css';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface StatusBadgeProps {
  children: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'default';
}

export function StatusBadge({ children, variant = 'neutral', size = 'default' }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${variant} status-badge--${size}`}>
      {children}
    </span>
  );
}
