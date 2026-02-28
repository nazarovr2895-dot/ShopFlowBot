import type { ReactNode, HTMLAttributes } from 'react';
import './Card.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'default' | 'lg';
}

export function Card({ children, padding = 'default', className = '', ...rest }: CardProps) {
  return (
    <div className={`ui-card ui-card--pad-${padding} ${className}`} {...rest}>
      {children}
    </div>
  );
}
