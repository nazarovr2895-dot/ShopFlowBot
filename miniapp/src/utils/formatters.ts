/**
 * Shared formatting utilities for miniapp.
 */

const priceFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

/** Format a number as Russian Ruble price. */
export function formatPrice(n: number): string {
  return priceFormatter.format(n);
}

/** Strip product IDs and @price from items_info: "123:Розы@8000.0 x 2" → "Розы x 2" */
export function parseItemsDisplay(itemsInfo: string): string {
  return itemsInfo.replace(/\d+:/g, '').replace(/@[\d.]+/g, '');
}

export interface ParsedOrderItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

/** Parse items_info into structured data: "123:Розы@150.00 x 2" → [{ productId: 123, name: "Розы", price: 150, quantity: 2 }] */
export function parseItemsStructured(itemsInfo: string): ParsedOrderItem[] {
  if (!itemsInfo || !itemsInfo.trim()) return [];

  return itemsInfo.split(',').map((segment) => {
    const trimmed = segment.trim();
    // New format: ID:Name@Price x Qty
    const match = trimmed.match(/^(\d+):(.+?)@([\d.]+)\s*x\s*(\d+)$/);
    if (match) {
      return {
        productId: parseInt(match[1], 10),
        name: match[2].trim(),
        price: parseFloat(match[3]),
        quantity: parseInt(match[4], 10),
      };
    }
    // Legacy format: ID:Name x Qty (no price)
    const legacyMatch = trimmed.match(/^(\d+):(.+?)\s*x\s*(\d+)$/);
    if (legacyMatch) {
      return {
        productId: parseInt(legacyMatch[1], 10),
        name: legacyMatch[2].trim(),
        price: 0,
        quantity: parseInt(legacyMatch[3], 10),
      };
    }
    // Fallback
    return {
      productId: 0,
      name: trimmed.replace(/\d+:/g, '').replace(/@[\d.]+/g, '').replace(/\s*x\s*\d+$/, '').trim(),
      price: 0,
      quantity: 1,
    };
  }).filter((item) => item.name.length > 0);
}

/** Strip phone/name lines from address (they were concatenated during checkout) */
export function formatDeliveryAddress(address: string | null): string {
  if (!address) return '\u2014';
  return address
    .split('\n')
    .filter(line => !line.startsWith('\u{1F4DE}') && !line.startsWith('\u{1F464}'))
    .join('\n')
    .trim() || '\u2014';
}
