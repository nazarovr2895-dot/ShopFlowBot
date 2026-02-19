import type { ReactNode } from 'react';
import './FormField.css';

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  charCount?: number;
  maxChars?: number;
}

export function FormField({ label, hint, error, required, children, className = '', charCount, maxChars }: FormFieldProps) {
  return (
    <div className={`form-field ${error ? 'form-field--error' : ''} ${className}`}>
      <label className="form-field-label">
        {label}
        {required && <span className="form-field-required">*</span>}
      </label>
      {children}
      {charCount != null && maxChars != null && (
        <span className={`form-field-charcount${charCount > maxChars ? ' form-field-charcount--over' : ''}`}>
          {charCount} / {maxChars}
        </span>
      )}
      {hint && !error && <p className="form-field-hint">{hint}</p>}
      {error && <p className="form-field-error">{error}</p>}
    </div>
  );
}
