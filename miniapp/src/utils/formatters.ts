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

/** Strip phone/name lines from address (they were concatenated during checkout) */
export function formatDeliveryAddress(address: string | null): string {
  if (!address) return '\u2014';
  return address
    .split('\n')
    .filter(line => !line.startsWith('\u{1F4DE}') && !line.startsWith('\u{1F464}'))
    .join('\n')
    .trim() || '\u2014';
}
