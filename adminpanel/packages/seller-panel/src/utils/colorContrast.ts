function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastColors(bgHex: string): {
  text: string;
  textSecondary: string;
  surface: string;
} {
  const lum = relativeLuminance(bgHex);
  if (lum > 0.5) {
    return { text: '#000000', textSecondary: '#666666', surface: 'rgba(0,0,0,0.05)' };
  }
  return { text: '#ffffff', textSecondary: '#999999', surface: 'rgba(255,255,255,0.1)' };
}
