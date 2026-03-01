/**
 * Shared phone number utilities for miniapp.
 */

const PHONE_PREFIX = '+7 ';

/** Normalize phone to 11-digit format starting with 7. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let normalized = digits.startsWith('8')
    ? '7' + digits.slice(1)
    : digits.startsWith('7')
      ? digits
      : '7' + digits;
  return normalized.slice(0, 11);
}

/** Format phone for display: "79001234567" → "+7 900 123 45 67" */
export function formatPhoneForDisplay(phone: string | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  const rest = digits.startsWith('7') ? digits.slice(1) : digits;
  const parts = [
    rest.slice(0, 3),
    rest.slice(3, 6),
    rest.slice(6, 8),
    rest.slice(8, 10),
  ].filter(Boolean);
  return parts.length > 0 ? PHONE_PREFIX + parts.join(' ') : '';
}
