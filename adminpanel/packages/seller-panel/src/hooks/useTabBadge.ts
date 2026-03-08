import { useEffect, useRef } from 'react';

const ORIGINAL_TITLE = document.title;

/**
 * Manages browser-tab visual indicator:
 * – Prepends "(N)" to document.title
 * – Draws a red dot on the favicon via Canvas
 */
export function useTabBadge(count: number) {
  const originalFaviconRef = useRef<string | null>(null);

  // Capture the original favicon href once
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) originalFaviconRef.current = link.href;
  }, []);

  useEffect(() => {
    // ── Title ──
    if (count > 0) {
      document.title = `(${count}) ${ORIGINAL_TITLE}`;
    } else {
      document.title = ORIGINAL_TITLE;
    }

    // ── Favicon ──
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const originalHref = originalFaviconRef.current;
    if (!link || !originalHref) return;

    if (count <= 0) {
      link.href = originalHref;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = originalHref;
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, size, size);

      // Red dot — top-right corner
      const r = 10;
      ctx.beginPath();
      ctx.arc(size - r - 2, r + 2, r, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      link.href = canvas.toDataURL('image/png');
    };

    return () => {
      // Clean up on count change
    };
  }, [count]);

  // Restore everything on unmount
  useEffect(() => {
    return () => {
      document.title = ORIGINAL_TITLE;
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link && originalFaviconRef.current) {
        link.href = originalFaviconRef.current;
      }
    };
  }, []);
}
