/**
 * Shared formatting utilities — deduplicated from 5+ files.
 */

const CURRENCY_FORMATTER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const CURRENCY_PRECISE_FORMATTER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/* ── Date ────────────────────────────────────────────────── */

/** Format ISO date → "01.02.2025" */
export function formatDateShort(iso?: string | null): string {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Format ISO date → "01.02.2025, 14:30" */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ── Phone ───────────────────────────────────────────────── */

/** Format stored phone → "+7 999 123 45 67" (display only) */
export function formatPhone(phone?: string | null): string {
  if (!phone) return '\u2014';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return phone;
}

/** Live-format phone input as user types → "+7 999 123 45 67" */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let num = digits;
  if (num.startsWith('8')) num = '7' + num.slice(1);
  else if (!num.startsWith('7')) num = '7' + num;
  num = num.slice(0, 11);
  if (num.length <= 1) return '+7';
  if (num.length <= 4) return `+7 ${num.slice(1)}`;
  if (num.length <= 7) return `+7 ${num.slice(1, 4)} ${num.slice(4)}`;
  if (num.length <= 9) return `+7 ${num.slice(1, 4)} ${num.slice(4, 7)} ${num.slice(7)}`;
  return `+7 ${num.slice(1, 4)} ${num.slice(4, 7)} ${num.slice(7, 9)} ${num.slice(9, 11)}`;
}

/** Strip display phone → "79991234567" (for API) */
export function phoneToDigits(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.startsWith('8')) return '7' + digits.slice(1, 11);
  if (digits.startsWith('7')) return digits.slice(0, 11);
  return ('7' + digits).slice(0, 11);
}

/* ── Currency ────────────────────────────────────────────── */

/** Format number → "1 234 ₽" */
export function formatCurrency(value: number, precise = false): string {
  const formatter = precise ? CURRENCY_PRECISE_FORMATTER : CURRENCY_FORMATTER;
  return `${formatter.format(value)} \u20BD`;
}

/* ── Orders ──────────────────────────────────────────────── */

/** Format items_info string for display (e.g. "1:Rose@8000.0 x2" → "Rose × 2") */
export function formatItemsInfo(itemsInfo: string): string {
  return itemsInfo
    .replace(/\d+:/g, '')       // убрать ID товара "123:"
    .replace(/@[\d.]+/g, '')    // убрать цену "@8000.0"
    .replace(/x\s*/g, ' \u00D7 ');
}

/** Parse items_info into structured array with product IDs for clickable links */
export function parseItemsInfo(itemsInfo: string): Array<{ id: number | null; name: string; qty: string }> {
  // format: "123:Rose@8000.0 x 2, 456:Tulip@5200.0 x 1"
  // legacy: "Rose x 2, Tulip x 1"
  return itemsInfo.split(',').map(part => {
    const trimmed = part.trim();
    const idMatch = trimmed.match(/^(\d+):/);
    const id = idMatch ? parseInt(idMatch[1], 10) : null;
    const withoutId = trimmed.replace(/^\d+:/, '');
    const withoutPrice = withoutId.replace(/@[\d.]+/, '');
    const [name, qty] = withoutPrice.split(/\s*x\s*/i);
    return { id, name: name.trim(), qty: qty?.trim() || '1' };
  });
}

/** Strip phone/name lines from concatenated address */
export function formatAddress(address?: string | null): string {
  if (!address) return '\u2014';
  return address
    .split('\n')
    .filter(line => !line.startsWith('\u{1F4DE}') && !line.startsWith('\u{1F464}'))
    .join(', ')
    .trim() || '\u2014';
}

/** Calculate days until a target date */
export function getDaysUntil(dateStr: string): {
  days: number;
  label: string;
  className: string;
} {
  const target = new Date(dateStr);
  const now = new Date();
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = targetDate.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0)
    return { days, label: `${Math.abs(days)} \u0434\u043D. \u043D\u0430\u0437\u0430\u0434`, className: 'waiting-countdown waiting-countdown--overdue' };
  if (days === 0)
    return { days, label: '\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u2014 \u0433\u043E\u0442\u043E\u0432 \u043A \u0441\u0431\u043E\u0440\u043A\u0435!', className: 'waiting-countdown waiting-countdown--today' };
  if (days === 1)
    return { days, label: '\u0417\u0430\u0432\u0442\u0440\u0430!', className: 'waiting-countdown waiting-countdown--tomorrow' };
  return { days, label: `\u0447\u0435\u0440\u0435\u0437 ${days} \u0434\u043D.`, className: 'waiting-countdown' };
}
