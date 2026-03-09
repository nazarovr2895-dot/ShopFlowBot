import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import './ThemeToggle.css';

export function ThemeToggle({ size = 18 }: { size?: number }) {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
    >
      {theme === 'light' ? <Moon size={size} /> : <Sun size={size} />}
    </button>
  );
}
