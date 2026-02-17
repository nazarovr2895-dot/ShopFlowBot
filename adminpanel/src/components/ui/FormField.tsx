import type { ReactNode } from 'react';
import './FormField.css';

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, hint, error, required, children, className = '' }: FormFieldProps) {
  return (
    <div className={`form-field ${error ? 'form-field--error' : ''} ${className}`}>
      <label className="form-field-label">
        {label}
        {required && <span className="form-field-required">*</span>}
      </label>
      {children}
      {hint && !error && <p className="form-field-hint">{hint}</p>}
      {error && <p className="form-field-error">{error}</p>}
    </div>
  );
}
