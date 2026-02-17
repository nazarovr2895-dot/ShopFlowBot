import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import './ConfirmDialog.css';

/* ── Types ───────────────────────────────────────────────── */

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

/* ── Context ─────────────────────────────────────────────── */

const ConfirmContext = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => setState({ opts, resolve }));
  }, []);

  const handleChoice = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="confirm-overlay" onClick={() => handleChoice(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            {state.opts.title && <h3 className="confirm-title">{state.opts.title}</h3>}
            <p className="confirm-message">{state.opts.message}</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => handleChoice(false)}>
                {state.opts.cancelLabel || 'Отмена'}
              </button>
              <button
                className={`btn ${state.opts.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => handleChoice(true)}
                autoFocus
              >
                {state.opts.confirmLabel || 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────────── */

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
