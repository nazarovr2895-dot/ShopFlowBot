import { useState, useEffect } from 'react';

const RESERVATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ReservationTimerResult {
  remainingSeconds: number;
  formattedTime: string;
  hasExpired: boolean;
  isWarning: boolean;
}

function computeRemaining(reservedAt: string | null | undefined): number {
  if (!reservedAt) return 0;
  // Backend sends UTC datetime without 'Z' suffix — add it
  const isoStr = reservedAt.endsWith('Z') ? reservedAt : reservedAt + 'Z';
  const reservedTime = new Date(isoStr).getTime();
  const expiryTime = reservedTime + RESERVATION_TTL_MS;
  const now = Date.now();
  return Math.max(0, Math.floor((expiryTime - now) / 1000));
}

export function useReservationTimer(reservedAt: string | null | undefined): ReservationTimerResult {
  const [remaining, setRemaining] = useState<number>(() => computeRemaining(reservedAt));

  useEffect(() => {
    if (!reservedAt) {
      setRemaining(0);
      return;
    }
    setRemaining(computeRemaining(reservedAt));
    const interval = setInterval(() => {
      const r = computeRemaining(reservedAt);
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [reservedAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return {
    remainingSeconds: remaining,
    formattedTime: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    hasExpired: remaining <= 0,
    isWarning: remaining > 0 && remaining <= 60,
  };
}

export { computeRemaining };
