import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import './ActionCard.css';

interface ActionCardProps {
  to: string;
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function ActionCard({ to, icon, title, description }: ActionCardProps) {
  return (
    <Link to={to} className="action-card">
      {icon && <div className="action-card-icon">{icon}</div>}
      <div className="action-card-body">
        <span className="action-card-title">{title}</span>
        {description && <span className="action-card-desc">{description}</span>}
      </div>
      <ChevronRight size={16} className="action-card-arrow" />
    </Link>
  );
}
