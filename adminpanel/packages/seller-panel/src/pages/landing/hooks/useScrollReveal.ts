import { useEffect, useRef, useCallback } from 'react';

/**
 * Хук для scroll-reveal анимаций.
 * Ставит data-visible="true" на элемент при появлении в viewport.
 * CSS делает всё остальное через селектор [data-visible="true"].
 */
export function useScrollReveal(options?: { threshold?: number; rootMargin?: string }) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Set<HTMLElement>>(new Set());

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = 'true';
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      {
        threshold: options?.threshold ?? 0.15,
        rootMargin: options?.rootMargin ?? '-40px',
      }
    );

    // Observe already-registered elements
    elementsRef.current.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [options?.threshold, options?.rootMargin]);

  const revealRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    elementsRef.current.add(el);
    observerRef.current?.observe(el);
  }, []);

  return revealRef;
}
