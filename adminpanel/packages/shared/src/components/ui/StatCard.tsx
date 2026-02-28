import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import './StatCard.css';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { value: number; direction: 'up' | 'down' };
  link?: { to: string; label: string };
  accent?: boolean;
}

export function StatCard({ label, value, trend, link, accent }: StatCardProps) {
  return (
    <div className={`stat-card ${accent ? 'stat-card--accent' : ''}`}>
      <span className="stat-card-label">{label}</span>
      <div className="stat-card-row">
        <span className="stat-card-value">{value}</span>
        {trend && (
          <span className={`stat-card-trend stat-card-trend--${trend.direction}`}>
            {trend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trend.value}%
          </span>
        )}
      </div>
      {link && (
        <Link to={link.to} className="stat-card-link">{link.label}</Link>
      )}
    </div>
  );
}
