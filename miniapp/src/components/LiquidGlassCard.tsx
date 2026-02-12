import { useRef, MouseEvent, ReactNode } from 'react';
import './LiquidGlassCard.css';

interface LiquidGlassCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function LiquidGlassCard({ children, className = '', style }: LiquidGlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    // Reset to center when mouse leaves
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty('--mouse-x', `${rect.width / 2}px`);
    cardRef.current.style.setProperty('--mouse-y', `${rect.height / 2}px`);
  };

  return (
    <>
      {/* SVG filter definition for displacement effect */}
      <svg className="liquid-glass-svg-defs" aria-hidden="true">
        <defs>
          <filter id="liquid-glass-displacement" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="4"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="2"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      
      <div
        ref={cardRef}
        className={`liquid-glass-card ${className}`}
        style={style}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
    </>
  );
}
