import type { ReactNode } from 'react';
import './DataRow.css';

interface DataRowProps {
  label: string;
  value: ReactNode;
  muted?: boolean;
  accent?: boolean;
}

export function DataRow({ label, value, muted, accent }: DataRowProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`data-row ${muted ? 'data-row--muted' : ''}`}>
      <span className="data-row-label">{label}</span>
      <span className={`data-row-value ${accent ? 'data-row-value--accent' : ''}`}>{value}</span>
    </div>
  );
}
