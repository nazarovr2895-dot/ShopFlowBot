import './Loader.css';

interface LoaderProps {
  size?: 'small' | 'medium' | 'large';
  centered?: boolean;
}

export function Loader({ size = 'medium', centered = false }: LoaderProps) {
  return (
    <div className={`loader ${centered ? 'loader--centered' : ''}`}>
      <div className={`loader__spinner loader__spinner--${size}`} />
    </div>
  );
}
