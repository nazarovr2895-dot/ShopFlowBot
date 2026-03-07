/**
 * Lightweight analytics tracker for Mini App.
 * Buffers events and flushes them to POST /public/track every 5 seconds.
 * Fire-and-forget: errors are silently ignored.
 */
import { getApiBaseUrl } from '../api/client';

interface TrackEvent {
  event_type: 'app_open' | 'shop_view' | 'product_view';
  seller_id?: number;
  product_id?: number;
}

const SESSION_KEY = 'flurai_analytics_session';
const FLUSH_INTERVAL = 5000;

let sessionId: string | null = null;
let buffer: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const sent = new Set<string>();

function getSessionId(): string {
  if (sessionId) return sessionId;
  if (typeof window !== 'undefined') {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  }
  return sessionId || 'unknown';
}

function dedupeKey(ev: TrackEvent): string {
  return `${ev.event_type}_${ev.seller_id ?? ''}_${ev.product_id ?? ''}`;
}

function enqueue(ev: TrackEvent): void {
  const key = dedupeKey(ev);
  if (sent.has(key)) return;
  sent.add(key);
  buffer.push(ev);
  ensureFlushTimer();
}

function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
}

function flush(): void {
  if (buffer.length === 0) return;
  const events = buffer.splice(0, 50);
  const body = JSON.stringify({
    session_id: getSessionId(),
    events,
  });
  const url = `${getApiBaseUrl()}/public/track`;
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

// Flush on page hide (user switches tabs or closes)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// --- Public API ---

export function trackAppOpen(): void {
  enqueue({ event_type: 'app_open' });
}

export function trackShopView(sellerId: number): void {
  enqueue({ event_type: 'shop_view', seller_id: sellerId });
}

export function trackProductView(sellerId: number, productId: number): void {
  enqueue({ event_type: 'product_view', seller_id: sellerId, product_id: productId });
}
