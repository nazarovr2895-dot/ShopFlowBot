import { useState, useEffect, useRef } from 'react';

/**
 * Хук для анимации счётчика от 0 до target.
 * Запускается когда isVisible = true.
 */
export function useAnimatedCounter(target: number, isVisible: boolean, duration = 1500): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!isVisible || target === 0) return;

    const start = performance.now();

    function easeOutExpo(t: number): number {
      return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [isVisible, target, duration]);

  return value;
}
