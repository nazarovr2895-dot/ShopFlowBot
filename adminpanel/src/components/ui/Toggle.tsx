import './Toggle.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className={`ui-toggle ${disabled ? 'ui-toggle--disabled' : ''}`}>
      <button
        role="switch"
        aria-checked={checked}
        className={`ui-toggle-track ${checked ? 'ui-toggle-track--on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="ui-toggle-thumb" />
      </button>
      {label && <span className="ui-toggle-label">{label}</span>}
    </label>
  );
}
