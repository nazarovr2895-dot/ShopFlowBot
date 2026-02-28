import './Skeleton.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius,
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: borderRadius || 'var(--radius-sm)' }}
    />
  );
}

/** Full-page loading state with skeleton placeholders */
export function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <Skeleton width="200px" height="32px" />
      <div className="page-skeleton-grid">
        <Skeleton height="100px" />
        <Skeleton height="100px" />
        <Skeleton height="100px" />
      </div>
      <Skeleton height="300px" borderRadius="var(--radius-lg)" />
    </div>
  );
}
