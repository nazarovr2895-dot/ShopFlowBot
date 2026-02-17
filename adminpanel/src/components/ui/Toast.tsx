import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './Toast.css';

/* ── Types ───────────────────────────────────────────────── */

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastCtx {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

/* ── Context ─────────────────────────────────────────────── */

const ToastContext = createContext<ToastCtx | null>(null);

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctx: ToastCtx = {
    success: (msg) => push('success', msg),
    error: (msg) => push('error', msg, 6000),
    warning: (msg) => push('warning', msg, 5000),
    info: (msg) => push('info', msg),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── Single toast ────────────────────────────────────────── */

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div className={`toast toast--${item.type}`} role="alert">
      <span className="toast-message">{item.message}</span>
      <button className="toast-close" onClick={() => onDismiss(item.id)} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Hook ────────────────────────────────────────────────── */

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
